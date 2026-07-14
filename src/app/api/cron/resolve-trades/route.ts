import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseService } from "@/lib/supabase/service";
import { fetchKlines, fetchTicker24h } from "@/lib/analysis/binance";
import { dispatch } from "@/lib/notify-dispatch";
import { settleMargin } from "@/lib/paper-wallet";

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

// 스타일별 만료 시간 — "50~100봉 안에 결판날 것" 가정으로 조정.
// 15m 24h: 96봉 (4일이면 이미 day급이 됨)
// 1h 4d: 96봉 (1주는 너무 길어 1h 셋업이 무효화됨)
// 데이 1d·스윙 5d: 데이터상 해결은 하루 안 — 백스톱은 짧게(펀딩·위험예산 절약).
// 1D 60d: 포지션(→DCA 예정). UI POSITION_TIMEOUT_MS 와 반드시 동일하게 유지.
const TIMEOUT_MS: Record<TF, number> = {
  "15m": 24 * 60 * 60_000, // 24h (스캘프)
  "1h": 24 * 60 * 60_000, // 1d (데이 — 당일 청산)
  "4h": 5 * 24 * 60 * 60_000, // 5d (스윙)
  "1D": 60 * 24 * 60 * 60_000, // 60d (포지션→DCA)
};

/** 1차 경고 시점 (만료 D-N) — 사용자가 차분히 결정할 수 있는 텀 */
const WARN_FIRST_MS: Record<TF, number> = {
  "15m": 3 * 60 * 60_000, // D-3h
  "1h": 12 * 60 * 60_000, // D-12h
  "4h": 24 * 60 * 60_000, // D-24h
  "1D": 72 * 60 * 60_000, // D-3d
};

/** 2차(마지막) 경고 시점 — 모든 스타일 공통 D-1h */
const WARN_FINAL_MS = 60 * 60_000;

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
  /** 실제 체결 시각. 예약주문은 체결까지 대기하므로 created_at 보다 늦다. null이면 created_at 사용(레거시/시장가). */
  filled_at: string | null;
  /** 사용자가 +24h 연장 시 갱신되는 절대 만료시각. null이면 created_at + TIMEOUT_MS 적용. */
  extended_until: string | null;
  expiry_warned_first_at: string | null;
  expiry_warned_final_at: string | null;
  market_type: "futures" | "spot" | null;
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
      "id, user_id, symbol, direction, timeframe, entry, entry_actual, stop, target, fees_pct, position_quantity, paper_margin, is_paper, created_at, filled_at, mode, extended_until, expiry_warned_first_at, expiry_warned_final_at, market_type",
    )
    .is("closed_at", null)
    .neq("mode", "backtest")
    // 실제 진입(체결)된 거래만 청산. 미체결 예약 주문(order_status='pending')이나
    // 취소/만료된 주문은 포지션이 없으므로 손절/목표 정산 대상이 아니다.
    // (시장가 즉시 진입·filler 체결 모두 order_status='filled')
    .eq("order_status", "filled")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!openTrades || openTrades.length === 0) return NextResponse.json({ checked: 0, resolved: 0 });

  let resolved = 0;
  let autoClosed = 0;
  let warned = 0;
  let errors = 0;
  const results: Array<{ id: string; exitReason?: string; resultR?: number; note?: string }> = [];

  for (const raw of openTrades) {
    const t = raw as OpenTrade & { mode?: string | null };
    const tf = t.timeframe as TF;
    if (!INTERVAL_MAP[tf]) continue;

    const createdMs = new Date(t.created_at).getTime();
    const now = Date.now();
    const ageMs = now - createdMs;

    // 절대 만료 시각: extended_until 이 있으면 그것을, 없으면 created_at + TIMEOUT
    // 현물은 만료/경고 적용 안 함 (영구 보유 가능)
    const isSpot = t.market_type === "spot";
    const expiryMs = t.extended_until
      ? new Date(t.extended_until).getTime()
      : createdMs + TIMEOUT_MS[tf];
    const msToExpiry = expiryMs - now;

    // ── 1) 만료 도달 → 자동 시장가 청산 (현물 제외) ─────────────────────
    if (!isSpot && msToExpiry <= 0) {
      try {
        const ticker = await fetchTicker24h(t.symbol);
        const market = ticker.lastPrice;
        // 슬리피지 미적용 — 조회한 실제 시장가 그대로 청산.
        const exitActual = market;
        const entryActual = Number(t.entry_actual ?? t.entry);
        const stopDist = Math.abs(entryActual - t.stop);
        const feesPct = Number(t.fees_pct ?? 0.12);
        const feesR = stopDist > 0 ? (entryActual * (feesPct / 100)) / stopDist : 0;
        const movement =
          t.direction === "long"
            ? exitActual - entryActual
            : entryActual - exitActual;
        const grossR = stopDist > 0 ? movement / stopDist : 0;
        const resultR = grossR - feesR;
        const qty = Number(t.position_quantity ?? 0);
        const realizedPnl = movement * qty - entryActual * (feesPct / 100) * qty;

        const { error: upErr } = await svc
          .from("trades")
          .update({
            exit_price: market,
            exit_actual: exitActual,
            result_r: resultR,
            exit_reason: "timeout",
            closed_at: new Date().toISOString(),
            paper_realized_pnl: t.is_paper ? realizedPnl : null,
            note: `자동 청산 (만료) — 응답 없음 (${resultR.toFixed(2)}R)`,
          })
          .eq("id", t.id)
          .is("closed_at", null);

        if (upErr) {
          errors++;
          results.push({ id: t.id, note: `timeout close db error: ${upErr.message}` });
          continue;
        }

        if (t.is_paper && t.paper_margin != null) {
          await settleMargin({
            userId: t.user_id,
            margin: Number(t.paper_margin),
            realizedPnl,
            tradeId: t.id,
          });
        }
        autoClosed++;
        results.push({ id: t.id, exitReason: "timeout", resultR: Number(resultR.toFixed(2)) });

        // 사후 알림
        try {
          await dispatch(t.user_id, "ai_coach_done", {
            title: "⏰ 거래 자동 청산 (응답 없음)",
            body: `${t.symbol} ${t.direction === "long" ? "롱" : "숏"} · 만료 도달, 시장가로 자동 청산됨\n결과 ${resultR >= 0 ? "+" : ""}${resultR.toFixed(2)}R`,
            tradeId: t.id,
          });
        } catch {
          // ignore
        }
      } catch (e) {
        errors++;
        results.push({ id: t.id, note: `timeout close error: ${e instanceof Error ? e.message : String(e)}` });
      }
      continue;
    }

    // ── 2) 2차(D-1h) 경고 (현물 제외) ────────────────────────────────
    if (!isSpot && msToExpiry <= WARN_FINAL_MS && !t.expiry_warned_final_at) {
      const minsLeft = Math.max(0, Math.round(msToExpiry / 60_000));
      await svc
        .from("trades")
        .update({ expiry_warned_final_at: new Date().toISOString() })
        .eq("id", t.id);
      try {
        await dispatch(t.user_id, "ai_coach_done", {
          title: "⏰ 마지막 알림 — 1시간 후 자동 청산",
          body: `${t.symbol} ${t.direction === "long" ? "롱" : "숏"} · 약 ${minsLeft}분 후 자동 청산됩니다. 결정 안 하면 그대로 시장가 청산됩니다.`,
          tradeId: t.id,
        });
      } catch {
        // ignore
      }
      warned++;
      results.push({ id: t.id, note: "final warning" });
      // 경고만 보내고 stop/target 체크는 계속 진행 (체결이 더 우선)
    }

    // ── 3) 1차(D-N) 경고 (현물 제외) ─────────────────────────────────
    else if (
      !isSpot &&
      msToExpiry <= WARN_FIRST_MS[tf] &&
      !t.expiry_warned_first_at
    ) {
      const hoursLeft = Math.max(1, Math.round(msToExpiry / 3_600_000));
      await svc
        .from("trades")
        .update({ expiry_warned_first_at: new Date().toISOString() })
        .eq("id", t.id);
      try {
        await dispatch(t.user_id, "ai_coach_done", {
          title: "⏰ 거래 만료 임박",
          body: `${t.symbol} ${t.direction === "long" ? "롱" : "숏"} · 약 ${hoursLeft}시간 후 자동 청산됩니다.\n사이트에서 [지금 청산 / 24h 연장 / 그냥 두기] 중 선택하세요.`,
          tradeId: t.id,
        });
      } catch {
        // ignore
      }
      warned++;
      results.push({ id: t.id, note: "first warning" });
    }

    try {
      // Fetch candles starting just before the FILL time (not order placement).
      // 예약주문(STOP/LIMIT)은 체결 전 대기 구간에 포지션이 없으므로, 그 구간 캔들이
      // 손절/목표선을 스쳐도 무시해야 한다. filled_at 이 없으면(레거시/시장가) created_at 사용.
      const fillMs = t.filled_at ? new Date(t.filled_at).getTime() : createdMs;
      const candles = await fetchKlines(t.symbol, INTERVAL_MAP[tf], 1000, {
        startTime: fillMs - 60_000, // small buffer in case of clock skew
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
    autoClosed,
    warned,
    errors,
    results,
  });
}
