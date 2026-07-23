"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseService } from "@/lib/supabase/service";
import { dispatch } from "@/lib/notify-dispatch";
import { decryptSecret } from "@/lib/crypto";
import { getAdapter } from "@/lib/exchanges";
import type {
  ExchangeAdapter,
  ExchangeCredentials,
  UnifiedOrderResult,
} from "@/lib/exchanges";
import { checkLiveGuards } from "@/lib/live-guards";
import type { GradeResult, SizingResult, TradeInput } from "@/types/trade";

export interface LiveTradeArgs {
  input: TradeInput;
  grade: GradeResult;
  sizing: SizingResult;
  leverage: number;
  apiKeyId: string;
  forecast?: unknown;
}

export interface LiveTradeResult {
  ok: boolean;
  tradeId?: string;
  /** All exchange orders that were submitted. */
  orders?: Array<{
    kind: "entry" | "stop_loss" | "take_profit";
    orderId: string;
    status: string;
  }>;
  error?: string;
  /** True when entry filled but a protective order failed. User intervention may be needed. */
  partial?: boolean;
}

/** Server-side credential fetch (decrypt) + adapter resolution.
 *  Never expose secrets to the client. */
async function loadCredentials(
  apiKeyId: string,
  userId: string,
): Promise<
  | { creds: ExchangeCredentials; exchange: string; adapter: ExchangeAdapter }
  | { error: string }
> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("exchange_api_keys")
    .select(
      "exchange, testnet, api_key_encrypted, api_secret_encrypted, verification_status, permissions",
    )
    .eq("id", apiKeyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return { error: "API 키를 찾을 수 없습니다." };
  if (data.verification_status !== "valid") {
    return { error: "선택한 키가 검증 상태가 아닙니다. 설정 → API 키에서 재검증하세요." };
  }
  const perms = (data.permissions ?? {}) as { canTrade?: boolean; canWithdraw?: boolean };
  if (!perms.canTrade) {
    return { error: "이 키에 거래 권한이 없습니다." };
  }
  if (perms.canWithdraw) {
    return { error: "이 키에 출금 권한이 켜져 있어 실거래에 사용할 수 없습니다. 키를 재발급하세요." };
  }

  let adapter: ExchangeAdapter;
  try {
    adapter = getAdapter(data.exchange as string);
  } catch {
    return { error: `${data.exchange} 실거래는 아직 지원하지 않습니다.` };
  }

  return {
    creds: {
      apiKey: decryptSecret(data.api_key_encrypted),
      apiSecret: decryptSecret(data.api_secret_encrypted),
      testnet: Boolean(data.testnet),
    },
    exchange: data.exchange as string,
    adapter,
  };
}

/** Insert an exchange_orders row from a normalized result (or an error). */
async function logOrder(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  args: {
    userId: string;
    tradeId: string;
    apiKeyId: string;
    exchange: string;
    symbol: string;
    kind: "entry" | "stop_loss" | "take_profit";
    side: "buy" | "sell";
    type: "market" | "stop_market" | "take_profit_market";
    quantity: number;
    stopPrice?: number;
    reduceOnly?: boolean;
    result?: UnifiedOrderResult;
    errorMessage?: string;
  },
) {
  await supabase.from("exchange_orders").insert({
    user_id: args.userId,
    trade_id: args.tradeId,
    api_key_id: args.apiKeyId,
    exchange: args.exchange,
    symbol: args.symbol,
    kind: args.kind,
    side: args.side,
    type: args.type,
    stop_price: args.stopPrice ?? null,
    quantity: args.quantity,
    reduce_only: args.reduceOnly ?? false,
    exchange_order_id: args.result ? args.result.orderId : null,
    status: args.result ? args.result.status : args.errorMessage ? "error" : "pending",
    filled_qty: args.result ? args.result.executedQty : 0,
    avg_fill_price: args.result?.avgPrice ?? null,
    error_message: args.errorMessage ?? null,
    raw_response: args.result ? (args.result.raw as object) : null,
  });
}

/**
 * Submit a live trade to the selected exchange (Binance / Bybit).
 *
 * Sequence:
 *  1. Create the trade row (is_paper=false, status=pending)
 *  2. Set leverage
 *  3. Place market entry → record orderId
 *  4. (Best-effort) confirm fill state via getOrder
 *  5. Place stop-loss (reduce-only)
 *  6. Place take-profit (reduce-only)
 *  7. If 5 or 6 fail → close the position (reduce-only market) and mark error
 *  8. Update trade row with final status
 */
export async function placeLiveTradeAction(args: LiveTradeArgs): Promise<LiveTradeResult> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const credResult = await loadCredentials(args.apiKeyId, user.id);
  if ("error" in credResult) return { ok: false, error: credResult.error };
  const { creds, exchange, adapter } = credResult;

  const { input, grade, sizing, leverage, forecast } = args;
  if (!sizing.valid || sizing.quantity <= 0) {
    return { ok: false, error: "사이징이 유효하지 않습니다. 진입/손절/리스크 확인 후 다시 시도." };
  }

  // Pre-trade safety guards (daily loss limit, exposure caps, grade D block, dup block).
  const guard = await checkLiveGuards({
    userId: user.id,
    symbol: input.symbol.toUpperCase(),
    direction: input.direction,
    grade: grade.grade,
    notional: sizing.positionSize,
    accountSize: input.accountSize,
  });
  if (!guard.ok) {
    return { ok: false, error: `안전장치 차단: ${guard.reason}` };
  }

  // Step 1: Create trade row.
  const { data: trade, error: tradeErr } = await supabase
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
        leverage,
        trigger: input.trigger,
        marketCtx: input.marketCtx,
      },
      pre_grade: grade.grade,
      pre_score: grade.score,
      pre_score_breakdown: grade.reasons,
      pre_actions: grade.actions,
      pre_rr: grade.rr,
      simulation_meta: forecast
        ? {
            kind: "monte_carlo_forecast",
            at: new Date().toISOString(),
            ...(typeof forecast === "object" && forecast !== null ? forecast : {}),
          }
        : null,
      exchange,
      exchange_api_key_id: args.apiKeyId,
      is_paper: false,
      exchange_status: "pending",
    })
    .select("id")
    .single();

  if (tradeErr || !trade) {
    return { ok: false, error: `거래 행 생성 실패: ${tradeErr?.message ?? "unknown"}` };
  }

  const tradeId = trade.id as string;
  const symbol = input.symbol.toUpperCase();
  const entrySide: "BUY" | "SELL" = input.direction === "long" ? "BUY" : "SELL";
  const exitSide: "BUY" | "SELL" = input.direction === "long" ? "SELL" : "BUY";
  const qty = sizing.quantity;

  // Step 2: Leverage.
  try {
    await adapter.setLeverage(creds, symbol, leverage);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("trades")
      .update({ exchange_status: "error", exchange_error: `레버리지 설정 실패: ${msg}` })
      .eq("id", tradeId);
    return { ok: false, tradeId, error: `레버리지 설정 실패: ${msg}` };
  }

  // Step 3: Entry (market).
  let entryRes: UnifiedOrderResult;
  try {
    entryRes = await adapter.placeMarketOrder(creds, { symbol, side: entrySide, quantity: qty });
    await logOrder(supabase, {
      userId: user.id,
      tradeId,
      apiKeyId: args.apiKeyId,
      exchange,
      symbol,
      kind: "entry",
      side: entrySide.toLowerCase() as "buy" | "sell",
      type: "market",
      quantity: qty,
      result: entryRes,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logOrder(supabase, {
      userId: user.id,
      tradeId,
      apiKeyId: args.apiKeyId,
      exchange,
      symbol,
      kind: "entry",
      side: entrySide.toLowerCase() as "buy" | "sell",
      type: "market",
      quantity: qty,
      errorMessage: msg,
    });
    await supabase
      .from("trades")
      .update({ exchange_status: "error", exchange_error: `진입 실패: ${msg}` })
      .eq("id", tradeId);
    return { ok: false, tradeId, error: `진입 주문 실패: ${msg}` };
  }

  // Step 4: Confirm fill (best-effort; market orders usually fill immediately).
  try {
    await adapter.getOrder(creds, symbol, entryRes.orderId);
  } catch {
    // Ignore — venues occasionally lag on the read after a write.
  }

  // Step 5: Stop-loss (reduce-only). Failures here are critical → auto-close.
  let stopRes: UnifiedOrderResult | null = null;
  let stopError: string | null = null;
  try {
    stopRes = await adapter.placeStopMarketOrder(creds, {
      symbol,
      side: exitSide,
      stopPrice: input.stop,
      quantity: qty,
    });
    await logOrder(supabase, {
      userId: user.id,
      tradeId,
      apiKeyId: args.apiKeyId,
      exchange,
      symbol,
      kind: "stop_loss",
      side: exitSide.toLowerCase() as "buy" | "sell",
      type: "stop_market",
      quantity: qty,
      stopPrice: input.stop,
      reduceOnly: true,
      result: stopRes,
    });
  } catch (e) {
    stopError = e instanceof Error ? e.message : String(e);
    await logOrder(supabase, {
      userId: user.id,
      tradeId,
      apiKeyId: args.apiKeyId,
      exchange,
      symbol,
      kind: "stop_loss",
      side: exitSide.toLowerCase() as "buy" | "sell",
      type: "stop_market",
      quantity: qty,
      stopPrice: input.stop,
      reduceOnly: true,
      errorMessage: stopError,
    });
  }

  // Step 6: Take-profit (reduce-only).
  let tpRes: UnifiedOrderResult | null = null;
  let tpError: string | null = null;
  if (!stopError) {
    try {
      tpRes = await adapter.placeTakeProfitMarketOrder(creds, {
        symbol,
        side: exitSide,
        stopPrice: input.target,
        quantity: qty,
      });
      await logOrder(supabase, {
        userId: user.id,
        tradeId,
        apiKeyId: args.apiKeyId,
        exchange,
        symbol,
        kind: "take_profit",
        side: exitSide.toLowerCase() as "buy" | "sell",
        type: "take_profit_market",
        quantity: qty,
        stopPrice: input.target,
        reduceOnly: true,
        result: tpRes,
      });
    } catch (e) {
      tpError = e instanceof Error ? e.message : String(e);
      await logOrder(supabase, {
        userId: user.id,
        tradeId,
        apiKeyId: args.apiKeyId,
        exchange,
        symbol,
        kind: "take_profit",
        side: exitSide.toLowerCase() as "buy" | "sell",
        type: "take_profit_market",
        quantity: qty,
        stopPrice: input.target,
        reduceOnly: true,
        errorMessage: tpError,
      });
    }
  }

  // Step 7: If protective orders failed, close the entry (reduce-only market).
  if (stopError || tpError) {
    const failedKind = stopError ? "손절" : "익절";
    const reason = stopError ?? tpError ?? "unknown";
    let closeNote = "";
    try {
      // If stop succeeded but TP failed, cancel stop first.
      if (stopRes && tpError) {
        try {
          await adapter.cancelOrder(creds, symbol, stopRes.orderId);
        } catch {
          /* ignore */
        }
      }
      const closeRes = await adapter.placeMarketOrder(creds, {
        symbol,
        side: exitSide,
        quantity: qty,
        reduceOnly: true,
      });
      closeNote = ` 진입 자동 청산 완료 (주문 ${closeRes.orderId}).`;
    } catch (e) {
      closeNote = ` 자동 청산도 실패: ${e instanceof Error ? e.message : String(e)}. 거래소에서 직접 확인 필요.`;
    }
    await supabase
      .from("trades")
      .update({
        exchange_status: "error",
        exchange_error: `${failedKind} 주문 실패: ${reason}.${closeNote}`,
      })
      .eq("id", tradeId);
    return {
      ok: false,
      tradeId,
      partial: true,
      error: `${failedKind} 주문 실패: ${reason}.${closeNote}`,
    };
  }

  // Step 8: All good → mark open.
  await supabase.from("trades").update({ exchange_status: "open" }).eq("id", tradeId);

  // Telegram/Discord notification (best-effort).
  await dispatch(user.id, "ai_coach_done", {
    title: "실거래 진입 완료",
    body: `${symbol} ${input.direction === "long" ? "롱" : "숏"} · 수량 ${qty} · 진입 #${entryRes.orderId} · 손절 #${stopRes?.orderId ?? "-"} · 익절 #${tpRes?.orderId ?? "-"}`,
    tradeId,
  });

  revalidatePath("/app/journal");
  revalidatePath("/app/dashboard");
  return {
    ok: true,
    tradeId,
    orders: [
      { kind: "entry", orderId: entryRes.orderId, status: entryRes.status },
      ...(stopRes ? [{ kind: "stop_loss" as const, orderId: stopRes.orderId, status: stopRes.status }] : []),
      ...(tpRes ? [{ kind: "take_profit" as const, orderId: tpRes.orderId, status: tpRes.status }] : []),
    ],
  };
}

/** Manual sync — refresh order statuses for the current user from the venue.
 *  Used by a UI button on the journal page so users can re-check without waiting for cron. */
export async function syncMyOrdersAction(): Promise<{
  ok: boolean;
  closed: number;
  refreshed: number;
  error?: string;
}> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, closed: 0, refreshed: 0, error: "로그인이 필요합니다." };

  const service = getSupabaseService();

  const { data: trades, error } = await service
    .from("trades")
    .select("id, user_id, symbol, direction, entry, stop, target, exchange, exchange_api_key_id")
    .eq("user_id", user.id)
    .eq("is_paper", false)
    .eq("exchange_status", "open")
    .is("closed_at", null)
    .limit(50);

  if (error) return { ok: false, closed: 0, refreshed: 0, error: error.message };
  if (!trades || trades.length === 0) {
    return { ok: true, closed: 0, refreshed: 0 };
  }

  let closed = 0;
  let refreshed = 0;

  for (const trade of trades) {
    if (!trade.exchange_api_key_id) continue;

    let adapter: ExchangeAdapter;
    try {
      adapter = getAdapter(trade.exchange as string);
    } catch {
      continue;
    }

    const { data: keyRow } = await service
      .from("exchange_api_keys")
      .select("api_key_encrypted, api_secret_encrypted, testnet")
      .eq("id", trade.exchange_api_key_id)
      .maybeSingle();
    if (!keyRow) continue;

    let creds: ExchangeCredentials;
    try {
      creds = {
        apiKey: decryptSecret(keyRow.api_key_encrypted as string),
        apiSecret: decryptSecret(keyRow.api_secret_encrypted as string),
        testnet: Boolean(keyRow.testnet),
      };
    } catch {
      continue;
    }

    const { data: orders } = await service
      .from("exchange_orders")
      .select("id, kind, status, exchange_order_id")
      .eq("trade_id", trade.id);
    if (!orders) continue;

    let exitPrice = 0;
    let exitReason: "target" | "stop" | null = null;
    let exitFillAvg = 0;
    const byKind: Record<string, (typeof orders)[number]> = {};
    for (const o of orders) byKind[o.kind as string] = o;

    for (const kind of ["stop_loss", "take_profit"] as const) {
      const order = byKind[kind];
      if (!order || !order.exchange_order_id) continue;
      if (["filled", "canceled", "rejected", "expired"].includes(order.status as string)) continue;
      try {
        const remote = await adapter.getOrder(
          creds,
          trade.symbol as string,
          order.exchange_order_id as string,
        );
        refreshed++;
        await service
          .from("exchange_orders")
          .update({
            status: remote.status,
            filled_qty: remote.executedQty,
            avg_fill_price: remote.avgPrice ?? null,
            raw_response: (remote.raw as object) ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);
        if (remote.status === "filled") {
          exitFillAvg =
            remote.avgPrice ?? (kind === "stop_loss" ? Number(trade.stop) : Number(trade.target));
          exitPrice = exitFillAvg;
          exitReason = kind === "stop_loss" ? "stop" : "target";

          const otherKind = kind === "stop_loss" ? "take_profit" : "stop_loss";
          const other = byKind[otherKind];
          if (
            other?.exchange_order_id &&
            !["filled", "canceled", "rejected", "expired"].includes(other.status as string)
          ) {
            try {
              await adapter.cancelOrder(
                creds,
                trade.symbol as string,
                other.exchange_order_id as string,
              );
              await service
                .from("exchange_orders")
                .update({ status: "canceled", updated_at: new Date().toISOString() })
                .eq("id", other.id);
            } catch {
              /* ignore */
            }
          }

          const risk = Math.abs(Number(trade.entry) - Number(trade.stop));
          const realizedDelta =
            trade.direction === "long"
              ? exitFillAvg - Number(trade.entry)
              : Number(trade.entry) - exitFillAvg;
          const resultR = risk > 0 ? realizedDelta / risk : 0;

          await service
            .from("trades")
            .update({
              exit_price: exitPrice,
              result_r: resultR,
              exit_reason: exitReason,
              closed_at: new Date().toISOString(),
              exchange_status: "filled",
            })
            .eq("id", trade.id);
          closed++;
          break;
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (closed > 0) {
    revalidatePath("/app/journal");
    revalidatePath("/app/dashboard");
  }
  return { ok: true, closed, refreshed };
}
