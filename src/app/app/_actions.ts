"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { dispatch } from "@/lib/notify-dispatch";
import { fetchKlines, fetchTicker24h } from "@/lib/analysis/binance";
import { canAffordMargin, lockMargin, requiredMargin, settleMargin } from "@/lib/paper-wallet";
import { simulateTrade } from "@/lib/backtest/simulator";
import type { TradingStyle } from "@/lib/analysis/style";
import type { GradeResult, SizingResult, TradeInput } from "@/types/trade";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Round-trip fee (entry + exit) — Binance USDT-M Futures, 테이커+메이커 합쳐 최대 0.075%.
 *  슬리피지는 미적용 — 시장가는 조회한 실제 시장가 그대로 체결. */
const PAPER_FEES_PCT = 0.075;

/** Simulate a market-order fill for paper trading.
 *  - Fetches Binance current price
 *  - 슬리피지 미적용: 조회한 실제 시장가 그대로 체결
 *  Falls back to the user-typed entry if the API call fails (graceful degradation). */
async function simulateMarketFill(
  symbol: string,
  direction: "long" | "short",
  userEntry: number,
): Promise<{ fillPrice: number; slippagePct: number; fromMarket: boolean }> {
  void direction; // 방향 무관 — 슬리피지 제거
  try {
    const ticker = await fetchTicker24h(symbol);
    const last = ticker.lastPrice;
    if (!last || !Number.isFinite(last) || last <= 0) {
      return { fillPrice: userEntry, slippagePct: 0, fromMarket: false };
    }
    return { fillPrice: last, slippagePct: 0, fromMarket: true };
  } catch {
    return { fillPrice: userEntry, slippagePct: 0, fromMarket: false };
  }
}

/**
 * 백테스트 거래 저장 — 라이브 가드 스킵, simulator 자동 실행, 결과 즉시 채워서 closed 상태로 insert.
 * - paper wallet 무관 (마진 lock 없음)
 * - 알림 없음
 * - mode='backtest', simulated_at=백테스트 시점, simulation_meta=시뮬 결과 메타
 */
async function saveBacktestTrade(args: {
  user_id: string;
  supabase: SupabaseClient;
  input: TradeInput;
  grade: GradeResult;
  sizing: SizingResult;
  leverage: number;
  gradeOverride: boolean;
  backtestAt: string; // ISO
  forecast?: unknown;
}): Promise<{ id?: string; error?: string; orderType?: "market" | "limit"; status?: "closed" }> {
  const { user_id, supabase, input, grade, sizing, leverage, gradeOverride, backtestAt } = args;
  const atDate = new Date(backtestAt);
  if (isNaN(atDate.getTime())) return { error: "백테스트 시각 형식이 올바르지 않습니다." };

  // 스타일은 timeframe에서 역추정 (정확치 않을 수 있으나 sim 시간 한도용으로 충분).
  // analyze-store의 style이 trade-form까지 전달되진 않아서 timeframe 기반으로 매핑.
  const styleFromTf: Record<string, TradingStyle> = {
    "15m": "scalp",
    "1h": "day",
    "4h": "swing",
    "1D": "position",
    "1d": "position",
  };
  const style = styleFromTf[input.timeframe] ?? "swing";

  // walk-forward 시뮬
  let sim;
  try {
    sim = await simulateTrade({
      symbol: input.symbol,
      direction: input.direction,
      entry: input.entry,
      stop: input.stop,
      target: input.target,
      simulatedAt: atDate,
      style,
    });
  } catch (e) {
    return { error: `백테스트 시뮬 실패: ${e instanceof Error ? e.message : "unknown"}` };
  }

  // 결과 정리
  const isNoEntry = sim.exitReason === "no_entry";
  const entryActual = isNoEntry ? null : sim.entryFillPrice;
  const exitPrice = isNoEntry ? null : sim.exitPrice;
  const resultR = isNoEntry ? 0 : sim.resultR;
  const closedAt = sim.closedAt;
  const note = isNoEntry
    ? "백테스트: 진입가 미체결 (트리거 발생 안 함)"
    : `백테스트 자동 정산: ${
        sim.exitReason === "target" ? "목표 도달" : sim.exitReason === "stop" ? "손절" : "시간 만료"
      } (${sim.resultR.toFixed(2)}R, ${sim.meta.barsHeld}봉 보유)`;

  // pre_rr from intent (백테스트는 entry_actual이 시뮬 결과라 의미 동일)
  const rrFromIntent = Math.abs((input.target - input.entry) / (input.entry - input.stop));

  const { data, error } = await supabase
    .from("trades")
    .insert({
      user_id,
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
        leverage,
        trigger: input.trigger,
        backtest: true,
      },
      pre_grade: grade.grade,
      pre_score: grade.score,
      pre_score_breakdown: grade.reasons,
      pre_actions: grade.actions,
      pre_rr: rrFromIntent,
      // 결과 즉시 채움 (closed)
      entry_actual: entryActual,
      entry_slippage_pct: 0, // 시뮬엔 슬리피지 없음
      fees_pct: PAPER_FEES_PCT,
      exit_price: exitPrice,
      exit_reason: isNoEntry ? "manual" : sim.exitReason === "time" ? "manual" : sim.exitReason,
      result_r: resultR,
      closed_at: closedAt,
      note,
      // 백테스트 메타
      mode: "backtest",
      simulated_at: backtestAt,
      simulation_meta: {
        kind: "backtest_walk_forward",
        at: backtestAt,
        ...sim.meta,
        exitReason: sim.exitReason,
      },
      // paper wallet 무관
      is_paper: true,
      paper_margin: null,
      order_type: "market",
      order_status: "filled",
      grade_override: gradeOverride,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "백테스트 거래 저장 실패" };

  revalidatePath("/app/journal");
  revalidatePath("/app/dashboard");
  return { id: data.id, orderType: "market", status: "closed" };
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
   *  'limit': 되돌림 대기 — 가격이 input.entry로 돌아오면 체결(진입가가 유리한 쪽).
   *  'stop': 돌파 추격 — 가격이 input.entry를 통과하면 체결(진입가가 불리한 쪽). */
  orderType?: "market" | "limit" | "stop";
  /** D 등급 거래를 사용자가 확인 모달로 override 한 경우 true. */
  gradeOverride?: boolean;
  /** 백테스트 모드 — ISO 시각. 있으면 라이브 가드 스킵 + simulator 자동 실행 후 결과 즉시 채움. */
  backtestAt?: string;
}): Promise<{ id?: string; error?: string; orderType?: "market" | "limit" | "stop"; status?: "filled" | "pending" | "closed" }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { input, grade, sizing, leverage, forecast } = args;
  const orderType = args.orderType ?? "market";
  const lev = leverage ?? 1;

  // D 등급은 confirm 모달 통과(gradeOverride=true) 없이는 진입 거부.
  if (grade.grade === "D" && !args.gradeOverride) {
    return {
      error: "D등급(거래 금지) — 진입하려면 확인 모달에서 'D 진입'을 입력하고 진행하세요.",
    };
  }

  // Sanity: stop distance must be positive (otherwise resolve math blows up).
  const stopDist = Math.abs(input.entry - input.stop);
  if (stopDist <= 0) {
    return { error: "진입가와 손절가가 같습니다. 손절 위치를 확인하세요." };
  }

  // ── 백테스트 모드 분기 ─────────────────────────────────────────────────
  // 라이브 가드(drift / pending limit / 마진 lock / 알림)는 모두 스킵.
  // simulator로 walk-forward 시뮬 → 결과(R, exit_price, exit_reason)를 즉시 채워서 closed 상태로 저장.
  if (args.backtestAt) {
    return await saveBacktestTrade({
      user_id: user.id,
      supabase,
      input,
      grade,
      sizing,
      leverage: lev,
      gradeOverride: !!args.gradeOverride,
      backtestAt: args.backtestAt,
      forecast,
    });
  }

  // 3차 가드: 손절폭이 수수료 대비 너무 좁으면 진입 거부.
  // 손절 적중 시 수수료가 리스크의 큰 부분을 먹어 계획보다 큰 손실이 확정됨.
  const { MIN_STOP_PCT_VS_FEES, ROUND_TRIP_COST_PCT } = await import("@/lib/analysis/standards");
  const stopPctCheck = (stopDist / input.entry) * 100;
  if (stopPctCheck < MIN_STOP_PCT_VS_FEES) {
    const realizedR = stopPctCheck > 0 ? (stopPctCheck + ROUND_TRIP_COST_PCT) / stopPctCheck : 0;
    return {
      error: `손절폭(${stopPctCheck.toFixed(3)}%)이 수수료의 3배(${MIN_STOP_PCT_VS_FEES.toFixed(2)}%) 미만입니다. 손절 적중 시 수수료 포함 약 ${realizedR.toFixed(1)}R 손실(계획 1R 대비). 손절을 더 멀리 잡으세요.`,
    };
  }

  // ── 지정가(LIMIT) / 역지정가(STOP) 주문 분기 ──────────────────────────────
  if (orderType === "limit" || orderType === "stop") {
    const kindLabel = orderType === "stop" ? "역지정가" : "지정가";
    if (!input.entry || input.entry <= 0) {
      return { error: `${kindLabel}는 0보다 커야 합니다.` };
    }
    // 트리거가가 현재가 대비 올바른 쪽에 있는지 검증.
    //  LIMIT(되돌림): 롱은 현재가 아래, 숏은 현재가 위여야 유효(즉시 체결 방지).
    //  STOP(돌파):    롱은 현재가 위,   숏은 현재가 아래여야 유효(즉시 체결 방지).
    try {
      const ticker = await fetchTicker24h(input.symbol);
      const px = ticker.lastPrice;
      if (Number.isFinite(px) && px > 0) {
        const isLong = input.direction === "long";
        if (orderType === "limit") {
          if (isLong && px <= input.entry) {
            return { error: `현재가($${px.toFixed(2)})가 이미 지정가($${input.entry.toFixed(2)}) 이하입니다. 시장가 또는 역지정가(돌파)로 진입하세요.` };
          }
          if (!isLong && px >= input.entry) {
            return { error: `현재가($${px.toFixed(2)})가 이미 지정가($${input.entry.toFixed(2)}) 이상입니다. 시장가 또는 역지정가(돌파)로 진입하세요.` };
          }
        } else {
          // STOP: 트리거가가 현재가에 비해 잘못된 쪽이면 이미 통과한 것.
          if (isLong && px >= input.entry) {
            return { error: `현재가($${px.toFixed(2)})가 이미 역지정가 트리거($${input.entry.toFixed(2)})를 넘었습니다. 시장가로 진입하거나 트리거를 위로 옮기세요.` };
          }
          if (!isLong && px <= input.entry) {
            return { error: `현재가($${px.toFixed(2)})가 이미 역지정가 트리거($${input.entry.toFixed(2)}) 아래입니다. 시장가로 진입하거나 트리거를 아래로 옮기세요.` };
          }
        }
        // 손절-진입 관계는 LIMIT/STOP 공통: 롱은 진입가가 손절가 위, 숏은 아래.
        if (isLong && input.entry <= input.stop) {
          return { error: `롱 ${kindLabel}는 손절가보다 위에 있어야 합니다.` };
        }
        if (!isLong && input.entry >= input.stop) {
          return { error: `숏 ${kindLabel}는 손절가보다 아래에 있어야 합니다.` };
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
          orderKind: orderType,
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
        order_type: orderType,
        limit_price: input.entry,
        order_status: "pending",
        grade_override: !!args.gradeOverride,
      })
      .select("id")
      .single();

    if (error || !data) return { error: error?.message ?? `${kindLabel} 주문 생성 실패` };

    // 유효기간 — 스타일(타임프레임)별 차등. 24h 고정은 스윙/포지션엔 짧아 되돌림 전 만료 다수(만료율 26%),
    // 스캘프엔 길어 셋업이 상해도 남음. 타임프레임으로 스타일을 역추정해 만료 시각을 정한다.
    const EXPIRY_HOURS: Record<string, number> = {
      "15m": 12, // 스캘프
      "1h": 12, // 데이 — 반나절 안에 진입 못 하면 셋업 지남
      "4h": 48, // 스윙 — 되돌림 대기 2일
      "1D": 168, // 포지션(→DCA)
      "1d": 168,
    };
    const expiresAt = new Date(
      Date.now() + (EXPIRY_HOURS[input.timeframe] ?? 24) * 3_600_000,
    ).toISOString();

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
      order_kind: orderType,
      expires_at: expiresAt,
    });
    if (ploErr) {
      await supabase.from("trades").delete().eq("id", data.id);
      return { error: `${kindLabel} 주문 등록 실패: ${ploErr.message}` };
    }

    revalidatePath("/app/journal");
    revalidatePath("/app/dashboard");
    return { id: data.id, orderType, status: "pending" };
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
      filled_at: new Date().toISOString(),
      grade_override: !!args.gradeOverride,
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
  revalidatePath("/app/virtual-trade"); // 거래소 화면 포지션 목록도 갱신 (정산으로 닫힌 포지션이 남아 보이던 stale 버그)

  return { checked: openTrades.length, resolved, stale, pending };
}
