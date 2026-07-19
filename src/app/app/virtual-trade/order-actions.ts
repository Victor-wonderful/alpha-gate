"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { fetchTicker24h } from "@/lib/analysis/binance";
import { canAffordMargin, lockMargin, requiredMargin } from "@/lib/paper-wallet";
import { buildLadder, type LadderTierInput } from "@/lib/ladder";

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
  /** 현물 적립 플랜의 회차 실행일 때 그 플랜 id. trades.context_flags 에 남겨
   *  진행률·평단 집계에 쓴다(별도 체결 테이블을 만들지 않는 이유). */
  dcaPlanId?: string;
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

// 슬리피지 미적용 — 시장가 진입/청산 모두 조회한 실제 시장가 그대로 체결.
// Binance USDT-M Futures 왕복 수수료 — 테이커+메이커 합쳐 최대 0.075%.
const PAPER_FEES_PCT_FUTURES = 0.075;
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
    revalidatePath("/app");
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
    revalidatePath("/app");
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

  // 시장가 주문은 조회한 실제 시장가 그대로 체결한다 (슬리피지 미적용).
  // 폼에 표시되는 현재가와 기록되는 진입가를 일치시키기 위함. 비용은 fees_pct(왕복 0.075%)로만 반영.
  const fillPrice = lastPrice;

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
        ...(input.dcaPlanId ? { dcaPlanId: input.dcaPlanId } : {}),
      },
      pre_grade: "B", // direct orders default to B
      pre_score: 5,
      pre_score_breakdown: [],
      pre_actions: [],
      pre_rr: Math.abs((target - fillPrice) / (fillPrice - stop)),
      simulation_meta: null,
      entry_actual: fillPrice,
      entry_slippage_pct: 0,
      fees_pct: feesPct,
      paper_margin: margin,
      is_paper: true,
      order_type: "market",
      order_status: "filled",
      filled_at: new Date().toISOString(),
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
  revalidatePath("/app");
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

// ── 분할 진입(래더) 그룹 발주 ──────────────────────────────────────────────
// 시나리오 1~3차 tier를 한 세트 지정가 예약주문으로 발주 → 같은 entry_group_id 로
// 묶어 한 포지션처럼 추적. 공유 손절/목표, 위험은 그룹당 한 번. v1은 되돌림(LIMIT)만.
// cf. docs/분할진입-설계.md

export interface PlaceLadderInput {
  symbol: string;
  direction: "long" | "short";
  leverage: number;
  /** 공유 손절 (전 tier 동일). */
  stop: number;
  /** 공유 목표 (전 tier 동일). */
  target: number;
  /** 사이징 기준 계좌 자금. */
  accountSize: number;
  /** 그룹 전체 위험 % (한 번만 차지). */
  riskPct: number;
  timeframe?: "15m" | "1h" | "4h" | "1D";
  tiers: LadderTierInput[];
  /** 1차를 지금 시장가로 체결하고 2차 이후만 되돌림 지정가로 예약한다.
   *  거래 폼에서 "지금 바로"를 고른 경우. 1차 가격은 실제 체결가로 대체된다. */
  immediateFirst?: boolean;
  /** 진입 시 평가 — AI 시나리오에서 넘어온 경우 실제 등급을 그대로 기록한다.
   *  거래소 화면에서 수동 발주하면 없을 수 있어 선택값. */
  evaluation?: {
    grade: "A" | "B" | "C" | "D";
    score: number;
    scoreBreakdown?: unknown;
    actions?: unknown;
    marketChecks?: Record<string, boolean>;
    gradeOverride?: boolean;
  };
}

export interface PlaceLadderResult {
  ok: boolean;
  error?: string;
  groupId?: string;
  /** 발주된 tier 수. */
  count?: number;
  weightedEntry?: number;
  totalQuantity?: number;
}

export async function placeLadderOrderAction(input: PlaceLadderInput): Promise<PlaceLadderResult> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  if (!input.symbol || !/^[A-Z0-9]{2,15}USDT$/i.test(input.symbol))
    return { ok: false, error: "심볼이 유효하지 않습니다 (예: BTCUSDT)." };
  if (input.direction !== "long" && input.direction !== "short")
    return { ok: false, error: "방향이 유효하지 않습니다." };
  if (!Number.isFinite(input.leverage) || input.leverage < 1 || input.leverage > 125)
    return { ok: false, error: "레버리지는 1~125 사이여야 합니다." };
  if (!Array.isArray(input.tiers) || input.tiers.length === 0)
    return { ok: false, error: "분할 진입 tier가 없습니다." };

  const symbol = input.symbol.toUpperCase();
  const timeframe = input.timeframe ?? "1h";

  // 현재가 조회 (되돌림 쪽 검증 + 즉시 통과 방지).
  let lastPrice: number;
  try {
    const ticker = await fetchTicker24h(symbol);
    lastPrice = ticker.lastPrice;
    if (!Number.isFinite(lastPrice) || lastPrice <= 0)
      return { ok: false, error: "현재가를 가져올 수 없습니다." };
  } catch (e) {
    return { ok: false, error: `시세 조회 실패: ${e instanceof Error ? e.message : String(e)}` };
  }

  // "1차 즉시" 모드면 1차 가격을 실제 체결가(현재가)로 바꾼 뒤 사이징한다.
  // 시나리오상 1차는 되돌림 자리라 현재가보다 유리한데, 지금 체결하면 그 가격이 아니다.
  // 실제 체결가로 가중평균을 잡아야 손절까지 거리(=위험)가 실제와 맞는다.
  const sortedTiers = [...input.tiers].sort((a, b) => a.tier - b.tier);
  const firstTierNo = sortedTiers[0]?.tier;
  const sizingTiers = input.immediateFirst
    ? sortedTiers.map((t) => (t.tier === firstTierNo ? { ...t, price: lastPrice } : t))
    : sortedTiers;

  // 래더 사이징 (가중평균 진입 ↔ 공유 손절 기준 총수량 → 비중 배분).
  const ladder = buildLadder({
    direction: input.direction,
    tiers: sizingTiers,
    stop: input.stop,
    target: input.target,
    accountSize: input.accountSize,
    riskPct: input.riskPct,
    currentPrice: lastPrice,
    allowImmediateFirst: input.immediateFirst,
  });
  if (!ladder.ok) return { ok: false, error: ladder.error };

  const placeable = ladder.tiers.filter((t) => t.quantity > 0);
  if (placeable.length === 0) return { ok: false, error: "수량이 0이라 발주할 tier가 없습니다." };

  const ev = input.evaluation;
  // D등급은 사용자가 화면에서 명시적으로 강행(override)한 경우에만 통과시킨다.
  if (ev?.grade === "D" && !ev.gradeOverride)
    return { ok: false, error: "D등급 거래는 진입할 수 없습니다." };

  const groupId = crypto.randomUUID();
  const feesPct = PAPER_FEES_PCT_FUTURES;
  // 저널에 남길 사이징 기준 = 실제로 수량을 계산할 때 쓴 계좌 금액.
  // (canAffordMargin(_, 0) 은 "증거금 0"을 오류로 보고 balance 0을 돌려주므로 쓰면 안 된다.)
  const balance = input.accountSize;

  // "1차 즉시" 모드에서 1차는 지금 체결되므로 마진이 즉시 잡힌다. 잔액을 먼저 확인해
  // 그룹을 만들다 중간에 실패하는 상황을 피한다.
  const immediateTier = input.immediateFirst ? placeable.find((t) => t.tier === firstTierNo) : undefined;
  const immediateMargin = immediateTier
    ? requiredMargin(lastPrice, immediateTier.quantity, input.leverage)
    : 0;
  if (immediateTier) {
    const check = await canAffordMargin(user.id, immediateMargin);
    if (!check.ok) return { ok: false, error: check.reason };
  }

  // tier마다 trade + (예약이면) pending_limit_order 삽입. 하나라도 실패하면 그룹 전체 롤백.
  for (const t of placeable) {
    // 1차 즉시 체결 tier는 지금 시장가로 들어간다. 나머지는 되돌림 지정가 예약.
    const isImmediate = !!immediateTier && t.tier === immediateTier.tier;
    const pre_rr = Math.abs((input.target - t.price) / (t.price - input.stop));
    const { data: trade, error: insertErr } = await supabase
      .from("trades")
      .insert({
        user_id: user.id,
        symbol,
        direction: input.direction,
        timeframe,
        entry: t.price,
        stop: input.stop,
        target: input.target,
        account_size: balance,
        allowed_loss_pct: input.riskPct,
        position_quantity: t.quantity,
        psych_checks: {},
        context_flags: { leverage: input.leverage, directOrder: !ev, limitOrder: true, ladder: true },
        market_checks: ev?.marketChecks ?? {},
        // 평가가 넘어오면 그대로 기록 — 저널·통계가 실제 등급을 반영해야 한다.
        // 없으면(거래소 수동 발주) 중립값.
        pre_grade: ev?.grade ?? "B",
        pre_score: ev?.score ?? 5,
        pre_score_breakdown: ev?.scoreBreakdown ?? [],
        pre_actions: ev?.actions ?? [],
        grade_override: ev?.gradeOverride ?? false,
        pre_rr,
        simulation_meta: null,
        entry_actual: isImmediate ? t.price : null,
        entry_slippage_pct: 0,
        fees_pct: feesPct,
        paper_margin: isImmediate ? immediateMargin : null, // 예약분은 체결 시점에 결정
        is_paper: true,
        order_type: isImmediate ? "market" : "limit",
        limit_price: isImmediate ? null : t.price,
        order_status: isImmediate ? "filled" : "pending",
        filled_at: isImmediate ? new Date().toISOString() : null,
        market_type: "futures",
        entry_group_id: groupId,
        entry_tier: t.tier,
        entry_weight: t.weight,
      })
      .select("id")
      .single();

    if (insertErr || !trade) {
      await rollbackLadderGroup(supabase, user.id, groupId);
      return { ok: false, error: `거래 생성 실패: ${insertErr?.message ?? "unknown"}` };
    }

    // 즉시 체결분은 지금 마진을 잠근다. 예약분은 체결 시 filler 가 잠근다.
    if (isImmediate) {
      const lock = await lockMargin({
        userId: user.id,
        margin: immediateMargin,
        tradeId: trade.id,
        note: `분할 진입 1차 즉시 체결 (${input.direction === "long" ? "롱" : "숏"} ${symbol})`,
      });
      if (!lock.ok) {
        await rollbackLadderGroup(supabase, user.id, groupId);
        return { ok: false, error: lock.error };
      }
      continue; // 즉시 체결분은 예약주문 행을 만들지 않는다.
    }

    const { error: ploErr } = await supabase.from("pending_limit_orders").insert({
      user_id: user.id,
      trade_id: trade.id,
      symbol,
      direction: input.direction,
      limit_price: t.price,
      quantity: t.quantity,
      leverage: input.leverage,
      stop: input.stop,
      target: input.target,
      order_kind: "limit",
      entry_group_id: groupId,
      entry_tier: t.tier,
    });

    if (ploErr) {
      await rollbackLadderGroup(supabase, user.id, groupId);
      return { ok: false, error: `지정가 주문 등록 실패: ${ploErr.message}` };
    }
  }

  revalidatePath("/app/virtual-trade");
  revalidatePath("/app");
  return {
    ok: true,
    groupId,
    count: placeable.length,
    weightedEntry: ladder.weightedEntry,
    totalQuantity: ladder.totalQuantity,
  };
}

/** 부분 삽입된 그룹을 정리 (best-effort). trades ON DELETE CASCADE 로 pending 도 삭제됨. */
async function rollbackLadderGroup(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  userId: string,
  groupId: string,
) {
  await supabase.from("pending_limit_orders").delete().eq("entry_group_id", groupId).eq("user_id", userId);
  await supabase.from("trades").delete().eq("entry_group_id", groupId).eq("user_id", userId);
}

/** 래더 그룹의 미체결 tier 전부 취소 (체결분은 포지션으로 유지). */
export async function cancelLadderGroupAction(
  groupId: string,
): Promise<{ ok: boolean; canceled?: number; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  if (!groupId) return { ok: false, error: "그룹 ID가 없습니다." };

  const nowIso = new Date().toISOString();
  const { data: canceledOrders, error: cancelErr } = await supabase
    .from("pending_limit_orders")
    .update({ status: "canceled", resolved_at: nowIso, resolve_reason: "user_canceled_ladder_group" })
    .eq("entry_group_id", groupId)
    .eq("user_id", user.id)
    .eq("status", "open")
    .select("trade_id");
  if (cancelErr) return { ok: false, error: `그룹 취소 실패: ${cancelErr.message}` };

  await supabase
    .from("trades")
    .update({ order_status: "canceled" })
    .eq("entry_group_id", groupId)
    .eq("user_id", user.id)
    .eq("order_status", "pending");

  revalidatePath("/app/virtual-trade");
  revalidatePath("/app");
  return { ok: true, canceled: canceledOrders?.length ?? 0 };
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
    .update({
      status: "canceled",
      resolved_at: new Date().toISOString(),
      resolve_reason: "user_canceled_exchange_ui",
    })
    .eq("id", orderId);
  if (cancelErr) return { ok: false, error: `주문 취소 실패: ${cancelErr.message}` };

  // trades order_status 취소
  await supabase
    .from("trades")
    .update({ order_status: "canceled" })
    .eq("id", order.trade_id);

  revalidatePath("/app/virtual-trade");
  revalidatePath("/app");
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

  // 슬리피지 미적용 — 조회한 실제 시장가 그대로 청산.
  const exitActual = exitPrice;

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
  revalidatePath("/app");
  revalidatePath("/app/journal");
  return { ok: true, pnl: realizedPnl };
}
