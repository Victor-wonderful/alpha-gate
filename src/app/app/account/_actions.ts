"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";

interface ProfilePayload {
  display_name: string | null;
  default_style: "scalp" | "day" | "swing" | "position";
  default_risk_pct: number;
  default_leverage: number;
}

export async function updateProfileAction(
  p: ProfilePayload,
): Promise<{ error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  // Validate
  if (!["scalp", "day", "swing", "position"].includes(p.default_style))
    return { error: "유효하지 않은 트레이딩 스타일입니다." };
  if (!Number.isFinite(p.default_risk_pct) || p.default_risk_pct <= 0 || p.default_risk_pct > 10)
    return { error: "리스크 %는 0보다 크고 10 이하여야 합니다." };
  if (!Number.isFinite(p.default_leverage) || p.default_leverage < 1 || p.default_leverage > 125)
    return { error: "레버리지는 1~125 사이여야 합니다." };

  const display_name = p.display_name?.trim() || null;
  if (display_name && display_name.length > 30)
    return { error: "표시 이름은 30자 이하여야 합니다." };

  const { error } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      display_name,
      default_style: p.default_style,
      default_risk_pct: p.default_risk_pct,
      default_leverage: p.default_leverage,
    });
  if (error) return { error: error.message };

  revalidatePath("/app/account");
  revalidatePath("/app");
  return {};
}

interface CapitalPayload {
  account_mode: "real" | "virtual";
  virtual_capital: number; // default_account_size 로 저장
  real_alloc_type: "amount" | "pct";
  real_alloc_amount: number | null;
  real_alloc_pct: number | null;
}

/** "내 자금" 설정 저장 — 활성 모드 + 가상 자금 + 실거래 배정(금액/비율). */
export async function updateCapitalAction(
  p: CapitalPayload,
): Promise<{ error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  if (!["real", "virtual"].includes(p.account_mode))
    return { error: "유효하지 않은 계좌 모드입니다." };
  if (!["amount", "pct"].includes(p.real_alloc_type))
    return { error: "유효하지 않은 배정 방식입니다." };
  if (!Number.isFinite(p.virtual_capital) || p.virtual_capital <= 0)
    return { error: "가상 자금은 0보다 커야 합니다." };
  if (p.real_alloc_amount != null && (!Number.isFinite(p.real_alloc_amount) || p.real_alloc_amount < 0))
    return { error: "실거래 배정 금액이 올바르지 않습니다." };
  if (p.real_alloc_pct != null && (!Number.isFinite(p.real_alloc_pct) || p.real_alloc_pct < 0 || p.real_alloc_pct > 100))
    return { error: "실거래 배정 비율은 0~100 사이여야 합니다." };

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    account_mode: p.account_mode,
    default_account_size: p.virtual_capital,
    real_alloc_type: p.real_alloc_type,
    real_alloc_amount: p.real_alloc_amount,
    real_alloc_pct: p.real_alloc_pct,
  });
  if (error) return { error: error.message };

  revalidatePath("/app/account");
  revalidatePath("/app/analyze");
  revalidatePath("/app/trade");
  revalidatePath("/app");
  return {};
}

/** 실거래 잔액을 거래소에서 조회해 profiles 에 캐시. 저장된 Binance 키 사용. */
export async function refreshRealBalanceAction(): Promise<{ balance?: number; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data: row } = await supabase
    .from("exchange_api_keys")
    .select("api_key_encrypted, api_secret_encrypted, exchange")
    .eq("user_id", user.id)
    .eq("exchange", "binance")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return { error: "연결된 Binance API 키가 없습니다. 먼저 API 키를 등록하세요." };

  const { verifyCredentials } = await import("@/lib/exchanges/binance");
  const { decryptSecret } = await import("@/lib/crypto");
  const apiKey = decryptSecret(row.api_key_encrypted);
  const apiSecret = decryptSecret(row.api_secret_encrypted);

  const v = await verifyCredentials({ apiKey, apiSecret });
  if (!v.valid || v.balance == null) return { error: v.error ?? "잔액 조회 실패" };

  await supabase
    .from("profiles")
    .upsert({ id: user.id, real_balance_cached: v.balance, real_balance_cached_at: new Date().toISOString() });
  revalidatePath("/app/account");
  return { balance: v.balance };
}

export async function changePasswordAction(
  newPassword: string,
): Promise<{ error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  if (newPassword.length < 8)
    return { error: "비밀번호는 8자 이상이어야 합니다." };
  if (newPassword.length > 128)
    return { error: "비밀번호는 128자 이하여야 합니다." };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };

  return {};
}
