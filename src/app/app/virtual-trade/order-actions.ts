"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { fetchTicker24h } from "@/lib/analysis/binance";
import { canAffordMargin, lockMargin, requiredMargin } from "@/lib/paper-wallet";

export interface PlaceOrderInput {
  symbol: string;
  direction: "long" | "short";
  /** Quantity in coin units (e.g. 0.01 BTC). */
  quantity: number;
  leverage: number;
  /** Optional stop/target prices. */
  stop?: number;
  target?: number;
  /** Trading style — controls timeframe & defaults. */
  timeframe?: "15m" | "1h" | "4h" | "1D";
  /** Order type: 'market' (default), 'limit', or 'stop' (역지정가 — 돌파 추격). */
  orderType?: "market" | "limit" | "stop";
  /** Required when orderType === 'limit' or 'stop'. limit=목표 체결가, stop=트리거가. */
  limitPrice?: number;
  /** 'futures' (default, USDT-M Futures) or 'spot' (현물). Spot은 자동으로
   *  leverage=1, direction=long, 수수료 0.2% 적용. */
  marketType?: "futures" | "spot";
}

export interface PlaceOrderResult {
  ok: boolean;
  tradeId?: string;
  fillPrice?: number;
  margin?: number;
  newBalance?: number;
  newAvailable?: number;
  error?: string;
  /** Limit/Stop 주문일 때 반환 */
  orderType?: "market" | "limit" | "stop";
  limitPrice?: number;
  status?: "filled" | "pending";
}

const PAPER_SLIPPAGE_PCT = 0.05;
// Binance USDT-M Futures Taker 0.04% × 2 (round-trip). 슬리피지는 별도 처리.
const PAPER_FEES_PCT_FUTURES = 0.08;
// Binance Spot Taker 0.1% × 2 — 현물은 더 비쌈.
const PAPER_FEES_PCT_SPOT = 0.2;
const PAPER_FEES_PCT = PAPER_FEES_PCT_FUTURES; // 기본 — 호환성용

/** Place a virtual market order directly (no AI flow). Used by the exchange-style
 *  trading panel on /app/virtual-trade. */
export async function placeVirtualOrderAction(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  if (!input.symbol || !/^[A-Z0-9]{2,15}USDT$/i.test(input.symbol)) {
    return { ok: false, error: "심볼이 유효하지 않습니다 (예: BTCUSDT)." };
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, error: "수량이 0보다 커야 합니다." };
  }
  if (!Number.isFinite(input.leverage) || input.leverage < 1 || input.leverage > 125) {
    return { ok: false, error: "레버리지는 1~125 사이여야 합니다." };
  }

  const symbol = input.symbol.toUpperCase();
  const isLimit = input.orderType === "limit";
  const isSpot = input.marketType === "spot";

  // Spot 강제 규칙
  if (isSpot) {
    if (input.direction !== "long") {
      return { ok: false, error: "현물 거래는 매수(long)만 가능합니다." };
    }
    if (input.leverage !== 1) {
      return { ok: false, error: "현물 거래는 레버리지 1배만 가능합니다." };
    }
  }
  const feesPct = isSpot ? PAPER_FEES_PCT_SPOT : PAPER_FEES_PCT_FUTURES;

  // ── 지정가 주문 분기 ─────────────────────────────────────────────────────
  if (isLimit) {
    if (!Number.isFinite(input.limitPrice) || (input.limitPrice ?? 0) <= 0) {
      return { ok: false, error: "지정가를 입력하세요." };
    }
    const limitPrice = input.limitPrice!;

    // stop/target 기본값 (지정가 기준 ±2% / ±4%)
    const stop = input.stop ?? (input.direction === "long" ? limitPrice * 0.98 : limitPrice * 1.02);
    const target = input.target ?? (input.direction === "long" ? limitPrice * 1.04 : limitPrice * 0.96);
    const timeframe = input.timeframe ?? "1h";

    // 잔액 확인 (예약 없이 주문만 등록하므로 실제 lock은 체결 시점에)
    const afford = await canAffordMargin(user.id, 0);
    const balance = afford.balance;

    // trades 행 삽입 (pending 상태, entry_actual은 체결 시점에 채워짐)
    const { data: trade, error: insertErr } = await supabase
      .from("trades")
      .insert({
        user_id: user.id,
        symbol,
        direction: input.direction,
        timeframe,
        entry: limitPrice,
        stop,
        target,
        account_size: balance,
        allowed_loss_pct: 1,
        position_quantity: input.quantity,
        market_checks: {},
        psych_checks: {},
        context_flags: {
          leverage: input.leverage,
          directOrder: true,
          limitOrder: true,
        },
        pre_grade: "B",
        pre_score: 5,
        pre_score_breakdown: [],
        pre_actions: [],
        pre_rr: Math.abs((target - limitPrice) / (limitPrice - stop)),
        simulation_meta: null,
        entry_actual: null,
        entry_slippage_pct: 0,
        fees_pct: feesPct,
        paper_margin: null, // 체결 시점에 결정
        is_paper: true,
        order_type: "limit",
        limit_price: limitPrice,
        order_status: "pending",
        market_type: isSpot ? "spot" : "futures",
      })
      .select("id")
      .single();

    if (insertErr || !trade) {
      return { ok: false, error: `거래 생성 실패: ${insertErr?.message ?? "unknown"}` };
    }

    // pending_limit_orders 에 주문 등록
    const { error: ploErr } = await supabase.from("pending_limit_orders").insert({
      user_id: user.id,
      trade_id: trade.id,
      symbol,
      direction: input.direction,
      limit_price: limitPrice,
      quantity: input.quantity,
      leverage: input.leverage,
      stop,
      target,
    });

    if (ploErr) {
      // 주문 등록 실패 시 trades 행도 정리
      await supabase.from("trades").delete().eq("id", trade.id);
      return { ok: false, error: `지정가 주문 등록 실패: ${ploErr.message}` };
    }

    revalidatePath("/app/virtual-trade");
    return {
      ok: true,
      tradeId: trade.id,
      orderType: "limit",
      limitPrice,
      status: "pending",
    };
  }

  // ── 역지정가(STOP 진입) 분기 — 돌파 추격 ─────────────────────────────────
  if (input.orderType === "stop") {
    if (!Number.isFinite(input.limitPrice) || (input.limitPrice ?? 0) <= 0) {
      return { ok: false, error: "트리거가를 입력하세요." };
    }
    const triggerPrice = input.limitPrice!;

    // 현재가 대비 "불리한 쪽" 검증 (롱=위로 돌파, 숏=아래로 이탈)
    let lastPrice: number;
    try {
      const ticker = await fetchTicker24h(symbol);
      lastPrice = ticker.lastPrice;
      if (!Number.isFinite(lastPrice) || lastPrice <= 0) {
        return { ok: false, error: "현재가를 가져올 수 없습니다." };
      }
    } catch (e) {
      return { ok: false, error: `시세 조회 실패: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (input.direction === "long" && triggerPrice <= lastPrice) {
      return { ok: false, error: "역지정가 롱은 트리거가가 현재가보다 높아야 합니다 (위로 돌파 추격)." };
    }
    if (input.direction === "short" && triggerPrice >= lastPrice) {
      return { ok: false, error: "역지정가 숏은 트리거가가 현재가보다 낮아야 합니다 (아래로 이탈 추격)." };
    }

    const stop = input.stop ?? (input.direction === "long" ? triggerPrice * 0.98 : triggerPrice * 1.02);
    const target = input.target ?? (input.direction === "long" ? triggerPrice * 1.04 : triggerPrice * 0.96);
    const timeframe = input.timeframe ?? "1h";
    const afford = await canAffordMargin(user.id, 0);
    const balance = afford.balance;

    const { data: trade, error: insertErr } = await supabase
      .from("trades")
      .insert({
        user_id: user.id,
        symbol,
        direction: input.direction,
        timeframe,
        entry: triggerPrice,
        stop,
        target,
        account_size: balance,
        allowed_loss_pct: 1,
        position_quantity: input.quantity,
        market_checks: {},
        psych_checks: {},
        context_flags: { leverage: input.leverage, directOrder: true, stopOrder: true },
        pre_grade: "B",
        pre_score: 5,
        pre_score_breakdown: [],
        pre_actions: [],
        pre_rr: Math.abs((target - triggerPrice) / (triggerPrice - stop)),
        simulation_meta: null,
        entry_actual: null,
        entry_slippage_pct: 0,
        fees_pct: feesPct,
        paper_margin: null, // 체결 시점에 결정
        is_paper: true,
        order_type: "stop",
        limit_price: triggerPrice,
        order_status: "pending",
        market_type: isSpot ? "spot" : "futures",
      })
      .select("id")
      .single();

    if (insertErr || !trade) {
      return { ok: false, error: `거래 생성 실패: ${insertErr?.message ?? "unknown"}` };
    }

    const { error: ploErr } = await supabase.from("pending_limit_orders").insert({
      user_id: user.id,
      trade_id: trade.id,
      symbol,
      direction: input.direction,
      limit_price: triggerPrice,
      quantity: input.quantity,
      leverage: input.leverage,
      stop,
      target,
      order_kind: "stop",
    });

    if (ploErr) {
      await supabase.from("trades").delete().eq("id", trade.id);
      return { ok: false, error: `역지정가 주문 등록 실패: ${ploErr.message}` };
    }

    revalidatePath("/app/virtual-trade");
    return {
      ok: true,
      tradeId: trade.id,
      orderType: "stop",
      limitPrice: triggerPrice,
      status: "pending",
    };
  }

  // ── 시장가 주문 (기존 로직 유지) ─────────────────────────────────────────
  // Get current market price + apply slippage
  let lastPrice: number;
  try {
    const ticker = await fetchTicker24h(symbol);
    lastPrice = ticker.lastPrice;
    if (!Number.isFinite(lastPrice) || lastPrice <= 0) {
      return { ok: false, error: "현재가를 가져올 수 없습니다." };
    }
  } catch (e) {
    return { ok: false, error: `시세 조회 실패: ${e instanceof Error ? e.message : String(e)}` };
  }

  const slippage = input.direction === "long" ? PAPER_SLIPPAGE_PCT : -PAPER_SLIPPAGE_PCT;
  const fillPrice = lastPrice * (1 + slippage / 100);

  // Validate stop/target (optional)
  if (input.stop != null) {
    if (input.direction === "long" && input.stop >= fillPrice) {
      return { ok: false, error: "롱 포지션의 손절가는 진입가보다 낮아야 합니다." };
    }
    if (input.direction === "short" && input.stop <= fillPrice) {
      return { ok: false, error: "숏 포지션의 손절가는 진입가보다 높아야 합니다." };
    }
  }
  if (input.target != null) {
    if (input.direction === "long" && input.target <= fillPrice) {
      return { ok: false, error: "롱 포지션의 목표가는 진입가보다 높아야 합니다." };
    }
    if (input.direction === "short" && input.target >= fillPrice) {
      return { ok: false, error: "숏 포지션의 목표가는 진입가보다 낮아야 합니다." };
    }
  }

  const margin = requiredMargin(fillPrice, input.quantity, input.leverage);

  // Pre-check wallet
  const afford = await canAffordMargin(user.id, margin);
  if (!afford.ok) return { ok: false, error: afford.reason };

  // Default stop/target = ±2% if not provided (so resolve cron has something to track)
  const stop = input.stop ?? (input.direction === "long" ? fillPrice * 0.98 : fillPrice * 1.02);
  const target = input.target ?? (input.direction === "long" ? fillPrice * 1.04 : fillPrice * 0.96);
  const timeframe = input.timeframe ?? "1h";

  // Insert trade row
  const { data: trade, error: insertErr } = await supabase
    .from("trades")
    .insert({
      user_id: user.id,
      symbol,
      direction: input.direction,
      timeframe,
      entry: fillPrice,
      stop,
      target,
      account_size: afford.balance,
      allowed_loss_pct: 1, // not meaningful for direct order
      position_quantity: input.quantity,
      market_checks: {},
      psych_checks: {},
      context_flags: {
        leverage: input.leverage,
        directOrder: true,
      },
      pre_grade: "B", // direct orders default to B
      pre_score: 5,
      pre_score_breakdown: [],
      pre_actions: [],
      pre_rr: Math.abs((target - fillPrice) / (fillPrice - stop)),
      simulation_meta: null,
      entry_actual: fillPrice,
      entry_slippage_pct: slippage,
      fees_pct: feesPct,
      paper_margin: margin,
      is_paper: true,
      order_type: "market",
      order_status: "filled",
      market_type: isSpot ? "spot" : "futures",
    })
    .select("id")
    .single();

  if (insertErr || !trade) {
    return { ok: false, error: `거래 생성 실패: ${insertErr?.message ?? "unknown"}` };
  }

  // Lock margin
  const lock = await lockMargin({
    userId: user.id,
    margin,
    tradeId: trade.id,
    note: `직접 주문 진입 (${input.direction === "long" ? "롱" : "숏"} ${symbol})`,
  });
  if (!lock.ok) {
    await supabase
      .from("trades")
      .update({ exchange_status: "error", exchange_error: lock.error })
      .eq("id", trade.id);
    return { ok: false, error: lock.error };
  }

  revalidatePath("/app/virtual-trade");
  revalidatePath("/app/journal");
  return {
    ok: true,
    tradeId: trade.id,
    fillPrice,
    margin,
    newBalance: lock.wallet?.usdtBalance,
    newAvailable: lock.wallet?.available,
  };
}

/** Cancel a pending limit order (before it is filled). */
export async function cancelLimitOrderAction(
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  "use server";
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  // 주문 조회 (본인 것인지 RLS로 검증)
  const { data: order, error: fetchErr } = await supabase
    .from("pending_limit_orders")
    .select("id, trade_id, status")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr || !order) return { ok: false, error: "주문을 찾을 수 없습니다." };
  if (order.status !== "open") return { ok: false, error: "이미 처리된 주문입니다." };

  // pending_limit_orders 취소
  const { error: cancelErr } = await supabase
    .from("pending_limit_orders")
    .update({ status: "canceled" })
    .eq("id", orderId);
  if (cancelErr) return { ok: false, error: `주문 취소 실패: ${cancelErr.message}` };

  // trades order_status 취소
  await supabase
    .from("trades")
    .update({ order_status: "canceled" })
    .eq("id", order.trade_id);

  revalidatePath("/app/virtual-trade");
  return { ok: true };
}

/** Manually close a virtual position at the current market price. */
export async function closeVirtualPositionAction(
  tradeId: string,
): Promise<{ ok: boolean; pnl?: number; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: trade, error } = await supabase
    .from("trades")
    .select(
      "id, symbol, direction, entry, entry_actual, stop, position_quantity, paper_margin, fees_pct, is_paper, closed_at",
    )
    .eq("id", tradeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !trade) return { ok: false, error: "포지션을 찾을 수 없습니다." };
  if (trade.closed_at) return { ok: false, error: "이미 종료된 포지션입니다." };
  if (!trade.is_paper) return { ok: false, error: "가상 포지션이 아닙니다." };

  // Fetch current price for closing
  let exitPrice: number;
  try {
    const ticker = await fetchTicker24h(trade.symbol);
    exitPrice = ticker.lastPrice;
  } catch (e) {
    return { ok: false, error: `시세 조회 실패: ${e instanceof Error ? e.message : String(e)}` };
  }

  // Apply slippage (unfavorable on exit too)
  const exitSlippage = trade.direction === "long" ? -PAPER_SLIPPAGE_PCT : PAPER_SLIPPAGE_PCT;
  const exitActual = exitPrice * (1 + exitSlippage / 100);

  const entryActual = Number(trade.entry_actual ?? trade.entry);
  const qty = Number(trade.position_quantity ?? 0);
  const feesPct = Number(trade.fees_pct ?? 0.12);
  const stopDist = Math.abs(entryActual - Number(trade.stop));

  const movement = trade.direction === "long" ? exitActual - entryActual : entryActual - exitActual;
  const realizedPnl = movement * qty - entryActual * (feesPct / 100) * qty;
  const resultR = stopDist > 0 ? (movement - (entryActual * (feesPct / 100))) / stopDist : 0;

  // Update trade
  const { error: upErr } = await supabase
    .from("trades")
    .update({
      exit_price: exitPrice,
      exit_actual: exitActual,
      result_r: resultR,
      exit_reason: "manual",
      closed_at: new Date().toISOString(),
      paper_realized_pnl: realizedPnl,
      note: `수동 청산 (수수료 차감 후 ${resultR.toFixed(2)}R)`,
    })
    .eq("id", tradeId);

  if (upErr) return { ok: false, error: upErr.message };

  // Settle wallet
  if (trade.paper_margin != null) {
    const { settleMargin } = await import("@/lib/paper-wallet");
    await settleMargin({
      userId: user.id,
      margin: Number(trade.paper_margin),
      realizedPnl,
      tradeId,
    });
  }

  revalidatePath("/app/virtual-trade");
  revalidatePath("/app/journal");
  return { ok: true, pnl: realizedPnl };
}
