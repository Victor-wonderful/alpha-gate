import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseService } from "@/lib/supabase/service";
import { fetchKlines } from "@/lib/analysis/binance";
import { dispatch } from "@/lib/notify-dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Map trade timeframe to Binance interval + max bars to scan on each run.
// We fetch from the trade's created_at to now. To keep things bounded we cap
// at TIMEOUT_MS per timeframe — beyond which the trade is considered stale
// and skipped (user can close it manually).
type TF = "15m" | "1h" | "4h" | "1D";

const INTERVAL_MAP: Record<TF, "15m" | "1h" | "4h" | "1d"> = {
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1D": "1d",
};

const TIMEOUT_MS: Record<TF, number> = {
  "15m": 2 * 24 * 60 * 60_000, // 48h
  "1h": 7 * 24 * 60 * 60_000, // 7d
  "4h": 14 * 24 * 60 * 60_000, // 14d
  "1D": 30 * 24 * 60 * 60_000, // 30d
};

interface OpenTrade {
  id: string;
  user_id: string;
  symbol: string;
  direction: "long" | "short";
  timeframe: TF;
  entry: number;
  /** Actual simulated fill price (paper) or actual filled price (live). May be null on older rows. */
  entry_actual: number | null;
  stop: number;
  target: number;
  /** Round-trip fee % applied at save time. Defaults to 0.12 if missing. */
  fees_pct: number | null;
  position_quantity: number | null;
  paper_margin: number | null;
  is_paper: boolean | null;
  created_at: string;
}

interface Resolution {
  exitPrice: number;
  exitActual: number;
  resultR: number;
  exitReason: "target" | "stop";
  closedAt: string;
}

/** Compute the realized R using the actual fill price (entry_actual) and
 *  subtracting round-trip fees expressed in R units.
 *  Returns null if the candles never touched either side. */
function resolveTrade(
  trade: Pick<OpenTrade, "entry_actual" | "entry" | "stop" | "target" | "direction" | "fees_pct">,
  candles: Array<{ high: number; low: number; closeTime: number }>,
): Resolution | null {
  // entryActual falls back to user-typed entry for legacy rows.
  const entryActual = trade.entry_actual ?? trade.entry;
  const { stop, target, direction } = trade;
  const stopDist = Math.abs(entryActual - stop);
  if (stopDist === 0) return null;

  // Fees expressed in R units: feePct% of entry / risk-per-unit
  const feesPct = trade.fees_pct ?? 0.12;
  const feesR = (entryActual * (feesPct / 100)) / stopDist;

  for (const c of candles) {
    if (direction === "long") {
      const targetHit = c.high >= target;
      const stopHit = c.low <= stop;
      // Conservative: if both touched in same bar, assume stop first.
      if (stopHit) {
        const exitActual = stop;
        const grossR = (exitActual - entryActual) / stopDist; // negative
        const netR = grossR - feesR;
        return { exitPrice: stop, exitActual, resultR: netR, exitReason: "stop", closedAt: new Date(c.closeTime).toISOString() };
      }
      if (targetHit) {
        const exitActual = target;
        const grossR = (exitActual - entryActual) / stopDist;
        const netR = grossR - feesR;
        return { exitPrice: target, exitActual, resultR: netR, exitReason: "target", closedAt: new Date(c.closeTime).toISOString() };
      }
    } else {
      const targetHit = c.low <= target;
      const stopHit = c.high >= stop;
      if (stopHit) {
        const exitActual = stop;
        const grossR = (entryActual - exitActual) / stopDist; // negative
        const netR = grossR - feesR;
        return { exitPrice: stop, exitActual, resultR: netR, exitReason: "stop", closedAt: new Date(c.closeTime).toISOString() };
      }
      if (targetHit) {
        const exitActual = target;
        const grossR = (entryActual - exitActual) / stopDist;
        const netR = grossR - feesR;
        return { exitPrice: target, exitActual, resultR: netR, exitReason: "target", closedAt: new Date(c.closeTime).toISOString() };
      }
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const svc = getSupabaseService();
  const { data: openTrades, error } = await svc
    .from("trades")
    .select(
      "id, user_id, symbol, direction, timeframe, entry, entry_actual, stop, target, fees_pct, position_quantity, paper_margin, is_paper, created_at, mode",
    )
    .is("closed_at", null)
    .neq("mode", "backtest")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!openTrades || openTrades.length === 0) return NextResponse.json({ checked: 0, resolved: 0 });

  let resolved = 0;
  let stale = 0;
  let errors = 0;
  const results: Array<{ id: string; exitReason?: string; resultR?: number; note?: string }> = [];

  for (const raw of openTrades) {
    const t = raw as OpenTrade & { mode?: string | null };
    const tf = t.timeframe as TF;
    if (!INTERVAL_MAP[tf]) continue;

    const createdMs = new Date(t.created_at).getTime();
    const ageMs = Date.now() - createdMs;
    if (ageMs > TIMEOUT_MS[tf]) {
      stale++;
      results.push({ id: t.id, note: "stale (timeout)" });
      continue;
    }

    try {
      // Fetch candles starting just before created_at to "now"
      const candles = await fetchKlines(t.symbol, INTERVAL_MAP[tf], 1000, {
        startTime: createdMs - 60_000, // small buffer in case of clock skew
      });
      if (!candles || candles.length === 0) {
        results.push({ id: t.id, note: "no candles" });
        continue;
      }
      const resolution = resolveTrade(
        {
          entry: t.entry,
          entry_actual: t.entry_actual,
          stop: t.stop,
          target: t.target,
          direction: t.direction,
          fees_pct: t.fees_pct,
        },
        candles,
      );
      if (!resolution) {
        results.push({ id: t.id, note: "pending" });
        continue;
      }

      // Compute realized PnL in USDT for paper wallet settlement.
      const entryActualNum = Number(t.entry_actual ?? t.entry);
      const feesPctNum = Number(t.fees_pct ?? 0.12);
      const qty = Number(t.position_quantity ?? 0);
      const realizedPnl =
        t.direction === "long"
          ? (resolution.exitActual - entryActualNum) * qty - (entryActualNum * (feesPctNum / 100)) * qty
          : (entryActualNum - resolution.exitActual) * qty - (entryActualNum * (feesPctNum / 100)) * qty;

      const { error: upErr } = await svc
        .from("trades")
        .update({
          exit_price: resolution.exitPrice,
          exit_actual: resolution.exitActual,
          result_r: resolution.resultR,
          exit_reason: resolution.exitReason,
          closed_at: resolution.closedAt,
          paper_realized_pnl: t.is_paper ? realizedPnl : null,
          note: `자동 정산: ${resolution.exitReason === "target" ? "목표 도달" : "손절 적중"} (수수료 차감 후 ${resolution.resultR.toFixed(2)}R)`,
        })
        .eq("id", t.id)
        .is("closed_at", null);

      if (upErr) {
        errors++;
        results.push({ id: t.id, note: `db error: ${upErr.message}` });
        continue;
      }

      resolved++;

      // Paper wallet settle: release margin and credit/debit USDT PnL.
      if (t.is_paper && t.paper_margin != null) {
        const { settleMargin } = await import("@/lib/paper-wallet");
        await settleMargin({
          userId: t.user_id,
          margin: Number(t.paper_margin),
          realizedPnl,
          tradeId: t.id,
        });
      }
      results.push({ id: t.id, exitReason: resolution.exitReason, resultR: Number(resolution.resultR.toFixed(2)) });

      // Best-effort notification — d_grade_warn used as generic channel
      try {
        await dispatch(t.user_id, "ai_coach_done", {
          title: resolution.exitReason === "target" ? "🎯 거래 목표 도달 (자동 정산)" : "✕ 거래 손절 (자동 정산)",
          body: `${t.symbol} ${t.direction === "long" ? "롱" : "숏"} · 결과 ${resolution.resultR >= 0 ? "+" : ""}${resolution.resultR.toFixed(2)}R`,
          tradeId: t.id,
        });
      } catch {
        // ignore notification failures
      }
    } catch (e) {
      errors++;
      results.push({ id: t.id, note: `fetch error: ${e instanceof Error ? e.message : "unknown"}` });
    }
  }

  return NextResponse.json({
    checked: openTrades.length,
    resolved,
    stale,
    errors,
    results,
  });
}
