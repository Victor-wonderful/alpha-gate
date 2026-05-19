import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseService } from "@/lib/supabase/service";
import { fetchKlines } from "@/lib/analysis/binance";
import { dispatch } from "@/lib/notify-dispatch";

export const dynamic = "force-dynamic";

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
  stop: number;
  target: number;
  created_at: string;
}

interface Resolution {
  exitPrice: number;
  resultR: number;
  exitReason: "target" | "stop";
  closedAt: string;
}

function resolveTrade(
  trade: Pick<OpenTrade, "entry" | "stop" | "target" | "direction">,
  candles: Array<{ high: number; low: number; closeTime: number }>,
): Resolution | null {
  const { entry, stop, target, direction } = trade;
  const stopDist = Math.abs(entry - stop);
  if (stopDist === 0) return null;

  for (const c of candles) {
    if (direction === "long") {
      const targetHit = c.high >= target;
      const stopHit = c.low <= stop;
      // Conservative: if both touched in same bar, assume stop first.
      if (stopHit) {
        return { exitPrice: stop, resultR: -1, exitReason: "stop", closedAt: new Date(c.closeTime).toISOString() };
      }
      if (targetHit) {
        const r = (target - entry) / stopDist;
        return { exitPrice: target, resultR: r, exitReason: "target", closedAt: new Date(c.closeTime).toISOString() };
      }
    } else {
      const targetHit = c.low <= target;
      const stopHit = c.high >= stop;
      if (stopHit) {
        return { exitPrice: stop, resultR: -1, exitReason: "stop", closedAt: new Date(c.closeTime).toISOString() };
      }
      if (targetHit) {
        const r = (entry - target) / stopDist;
        return { exitPrice: target, resultR: r, exitReason: "target", closedAt: new Date(c.closeTime).toISOString() };
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
    .select("id, user_id, symbol, direction, timeframe, entry, stop, target, created_at, mode")
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
        { entry: t.entry, stop: t.stop, target: t.target, direction: t.direction },
        candles,
      );
      if (!resolution) {
        results.push({ id: t.id, note: "pending" });
        continue;
      }

      const { error: upErr } = await svc
        .from("trades")
        .update({
          exit_price: resolution.exitPrice,
          result_r: resolution.resultR,
          exit_reason: resolution.exitReason,
          closed_at: resolution.closedAt,
          note: `자동 정산: ${resolution.exitReason === "target" ? "목표 도달" : "손절 적중"}`,
        })
        .eq("id", t.id)
        .is("closed_at", null);

      if (upErr) {
        errors++;
        results.push({ id: t.id, note: `db error: ${upErr.message}` });
        continue;
      }

      resolved++;
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
