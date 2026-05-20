"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { depositFunds, resetWallet } from "@/lib/paper-wallet";

export async function depositFundsAction(
  amount: number,
): Promise<{ ok: boolean; balance?: number; available?: number; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "0보다 큰 금액을 입력하세요." };
  }
  if (amount > 1_000_000) {
    return { ok: false, error: "한 번에 100만 USDT 이하만 가능합니다." };
  }

  const r = await depositFunds({ userId: user.id, amount });
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath("/app/virtual-trade");
  revalidatePath("/app/journal");
  return { ok: true, balance: r.wallet?.usdtBalance, available: r.wallet?.available };
}

export async function resetWalletAction(
  startingBalance: number = 10000,
): Promise<{ ok: boolean; balance?: number; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  if (!Number.isFinite(startingBalance) || startingBalance <= 0) {
    return { ok: false, error: "리셋 금액이 유효하지 않습니다." };
  }

  const r = await resetWallet({ userId: user.id, startingBalance });
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath("/app/virtual-trade");
  revalidatePath("/app/journal");
  revalidatePath("/app/dashboard");
  return { ok: true, balance: r.wallet?.usdtBalance };
}
