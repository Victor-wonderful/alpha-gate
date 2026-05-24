"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  closeVirtualPositionAction,
  cancelLimitOrderAction,
} from "@/app/app/virtual-trade/order-actions";

const TRADE_EXTENSION_HOURS = 24;
const LIMIT_EXTENSION_HOURS = 12;
const MAX_EXTENSIONS = 1; // 거래당 1회만

/**
 * 진행 중 포지션 즉시 시장가 청산 — closeVirtualPositionAction 위임.
 * 경고 배너의 "지금 청산" 버튼에서 호출.
 */
export async function closeTradeNowAction(
  tradeId: string,
): Promise<{ ok: boolean; pnl?: number; error?: string }> {
  const res = await closeVirtualPositionAction(tradeId);
  if (res.ok) {
    revalidatePath("/app");
    revalidatePath("/app/journal");
  }
  return res;
}

/**
 * 진행 중 포지션 만료 +24h 연장. 거래당 1회만.
 * extended_until 갱신 + warned 플래그 reset → 새 사이클로 다시 D-N/D-1h 경고.
 */
export async function extendTradeAction(
  tradeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: trade, error } = await supabase
    .from("trades")
    .select(
      "id, timeframe, created_at, extended_until, extension_count, closed_at",
    )
    .eq("id", tradeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !trade) return { ok: false, error: "거래를 찾을 수 없습니다." };
  if (trade.closed_at)
    return { ok: false, error: "이미 종료된 거래입니다." };
  if ((trade.extension_count ?? 0) >= MAX_EXTENSIONS)
    return { ok: false, error: "이미 연장한 거래입니다 (1회 제한)." };

  // 현재 만료 시각 = extended_until || created_at + style timeout
  const now = Date.now();
  const base = trade.extended_until
    ? new Date(trade.extended_until).getTime()
    : now;
  const newExpiry = new Date(
    base + TRADE_EXTENSION_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { error: upErr } = await supabase
    .from("trades")
    .update({
      extended_until: newExpiry,
      extension_count: (trade.extension_count ?? 0) + 1,
      expiry_warned_first_at: null,
      expiry_warned_final_at: null,
    })
    .eq("id", tradeId);

  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath("/app");
  revalidatePath("/app/journal");
  revalidatePath("/app/virtual-trade");
  return { ok: true };
}

/**
 * "그냥 두기" — 경고 배너에서 dismiss. 자동 청산은 그대로 만료 시점에 발생.
 * 다시 경고 안 띄우도록 final 플래그까지 마킹.
 */
export async function dismissExpiryWarningAction(
  tradeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("trades")
    .update({
      // 1차/2차 모두 본 것으로 처리 → 더 이상 cron이 경고 발송 안 함
      expiry_warned_first_at: nowIso,
      expiry_warned_final_at: nowIso,
    })
    .eq("id", tradeId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/app");
  revalidatePath("/app/journal");
  return { ok: true };
}

/** 지정가 주문 즉시 취소 — cancelLimitOrderAction 위임. */
export async function cancelLimitNowAction(
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await cancelLimitOrderAction(orderId);
  if (res.ok) {
    revalidatePath("/app");
    revalidatePath("/app/journal");
  }
  return res;
}

/** 지정가 주문 만료 +12h 연장. 1회만. */
export async function extendLimitAction(
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: order, error } = await supabase
    .from("pending_limit_orders")
    .select("id, expires_at, extension_count, status")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !order) return { ok: false, error: "주문을 찾을 수 없습니다." };
  if (order.status !== "open")
    return { ok: false, error: "이미 처리된 주문입니다." };
  if ((order.extension_count ?? 0) >= MAX_EXTENSIONS)
    return { ok: false, error: "이미 연장한 주문입니다 (1회 제한)." };

  const newExpiry = new Date(
    new Date(order.expires_at).getTime() +
      LIMIT_EXTENSION_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { error: upErr } = await supabase
    .from("pending_limit_orders")
    .update({
      expires_at: newExpiry,
      extension_count: (order.extension_count ?? 0) + 1,
      expiry_warned_first_at: null,
      expiry_warned_final_at: null,
    })
    .eq("id", orderId);

  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath("/app");
  revalidatePath("/app/journal");
  revalidatePath("/app/virtual-trade");
  return { ok: true };
}

/** 지정가 주문 dismiss — 더 이상 경고 안 띄움. */
export async function dismissLimitExpiryWarningAction(
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("pending_limit_orders")
    .update({
      expiry_warned_first_at: nowIso,
      expiry_warned_final_at: nowIso,
    })
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/app");
  revalidatePath("/app/journal");
  return { ok: true };
}
