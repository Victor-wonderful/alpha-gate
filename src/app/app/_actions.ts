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

/** Threshold: market price drift from user-intended entry, expressed as a
 *  fraction of the planned stop distance. If the market has moved more than
 *  this much from the entry the user typed, we reject the order to prevent
 *  "chasing" entries that would corrupt entry_actual and inflate fee impact.
 *  0.5 = market may drift up to half of risk-per-unit before we block. */
const MARKET_DRIFT_LIMIT = 0.5;

export async function saveTradeAction(args: {
  input: TradeInput;
  grade: GradeResult;
  sizing: SizingResult;
  leverage?: number;
  forecast?: unknown; // Monte Carlo result snapshot at save time (live mode)
  /** 'market' (default): execute immediately at current price.
   *  'limit': park in pending_limit_orders and wait for price to reach input.entry. */
  orderType?: "market" | "limit";
}): Promise<{ id?: string; error?: string; orderType?: "market" | "limit"; status?: "filled" | "pending" }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { input, grade, sizing, leverage, forecast } = args;
  const orderType = args.orderType ?? "market";
  const lev = leverage ?? 1;

  // Sanity: stop distance must be positive (otherwise resolve math blows up).
  const stopDist = Math.abs(input.entry - input.stop);
  if (stopDist <= 0) {
    return { error: "진입가와 손절가가 같습니다. 손절 위치를 확인하세요." };
  }

  // ── 지정가 주문 분기 ───────────────────────────────────────────────────
  if (orderType === "limit") {
    if (!input.entry || input.entry <= 0) {
      return { error: "지정가는 0보다 커야 합니다." };
    }
    // Check current market: limit makes no sense if price is already past
    // entry in the favorable direction (would fill instantly = use market instead).
    try {
      const ticker = await fetchTicker24h(input.symbol);
      const px = ticker.lastPrice;
      if (Number.isFinite(px) && px > 0) {
        // Long limit buy below market; short limit sell above market.
        if (input.direction === "long" && px <= input.entry) {
          return { error: `현재가($${px.toFixed(2)})가 이미 지정가($${input.entry.toFixed(2)}) 이하입니다. 시장가로 진입하세요.` };
        }
        if (input.direction === "short" && px >= input.entry) {
          return { error: `현재가($${px.toFixed(2)})가 이미 지정가($${input.entry.toFixed(2)}) 이상입니다. 시장가로 진입하세요.` };
        }
        // Also reject limits placed past stop (= guaranteed instant loss if filled)
        if (input.direction === "long" && input.entry <= input.stop) {
          return { error: "롱 지정가는 손절가보다 위에 있어야 합니다." };
        }
        if (input.direction === "short" && input.entry >= input.stop) {
          return { error: "숏 지정가는 손절가보다 아래에 있어야 합니다." };
        }
      }
    } catch {
      // Ticker fetch failed — proceed but record nothing extra.
    }

    // pre_rr from user-intended entry/stop/target (will match exactly at fill since
    // entry_actual will be set to limit_price by the filler).
    const rrFromIntent = Math.abs((input.target - input.entry) / (input.entry - input.stop));

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
        psych_checks: {},
        context_flags: {
          leverage: lev,
          trigger: input.trigger,
          marketCtx: input.marketCtx,
          limitOrder: true,
        },
        pre_grade: grade.grade,
        pre_score: grade.score,
        pre_score_breakdown: grade.reasons,
        pre_actions: grade.actions,
        pre_rr: rrFromIntent,
        simulation_meta: forecast ? { kind: "monte_carlo_forecast", at: new Date().toISOString(), ...(typeof forecast === "object" && forecast !== null ? forecast : {}) } : null,
        // Limit-order: no fill yet, no margin lock yet.
        entry_actual: null,
        entry_slippage_pct: 0,
        fees_pct: PAPER_FEES_PCT,
        paper_margin: null,
        is_paper: true,
        order_type: "limit",
        limit_price: input.entry,
        order_status: "pending",
      })
      .select("id")
      .single();

    if (error || !data) return { error: error?.message ?? "지정가 주문 생성 실패" };

    const { error: ploErr } = await supabase.from("pending_limit_orders").insert({
      user_id: user.id,
      trade_id: data.id,
      symbol: input.symbol,
      direction: input.direction,
      limit_price: input.entry,
      quantity: sizing.quantity,
      leverage: lev,
      stop: input.stop,
      target: input.target,
    });
    if (ploErr) {
      await supabase.from("trades").delete().eq("id", data.id);
      return { error: `지정가 주문 등록 실패: ${ploErr.message}` };
    }

    revalidatePath("/app/journal");
    revalidatePath("/app/dashboard");
    return { id: data.id, orderType: "limit", status: "pending" };
  }

  // ── 시장가 주문 ───────────────────────────────────────────────────────
  // Paper trading: simulate a market-order fill using the current Binance price.
  const fill = await simulateMarketFill(input.symbol, input.direction, input.entry);

  // Market-price safety guards (only when we actually got a live quote).
  if (fill.fromMarket) {
    const market = fill.fillPrice; // already slippage-adjusted, but close enough
    // Reject if market has already crossed target.
    if (input.direction === "long" && market >= input.target) {
      return {
        error: `현재가($${market.toFixed(2)})가 이미 목표가($${input.target.toFixed(2)}) 이상입니다. 추격 진입 금지 — 목표를 갱신하거나 지정가 대기로 전환하세요.`,
      };
    }
    if (input.direction === "short" && market <= input.target) {
      return {
        error: `현재가($${market.toFixed(2)})가 이미 목표가($${input.target.toFixed(2)}) 이하입니다. 추격 진입 금지 — 목표를 갱신하거나 지정가 대기로 전환하세요.`,
      };
    }
    // Reject if market is already past stop (= entry would be in instant-loss zone).
    if (input.direction === "long" && market <= input.stop) {
      return {
        error: `현재가($${market.toFixed(2)})가 이미 손절가($${input.stop.toFixed(2)}) 이하입니다. 진입 거부.`,
      };
    }
    if (input.direction === "short" && market >= input.stop) {
      return {
        error: `현재가($${market.toFixed(2)})가 이미 손절가($${input.stop.toFixed(2)}) 이상입니다. 진입 거부.`,
      };
    }
    // Reject if market has drifted too far from user's intended entry.
    const drift = Math.abs(market - input.entry);
    if (drift / stopDist > MARKET_DRIFT_LIMIT) {
      const driftPct = (drift / input.entry) * 100;
      return {
        error: `현재가($${market.toFixed(2)})가 입력한 진입가($${input.entry.toFixed(2)})에서 ${driftPct.toFixed(2)}% 벗어났습니다 (리스크 폭의 ${((drift / stopDist) * 100).toFixed(0)}%). 시장가 추격 위험 — 지정가 대기 또는 입력값을 갱신하세요.`,
      };
    }
  }

  // Compute required margin based on the actual fill price.
  const margin = requiredMargin(fill.fillPrice, sizing.quantity, lev);

  // Pre-flight: confirm the wallet can cover this trade.
  const afford = await canAffordMargin(user.id, margin);
  if (!afford.ok) {
    return { error: afford.reason };
  }

  // Recompute pre_rr using the actual fill price so the journal R:R column
  // matches what resolve-trades will report. Falls back to user intent if
  // the fill price ends up at/past stop (guards above should prevent this).
  const fillStopDist = Math.abs(fill.fillPrice - input.stop);
  const rrFromFill = fillStopDist > 0
    ? Math.abs(input.target - fill.fillPrice) / fillStopDist
    : grade.rr;

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
      pre_rr: rrFromFill,
      simulation_meta: forecast ? { kind: "monte_carlo_forecast", at: new Date().toISOString(), ...(typeof forecast === "object" && forecast !== null ? forecast : {}) } : null,
      // Paper-trading simulated fill + margin
      entry_actual: fill.fillPrice,
      entry_slippage_pct: fill.slippagePct,
      fees_pct: PAPER_FEES_PCT,
      paper_margin: margin,
      order_type: "market",
      order_status: "filled",
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
  return { id: data.id, orderType: "market", status: "filled" };
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
