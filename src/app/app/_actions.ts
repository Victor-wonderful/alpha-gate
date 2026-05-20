"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { dispatch } from "@/lib/notify-dispatch";
import { fetchKlines, fetchTicker24h } from "@/lib/analysis/binance";
import { canAffordMargin, lockMargin, requiredMargin, settleMargin } from "@/lib/paper-wallet";
import type { GradeResult, SizingResult, TradeInput } from "@/types/trade";

/** Simulated market-order slippage in % for paper trading.
 *  Direction-aware: long fills slightly higher, short slightly lower (unfavorable side). */
const PAPER_SLIPPAGE_PCT = 0.05;
/** Round-trip taker fee assumption (entry + exit, %). Matches ROUND_TRIP_COST_PCT
 *  used in fee-adjusted R:R thinking elsewhere. */
const PAPER_FEES_PCT = 0.12;

/** Simulate a market-order fill for paper trading.
 *  - Fetches Binance current price
 *  - Applies direction-aware slippage on top
 *  - Returns the actual fill price + slippage % used
 *  Falls back to the user-typed entry if the API call fails (graceful degradation). */
async function simulateMarketFill(
  symbol: string,
  direction: "long" | "short",
  userEntry: number,
): Promise<{ fillPrice: number; slippagePct: number; fromMarket: boolean }> {
  try {
    const ticker = await fetchTicker24h(symbol);
    const last = ticker.lastPrice;
    if (!last || !Number.isFinite(last) || last <= 0) {
      return { fillPrice: userEntry, slippagePct: 0, fromMarket: false };
    }
    const slip = direction === "long" ? PAPER_SLIPPAGE_PCT : -PAPER_SLIPPAGE_PCT;
    const fillPrice = last * (1 + slip / 100);
    return { fillPrice, slippagePct: slip, fromMarket: true };
  } catch {
    return { fillPrice: userEntry, slippagePct: 0, fromMarket: false };
  }
}

export async function saveTradeAction(args: {
  input: TradeInput;
  grade: GradeResult;
  sizing: SizingResult;
  leverage?: number;
  forecast?: unknown; // Monte Carlo result snapshot at save time (live mode)
}): Promise<{ id?: string; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { input, grade, sizing, leverage, forecast } = args;
  const lev = leverage ?? 1;

  // Paper trading: simulate a market-order fill using the current Binance price.
  const fill = await simulateMarketFill(input.symbol, input.direction, input.entry);

  // Compute required margin based on the actual fill price.
  const margin = requiredMargin(fill.fillPrice, sizing.quantity, lev);

  // Pre-flight: confirm the wallet can cover this trade.
  const afford = await canAffordMargin(user.id, margin);
  if (!afford.ok) {
    return { error: afford.reason };
  }

  const { data, error } = await supabase
    .from("trades")
    .insert({
      user_id: user.id,
      symbol: input.symbol,
      direction: input.direction,
      timeframe: input.timeframe,
      entry: input.entry,
      stop: input.stop,
      target: input.target,
      account_size: input.accountSize,
      allowed_loss_pct: input.allowedLossPct,
      position_quantity: sizing.quantity,
      market_checks: input.market,
      psych_checks: {}, // deprecated, kept for NOT NULL constraint
      context_flags: {
        leverage: lev,
        trigger: input.trigger,
        marketCtx: input.marketCtx,
      },
      pre_grade: grade.grade,
      pre_score: grade.score,
      pre_score_breakdown: grade.reasons,
      pre_actions: grade.actions,
      pre_rr: grade.rr,
      simulation_meta: forecast ? { kind: "monte_carlo_forecast", at: new Date().toISOString(), ...(typeof forecast === "object" && forecast !== null ? forecast : {}) } : null,
      // Paper-trading simulated fill + margin
      entry_actual: fill.fillPrice,
      entry_slippage_pct: fill.slippagePct,
      fees_pct: PAPER_FEES_PCT,
      paper_margin: margin,
    })
    .select("id, pre_grade")
    .single();

  if (error || !data) return { error: error?.message ?? "저장 실패" };

  // Lock margin in the paper wallet. Wallet was pre-checked so this should
  // succeed; on the off chance it doesn't, mark the trade as error and bail.
  const lock = await lockMargin({
    userId: user.id,
    margin,
    tradeId: data.id,
    note: `진입 증거금 lock ($${margin.toFixed(2)})`,
  });
  if (!lock.ok) {
    await supabase
      .from("trades")
      .update({ exchange_status: "error", exchange_error: lock.error })
      .eq("id", data.id);
    return { error: lock.error };
  }

  // Fire notifications (best-effort, no throw)
  if (grade.grade === "D") {
    await dispatch(user.id, "d_grade_warn", {
      title: "거래 금지 등급으로 저장됨",
      body: `${input.symbol} ${input.direction === "long" ? "롱" : "숏"} ${input.timeframe} · 점수 ${grade.score}\n${grade.actions.slice(0, 2).join("\n")}`,
      tradeId: data.id,
    });
  }
  revalidatePath("/app/journal");
  revalidatePath("/app/dashboard");
  return { id: data.id };
}

export async function updateOutcomeAction(args: {
  id: string;
  exitPrice: number;
  resultR: number;
  exitReason: "target" | "stop" | "manual";
  mistakeTags: string[];
  note: string;
}): Promise<{ error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("trades")
    .update({
      exit_price: args.exitPrice,
      result_r: args.resultR,
      exit_reason: args.exitReason,
      mistake_tags: args.mistakeTags,
      note: args.note,
      closed_at: new Date().toISOString(),
    })
    .eq("id", args.id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath(`/app/journal/${args.id}`);
  revalidatePath("/app/journal");
  revalidatePath("/app/dashboard");
  return {};
}

type TF = "15m" | "1h" | "4h" | "1D";
const INTERVAL_MAP: Record<TF, "15m" | "1h" | "4h" | "1d"> = {
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1D": "1d",
};
const TIMEOUT_MS: Record<TF, number> = {
  "15m": 2 * 24 * 60 * 60_000,
  "1h": 7 * 24 * 60 * 60_000,
  "4h": 14 * 24 * 60 * 60_000,
  "1D": 30 * 24 * 60 * 60_000,
};

/**
 * Manually trigger auto-resolution for the current user's open live trades.
 * Same logic as the cron endpoint but scoped to the requesting user only.
 */
export async function resolveMyTradesAction(): Promise<{
  checked: number;
  resolved: number;
  stale: number;
  pending: number;
  error?: string;
}> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { checked: 0, resolved: 0, stale: 0, pending: 0, error: "로그인이 필요합니다." };

  const { data: openTrades, error } = await supabase
    .from("trades")
    .select(
      "id, symbol, direction, timeframe, entry, entry_actual, stop, target, position_quantity, paper_margin, fees_pct, is_paper, created_at, mode",
    )
    .eq("user_id", user.id)
    .is("closed_at", null)
    .neq("mode", "backtest")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) return { checked: 0, resolved: 0, stale: 0, pending: 0, error: error.message };
  if (!openTrades || openTrades.length === 0) return { checked: 0, resolved: 0, stale: 0, pending: 0 };

  let resolved = 0;
  let stale = 0;
  let pending = 0;

  for (const t of openTrades) {
    const tf = t.timeframe as TF;
    if (!INTERVAL_MAP[tf]) continue;
    const createdMs = new Date(t.created_at).getTime();
    if (Date.now() - createdMs > TIMEOUT_MS[tf]) {
      stale++;
      continue;
    }
    try {
      const candles = await fetchKlines(t.symbol, INTERVAL_MAP[tf], 1000, {
        startTime: createdMs - 60_000,
      });
      if (!candles || candles.length === 0) {
        pending++;
        continue;
      }
      const entryActual = Number(t.entry_actual ?? t.entry);
      const stop = Number(t.stop);
      const target = Number(t.target);
      const stopDist = Math.abs(entryActual - stop);
      if (stopDist === 0) {
        pending++;
        continue;
      }
      const feesPct = Number(t.fees_pct ?? 0.12);
      const feesR = (entryActual * (feesPct / 100)) / stopDist;
      let hit: { exitPrice: number; exitActual: number; resultR: number; exitReason: "target" | "stop"; closedAt: string } | null = null;
      for (const c of candles) {
        if (t.direction === "long") {
          if (c.low <= stop) {
            const exitActual = stop;
            hit = { exitPrice: stop, exitActual, resultR: (exitActual - entryActual) / stopDist - feesR, exitReason: "stop", closedAt: new Date(c.closeTime).toISOString() };
            break;
          }
          if (c.high >= target) {
            const exitActual = target;
            hit = { exitPrice: target, exitActual, resultR: (exitActual - entryActual) / stopDist - feesR, exitReason: "target", closedAt: new Date(c.closeTime).toISOString() };
            break;
          }
        } else {
          if (c.high >= stop) {
            const exitActual = stop;
            hit = { exitPrice: stop, exitActual, resultR: (entryActual - exitActual) / stopDist - feesR, exitReason: "stop", closedAt: new Date(c.closeTime).toISOString() };
            break;
          }
          if (c.low <= target) {
            const exitActual = target;
            hit = { exitPrice: target, exitActual, resultR: (entryActual - exitActual) / stopDist - feesR, exitReason: "target", closedAt: new Date(c.closeTime).toISOString() };
            break;
          }
        }
      }
      if (!hit) {
        pending++;
        continue;
      }
      // Realized PnL in USDT (for paper wallet settlement).
      const qty = Number(t.position_quantity ?? 0);
      const realizedPnl =
        t.direction === "long"
          ? (hit.exitActual - entryActual) * qty - (entryActual * (feesPct / 100)) * qty
          : (entryActual - hit.exitActual) * qty - (entryActual * (feesPct / 100)) * qty;

      const { error: upErr } = await supabase
        .from("trades")
        .update({
          exit_price: hit.exitPrice,
          exit_actual: hit.exitActual,
          result_r: hit.resultR,
          exit_reason: hit.exitReason,
          closed_at: hit.closedAt,
          paper_realized_pnl: t.is_paper ? realizedPnl : null,
          note: `자동 정산: ${hit.exitReason === "target" ? "목표 도달" : "손절 적중"} (수수료 차감 후 ${hit.resultR.toFixed(2)}R)`,
        })
        .eq("id", t.id)
        .eq("user_id", user.id)
        .is("closed_at", null);
      if (!upErr) {
        resolved++;
        // Paper wallet settle: release margin and credit/debit USDT PnL.
        if (t.is_paper && t.paper_margin != null) {
          const { settleMargin } = await import("@/lib/paper-wallet");
          await settleMargin({
            userId: user.id,
            margin: Number(t.paper_margin),
            realizedPnl,
            tradeId: t.id,
          });
        }
      }
    } catch {
      pending++;
    }
  }

  revalidatePath("/app/journal");
  revalidatePath("/app/dashboard");

  return { checked: openTrades.length, resolved, stale, pending };
}
