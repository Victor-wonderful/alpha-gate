import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";

/**
 * Paper-trading wallet helpers (Binance Futures USDT-M simulation).
 *
 * Wallet model:
 *   usdt_balance  — total USDT credit (realized PnL is added/subtracted here)
 *   used_margin   — margin currently locked by open positions
 *   available     — usdt_balance - used_margin (computed)
 *
 * Important: this uses the service-role client, so callers MUST scope by
 * user_id explicitly. Every helper takes userId as the first argument.
 */

export interface PaperWalletState {
  userId: string;
  usdtBalance: number;
  usedMargin: number;
  available: number;
  startingBalance: number;
  depositsCount: number;
  updatedAt: string;
}

export async function getOrCreateWallet(userId: string): Promise<PaperWalletState> {
  const svc = getSupabaseService();
  const { data } = await svc
    .from("paper_wallets")
    .select("user_id, usdt_balance, used_margin, starting_balance, deposits_count, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (data) {
    return {
      userId: data.user_id as string,
      usdtBalance: Number(data.usdt_balance),
      usedMargin: Number(data.used_margin),
      available: Number(data.usdt_balance) - Number(data.used_margin),
      startingBalance: Number(data.starting_balance),
      depositsCount: Number(data.deposits_count),
      updatedAt: data.updated_at as string,
    };
  }
  // First-time fallback (the trigger should have created one already)
  const { data: inserted, error } = await svc
    .from("paper_wallets")
    .insert({ user_id: userId })
    .select("user_id, usdt_balance, used_margin, starting_balance, deposits_count, updated_at")
    .single();
  if (error || !inserted) {
    throw new Error(`paper wallet 생성 실패: ${error?.message ?? "unknown"}`);
  }
  return {
    userId: inserted.user_id as string,
    usdtBalance: Number(inserted.usdt_balance),
    usedMargin: Number(inserted.used_margin),
    available: Number(inserted.usdt_balance) - Number(inserted.used_margin),
    startingBalance: Number(inserted.starting_balance),
    depositsCount: Number(inserted.deposits_count),
    updatedAt: inserted.updated_at as string,
  };
}

/** Required margin for a position = notional / leverage. */
export function requiredMargin(entry: number, qty: number, leverage: number): number {
  if (leverage <= 0) return entry * qty;
  return (entry * qty) / leverage;
}

/** Pre-flight check — does the wallet have enough available margin?
 *  No state change. Returns ok=false with a user-readable reason when short. */
export async function canAffordMargin(
  userId: string,
  margin: number,
): Promise<{ ok: boolean; available: number; balance: number; reason?: string }> {
  if (margin <= 0) return { ok: false, available: 0, balance: 0, reason: "증거금이 0 이하입니다." };
  const w = await getOrCreateWallet(userId);
  if (margin > w.available) {
    return {
      ok: false,
      available: w.available,
      balance: w.usdtBalance,
      reason: `가상 잔액 부족 — 필요 증거금 $${margin.toFixed(2)}, 사용 가능 $${w.available.toFixed(2)}. '가상 트레이딩' 메뉴에서 자금 추가하세요.`,
    };
  }
  return { ok: true, available: w.available, balance: w.usdtBalance };
}

/** Lock margin for a new paper position. Returns the updated wallet or an error. */
export async function lockMargin(args: {
  userId: string;
  margin: number;
  tradeId: string;
  note?: string;
}): Promise<{ ok: boolean; wallet?: PaperWalletState; error?: string }> {
  if (args.margin <= 0) return { ok: false, error: "증거금이 0 이하입니다." };
  const wallet = await getOrCreateWallet(args.userId);
  if (args.margin > wallet.available) {
    return {
      ok: false,
      error: `가상 잔액 부족 — 필요 증거금 $${args.margin.toFixed(2)}, 사용 가능 $${wallet.available.toFixed(2)}. '가상 트레이딩' 메뉴에서 자금 추가하세요.`,
    };
  }
  const svc = getSupabaseService();
  const newUsed = wallet.usedMargin + args.margin;
  const { data: updated, error } = await svc
    .from("paper_wallets")
    .update({ used_margin: newUsed, updated_at: new Date().toISOString() })
    .eq("user_id", args.userId)
    .select("user_id, usdt_balance, used_margin, starting_balance, deposits_count, updated_at")
    .single();
  if (error || !updated) return { ok: false, error: `lock 실패: ${error?.message ?? "unknown"}` };

  await svc.from("paper_wallet_logs").insert({
    user_id: args.userId,
    action: "lock",
    amount: args.margin,
    balance_after: Number(updated.usdt_balance),
    used_margin_after: Number(updated.used_margin),
    trade_id: args.tradeId,
    note: args.note ?? "포지션 진입 증거금 lock",
  });

  return {
    ok: true,
    wallet: {
      userId: updated.user_id as string,
      usdtBalance: Number(updated.usdt_balance),
      usedMargin: Number(updated.used_margin),
      available: Number(updated.usdt_balance) - Number(updated.used_margin),
      startingBalance: Number(updated.starting_balance),
      depositsCount: Number(updated.deposits_count),
      updatedAt: updated.updated_at as string,
    },
  };
}

/** Settle a closed paper position:
 *  - Release the locked margin
 *  - Apply realized PnL to usdt_balance */
export async function settleMargin(args: {
  userId: string;
  margin: number;
  realizedPnl: number;
  tradeId: string;
  note?: string;
}): Promise<{ ok: boolean; wallet?: PaperWalletState; error?: string }> {
  const wallet = await getOrCreateWallet(args.userId);
  const newUsed = Math.max(0, wallet.usedMargin - args.margin);
  const newBalance = wallet.usdtBalance + args.realizedPnl;

  const svc = getSupabaseService();
  const { data: updated, error } = await svc
    .from("paper_wallets")
    .update({
      usdt_balance: newBalance,
      used_margin: newUsed,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", args.userId)
    .select("user_id, usdt_balance, used_margin, starting_balance, deposits_count, updated_at")
    .single();
  if (error || !updated) return { ok: false, error: `settle 실패: ${error?.message ?? "unknown"}` };

  await svc.from("paper_wallet_logs").insert({
    user_id: args.userId,
    action: "settle",
    amount: args.realizedPnl,
    balance_after: Number(updated.usdt_balance),
    used_margin_after: Number(updated.used_margin),
    trade_id: args.tradeId,
    note: args.note ?? `포지션 청산: PnL ${args.realizedPnl >= 0 ? "+" : ""}${args.realizedPnl.toFixed(2)} USDT`,
  });

  return {
    ok: true,
    wallet: {
      userId: updated.user_id as string,
      usdtBalance: Number(updated.usdt_balance),
      usedMargin: Number(updated.used_margin),
      available: Number(updated.usdt_balance) - Number(updated.used_margin),
      startingBalance: Number(updated.starting_balance),
      depositsCount: Number(updated.deposits_count),
      updatedAt: updated.updated_at as string,
    },
  };
}

/** Add funds (deposit) to the wallet. Used for initial seed top-ups. */
export async function depositFunds(args: {
  userId: string;
  amount: number;
  note?: string;
}): Promise<{ ok: boolean; wallet?: PaperWalletState; error?: string }> {
  if (args.amount <= 0) return { ok: false, error: "입금액은 0보다 커야 합니다." };
  const wallet = await getOrCreateWallet(args.userId);
  const svc = getSupabaseService();
  const { data: updated, error } = await svc
    .from("paper_wallets")
    .update({
      usdt_balance: wallet.usdtBalance + args.amount,
      deposits_count: wallet.depositsCount + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", args.userId)
    .select("user_id, usdt_balance, used_margin, starting_balance, deposits_count, updated_at")
    .single();
  if (error || !updated) return { ok: false, error: `입금 실패: ${error?.message ?? "unknown"}` };

  await svc.from("paper_wallet_logs").insert({
    user_id: args.userId,
    action: "deposit",
    amount: args.amount,
    balance_after: Number(updated.usdt_balance),
    used_margin_after: Number(updated.used_margin),
    note: args.note ?? `가상 자금 추가 +$${args.amount.toFixed(2)}`,
  });

  return {
    ok: true,
    wallet: {
      userId: updated.user_id as string,
      usdtBalance: Number(updated.usdt_balance),
      usedMargin: Number(updated.used_margin),
      available: Number(updated.usdt_balance) - Number(updated.used_margin),
      startingBalance: Number(updated.starting_balance),
      depositsCount: Number(updated.deposits_count),
      updatedAt: updated.updated_at as string,
    },
  };
}

/** Reset the wallet to the original starting balance. Closes nothing — open
 *  positions remain (so manual reset while having open positions is allowed
 *  but the user is warned in the UI). */
export async function resetWallet(args: {
  userId: string;
  startingBalance?: number;
}): Promise<{ ok: boolean; wallet?: PaperWalletState; error?: string }> {
  const seed = args.startingBalance ?? 10000;
  const svc = getSupabaseService();
  const { data: updated, error } = await svc
    .from("paper_wallets")
    .update({
      usdt_balance: seed,
      used_margin: 0,
      starting_balance: seed,
      deposits_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", args.userId)
    .select("user_id, usdt_balance, used_margin, starting_balance, deposits_count, updated_at")
    .single();
  if (error || !updated) return { ok: false, error: `리셋 실패: ${error?.message ?? "unknown"}` };

  await svc.from("paper_wallet_logs").insert({
    user_id: args.userId,
    action: "reset",
    amount: seed,
    balance_after: Number(updated.usdt_balance),
    used_margin_after: Number(updated.used_margin),
    note: `가상 잔액 리셋 → $${seed.toFixed(0)}`,
  });

  return {
    ok: true,
    wallet: {
      userId: updated.user_id as string,
      usdtBalance: Number(updated.usdt_balance),
      usedMargin: Number(updated.used_margin),
      available: Number(updated.usdt_balance) - Number(updated.used_margin),
      startingBalance: Number(updated.starting_balance),
      depositsCount: Number(updated.deposits_count),
      updatedAt: updated.updated_at as string,
    },
  };
}
