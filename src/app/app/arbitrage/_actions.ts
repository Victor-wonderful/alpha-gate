"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { canAffordMargin, lockMargin, settleMargin } from "@/lib/paper-wallet";

export interface EnterArbitrageInput {
  symbol: string;
  notionalUsd: number;
  longExchange: string;
  longEntryPrice: number;
  shortExchange: string;
  shortEntryPrice: number;
  entryPremiumPct?: number;
  /** 청산 목표 김프 (%). 기본 1.0. cron 이 현재 김프 >= 이 값일 때 자동 청산. */
  targetPremiumPct?: number;
}

/** 김치 프리미엄 차익거래 진입 — 양쪽 다리 노출 합(2×notional)을 마진으로 잠금. */
export async function enterArbitrageAction(
  p: EnterArbitrageInput,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  if (!Number.isFinite(p.notionalUsd) || p.notionalUsd < 100)
    return { ok: false, error: "노출 금액은 $100 이상이어야 합니다." };
  if (p.notionalUsd > 100_000)
    return { ok: false, error: "노출 금액은 $100,000 이하" };
  if (
    !Number.isFinite(p.longEntryPrice) ||
    !Number.isFinite(p.shortEntryPrice) ||
    p.longEntryPrice <= 0 ||
    p.shortEntryPrice <= 0
  )
    return { ok: false, error: "가격 정보가 유효하지 않습니다." };

  const targetPct = p.targetPremiumPct ?? 1.0;
  if (!Number.isFinite(targetPct) || targetPct <= 0 || targetPct > 20)
    return { ok: false, error: "청산 목표 김프는 0~20% 사이여야 합니다." };
  if (p.entryPremiumPct != null && targetPct <= p.entryPremiumPct)
    return {
      ok: false,
      error: "청산 목표 김프는 진입 김프보다 커야 합니다.",
    };

  // 양쪽 다리 노출 = 2 × notional. 둘 다 1× 레버리지로 가정.
  const totalMargin = p.notionalUsd * 2;

  const afford = await canAffordMargin(user.id, totalMargin);
  if (!afford.ok) return { ok: false, error: afford.reason };

  const longQty = p.notionalUsd / p.longEntryPrice;
  const shortQty = p.notionalUsd / p.shortEntryPrice;

  const { data, error } = await supabase
    .from("arbitrage_positions")
    .insert({
      user_id: user.id,
      kind: "kimchi",
      symbol: p.symbol,
      notional_usd: p.notionalUsd,
      long_exchange: p.longExchange,
      long_entry_price: p.longEntryPrice,
      long_qty: longQty,
      short_exchange: p.shortExchange,
      short_entry_price: p.shortEntryPrice,
      short_qty: shortQty,
      entry_premium_pct: p.entryPremiumPct ?? null,
      target_premium_pct: targetPct,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "진입 실패" };

  await lockMargin({
    userId: user.id,
    margin: totalMargin,
    tradeId: data.id,
    note: `차익거래 (김치 ${p.symbol})`,
  });

  revalidatePath("/app/arbitrage");
  return { ok: true, id: data.id };
}

/** 차익거래 청산 — 양쪽 다리 현재가로 동시 청산 + 마진 settle. */
export async function closeArbitrageAction(
  id: string,
  longExitPrice: number,
  shortExitPrice: number,
): Promise<{ ok: boolean; error?: string; pnl?: number }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: pos, error } = await supabase
    .from("arbitrage_positions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !pos) return { ok: false, error: "포지션을 찾을 수 없습니다." };
  if (pos.status !== "open")
    return { ok: false, error: "이미 종료된 포지션입니다." };
  if (!Number.isFinite(longExitPrice) || !Number.isFinite(shortExitPrice))
    return { ok: false, error: "청산 가격이 유효하지 않습니다." };

  const longQty = Number(pos.long_qty);
  const shortQty = Number(pos.short_qty);
  const longEntry = Number(pos.long_entry_price);
  const shortEntry = Number(pos.short_entry_price);

  // PnL — 양쪽 다리 합. 수수료 0.08% 왕복.
  const longPnl = (longExitPrice - longEntry) * longQty;
  const shortPnl = (shortEntry - shortExitPrice) * shortQty;
  const fees = (longEntry * longQty + shortEntry * shortQty) * 0.0008;
  const realizedPnl = longPnl + shortPnl - fees;

  const { error: upErr } = await supabase
    .from("arbitrage_positions")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      long_exit_price: longExitPrice,
      short_exit_price: shortExitPrice,
      realized_pnl: realizedPnl,
      close_reason: "manual",
    })
    .eq("id", id);

  if (upErr) return { ok: false, error: upErr.message };

  const totalMargin = Number(pos.notional_usd) * 2;
  await settleMargin({
    userId: user.id,
    margin: totalMargin,
    realizedPnl,
    tradeId: id,
  });

  revalidatePath("/app/arbitrage");
  return { ok: true, pnl: realizedPnl };
}
