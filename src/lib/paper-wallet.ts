import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";

/**
 * Paper-trading wallet helpers (vUSDT — unified virtual currency).
 *
 * Wallet model:
 *   usdt_balance  — total vUSDT credit (realized PnL, game payouts all here)
 *   used_margin   — margin currently locked by open positions
 *   available     — usdt_balance - used_margin (computed)
 *   ai_credits    — AI 분석 크레딧 (5개 기본, 별도 차감)
 *
 * SSOT: paper_wallets 테이블. game_wallets.points는 통계 외 사용 안 함.
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
  aiCredits: number;
  updatedAt: string;
}

// ── 내부 유틸 ──────────────────────────────────────────────────────────────

/** wallet_transactions에 best-effort 로그를 남긴다. 실패해도 예외 전파 안 함. */
async function logTx(args: {
  userId: string;
  kind: string;
  amount: number;
  balanceAfter: number;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const svc = getSupabaseService();
    await svc.from("wallet_transactions").insert({
      user_id: args.userId,
      kind: args.kind,
      amount: args.amount,
      balance_after: args.balanceAfter,
      meta: args.meta ?? null,
    });
  } catch {
    // best-effort — 로그 실패가 게임/거래를 중단하지 않음
  }
}

// ── 지갑 조회 / 생성 ──────────────────────────────────────────────────────

export async function getOrCreateWallet(userId: string): Promise<PaperWalletState> {
  const svc = getSupabaseService();
  const { data } = await svc
    .from("paper_wallets")
    .select("user_id, usdt_balance, used_margin, starting_balance, deposits_count, ai_credits, updated_at")
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
      aiCredits: Number((data as Record<string, unknown>).ai_credits ?? 5),
      updatedAt: data.updated_at as string,
    };
  }
  // First-time fallback (the trigger should have created one already)
  const { data: inserted, error } = await svc
    .from("paper_wallets")
    .insert({ user_id: userId })
    .select("user_id, usdt_balance, used_margin, starting_balance, deposits_count, ai_credits, updated_at")
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
    aiCredits: Number((inserted as Record<string, unknown>).ai_credits ?? 5),
    updatedAt: inserted.updated_at as string,
  };
}

// ── vUSDT 잔액 조회 ────────────────────────────────────────────────────────

/** vUSDT 잔액 조회 (used_margin 제외한 실제 가용 잔액이 아닌 총 잔액 반환). */
export async function getBalance(userId: string): Promise<number> {
  const wallet = await getOrCreateWallet(userId);
  return wallet.usdtBalance;
}

// ── vUSDT 차감 / 입금 ─────────────────────────────────────────────────────

/** vUSDT 차감 (amount: 양수 입력, 내부에서 음수로 기록).
 *  잔액 부족 시 throw. */
export async function debitBalance(
  userId: string,
  amount: number, // 양수 입력
  kind: "game_bet" | "ai_credit_purchase" | "trade_lock" | "admin_adjust",
  meta?: Record<string, unknown>,
): Promise<number> {
  if (amount <= 0) throw new Error("차감액은 0보다 커야 합니다.");
  const wallet = await getOrCreateWallet(userId);
  if (amount > wallet.available) {
    throw new Error(
      `vUSDT 잔액 부족 — 필요 ${amount.toFixed(2)}, 사용 가능 ${wallet.available.toFixed(2)}`,
    );
  }
  const newBalance = wallet.usdtBalance - amount;
  const svc = getSupabaseService();
  const { data: updated, error } = await svc
    .from("paper_wallets")
    .update({ usdt_balance: newBalance, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("usdt_balance")
    .single();
  if (error || !updated) throw new Error(`차감 실패: ${error?.message ?? "unknown"}`);

  const balanceAfter = Number(updated.usdt_balance);
  await logTx({ userId, kind, amount: -amount, balanceAfter, meta });
  return balanceAfter;
}

/** vUSDT 입금 (amount: 양수 입력). */
export async function creditBalance(
  userId: string,
  amount: number,
  kind:
    | "signup_bonus"
    | "deposit"
    | "game_payout"
    | "tournament_reward"
    | "trade_settle"
    | "admin_adjust",
  meta?: Record<string, unknown>,
): Promise<number> {
  if (amount <= 0) throw new Error("입금액은 0보다 커야 합니다.");
  const wallet = await getOrCreateWallet(userId);
  const newBalance = wallet.usdtBalance + amount;
  const svc = getSupabaseService();
  const { data: updated, error } = await svc
    .from("paper_wallets")
    .update({ usdt_balance: newBalance, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("usdt_balance")
    .single();
  if (error || !updated) throw new Error(`입금 실패: ${error?.message ?? "unknown"}`);

  const balanceAfter = Number(updated.usdt_balance);
  await logTx({ userId, kind, amount, balanceAfter, meta });
  return balanceAfter;
}

// ── AI 크레딧 ──────────────────────────────────────────────────────────────

/** AI 크레딧 잔량 조회. */
export async function getAiCredits(userId: string): Promise<number> {
  const wallet = await getOrCreateWallet(userId);
  return wallet.aiCredits;
}

/** AI 크레딧 차감 (기본 1). 잔량 부족 시 throw. */
export async function spendAiCredit(userId: string, count = 1): Promise<number> {
  if (count <= 0) throw new Error("차감 크레딧은 0보다 커야 합니다.");
  const svc = getSupabaseService();
  const wallet = await getOrCreateWallet(userId);
  if (wallet.aiCredits < count) {
    throw new Error(`AI 크레딧이 없습니다. 현재 잔량: ${wallet.aiCredits}`);
  }
  const newCredits = wallet.aiCredits - count;
  const { error } = await svc
    .from("paper_wallets")
    .update({ ai_credits: newCredits, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw new Error(`AI 크레딧 차감 실패: ${error.message}`);
  return newCredits;
}

/** AI 크레딧 추가. */
export async function addAiCredits(userId: string, count: number): Promise<number> {
  if (count <= 0) throw new Error("추가 크레딧은 0보다 커야 합니다.");
  const svc = getSupabaseService();
  const wallet = await getOrCreateWallet(userId);
  const newCredits = wallet.aiCredits + count;
  const { error } = await svc
    .from("paper_wallets")
    .update({ ai_credits: newCredits, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw new Error(`AI 크레딧 추가 실패: ${error.message}`);
  return newCredits;
}

// ── 마진 잠금 / 정산 (기존 로직 유지 + wallet_transactions 로그 추가) ───────

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
    .select("user_id, usdt_balance, used_margin, starting_balance, deposits_count, ai_credits, updated_at")
    .single();
  if (error || !updated) return { ok: false, error: `lock 실패: ${error?.message ?? "unknown"}` };

  // 기존 paper_wallet_logs 유지
  await svc.from("paper_wallet_logs").insert({
    user_id: args.userId,
    action: "lock",
    amount: args.margin,
    balance_after: Number(updated.usdt_balance),
    used_margin_after: Number(updated.used_margin),
    trade_id: args.tradeId,
    note: args.note ?? "포지션 진입 증거금 lock",
  });
  // wallet_transactions 원장 추가 (trade_lock — 잔액 변동 없음, 마진만 잠금)
  await logTx({
    userId: args.userId,
    kind: "trade_lock",
    amount: -args.margin, // 가용 잔액 감소 의미
    balanceAfter: Number(updated.usdt_balance),
    meta: { trade_id: args.tradeId, used_margin: newUsed },
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
      aiCredits: Number((updated as Record<string, unknown>).ai_credits ?? 5),
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
    .select("user_id, usdt_balance, used_margin, starting_balance, deposits_count, ai_credits, updated_at")
    .single();
  if (error || !updated) return { ok: false, error: `settle 실패: ${error?.message ?? "unknown"}` };

  // 기존 paper_wallet_logs 유지
  await svc.from("paper_wallet_logs").insert({
    user_id: args.userId,
    action: "settle",
    amount: args.realizedPnl,
    balance_after: Number(updated.usdt_balance),
    used_margin_after: Number(updated.used_margin),
    trade_id: args.tradeId,
    note: args.note ?? `포지션 청산: PnL ${args.realizedPnl >= 0 ? "+" : ""}${args.realizedPnl.toFixed(2)} vUSDT`,
  });
  // wallet_transactions 원장 추가
  await logTx({
    userId: args.userId,
    kind: "trade_settle",
    amount: args.realizedPnl,
    balanceAfter: Number(updated.usdt_balance),
    meta: { trade_id: args.tradeId, margin_released: args.margin },
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
      aiCredits: Number((updated as Record<string, unknown>).ai_credits ?? 5),
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
    .select("user_id, usdt_balance, used_margin, starting_balance, deposits_count, ai_credits, updated_at")
    .single();
  if (error || !updated) return { ok: false, error: `입금 실패: ${error?.message ?? "unknown"}` };

  // 기존 paper_wallet_logs 유지
  await svc.from("paper_wallet_logs").insert({
    user_id: args.userId,
    action: "deposit",
    amount: args.amount,
    balance_after: Number(updated.usdt_balance),
    used_margin_after: Number(updated.used_margin),
    note: args.note ?? `가상 자금 추가 +$${args.amount.toFixed(2)}`,
  });
  // wallet_transactions 원장 추가
  await logTx({
    userId: args.userId,
    kind: "deposit",
    amount: args.amount,
    balanceAfter: Number(updated.usdt_balance),
    meta: { note: args.note },
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
      aiCredits: Number((updated as Record<string, unknown>).ai_credits ?? 5),
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
    .select("user_id, usdt_balance, used_margin, starting_balance, deposits_count, ai_credits, updated_at")
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
      aiCredits: Number((updated as Record<string, unknown>).ai_credits ?? 5),
      updatedAt: updated.updated_at as string,
    },
  };
}
