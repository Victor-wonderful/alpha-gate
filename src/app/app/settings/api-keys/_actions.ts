"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { encryptSecret, maskApiKey } from "@/lib/crypto";
import { verifyCredentials } from "@/lib/exchanges/binance";

export interface RegisterKeyInput {
  exchange: "binance" | "upbit";
  nickname: string;
  apiKey: string;
  apiSecret: string;
}

export interface RegisterKeyResult {
  ok: boolean;
  error?: string;
  permissions?: {
    canTrade: boolean;
    canWithdraw: boolean;
  };
  balance?: number;
}

/** Verify a Binance key (without saving) — used by the UI for live validation. */
export async function verifyBinanceKeyAction(
  apiKey: string,
  apiSecret: string,
): Promise<RegisterKeyResult> {
  if (!apiKey?.trim() || !apiSecret?.trim()) {
    return { ok: false, error: "API 키와 시크릿 모두 입력하세요." };
  }
  const r = await verifyCredentials({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim() });
  if (!r.valid) {
    return { ok: false, error: r.error ?? "검증 실패" };
  }
  return {
    ok: true,
    permissions: { canTrade: r.permissions.canTrade, canWithdraw: r.permissions.canWithdraw },
    balance: r.balance,
  };
}

/** Verify + encrypt + save a new exchange API key. */
export async function registerKeyAction(input: RegisterKeyInput): Promise<RegisterKeyResult> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const apiKey = input.apiKey.trim();
  const apiSecret = input.apiSecret.trim();
  const nickname = input.nickname.trim() || `${input.exchange}-${Date.now()}`;

  if (!apiKey || !apiSecret) {
    return { ok: false, error: "API 키와 시크릿 모두 입력하세요." };
  }

  if (input.exchange === "upbit") {
    // Upbit adapter not yet wired (Phase 2 — Binance first).
    return {
      ok: false,
      error: "Upbit 연동은 다음 단계에서 추가됩니다. 현재는 Binance만 지원합니다.",
    };
  }

  // Verify before saving.
  const v = await verifyCredentials({ apiKey, apiSecret });
  if (!v.valid) {
    return { ok: false, error: v.error ?? "키 검증 실패" };
  }
  if (!v.permissions.canTrade) {
    return {
      ok: false,
      error: "이 키는 거래 권한이 없습니다. Binance에서 'Enable Trading'을 체크하고 재발급하세요.",
    };
  }
  if (v.permissions.canWithdraw) {
    return {
      ok: false,
      error:
        "이 키에 출금 권한이 활성화되어 있습니다. 보안상 절대 등록할 수 없습니다. Binance에서 'Enable Withdrawals'를 끄고 키를 재발급하세요.",
    };
  }

  const apiKeyEncrypted = encryptSecret(apiKey);
  const apiSecretEncrypted = encryptSecret(apiSecret);
  const masked = maskApiKey(apiKey);

  const { error: dbError } = await supabase.from("exchange_api_keys").insert({
    user_id: user.id,
    exchange: input.exchange,
    nickname,
    api_key_encrypted: apiKeyEncrypted,
    api_secret_encrypted: apiSecretEncrypted,
    api_key_masked: masked,
    permissions: {
      canTrade: v.permissions.canTrade,
      canWithdraw: v.permissions.canWithdraw,
      canDeposit: v.permissions.canDeposit,
    },
    last_verified_at: new Date().toISOString(),
    verification_status: "valid",
  });

  if (dbError) {
    if (dbError.code === "23505") {
      return { ok: false, error: "같은 별칭의 키가 이미 등록되어 있습니다." };
    }
    return { ok: false, error: `DB 저장 실패: ${dbError.message}` };
  }

  revalidatePath("/app/settings/api-keys");
  return {
    ok: true,
    permissions: { canTrade: v.permissions.canTrade, canWithdraw: v.permissions.canWithdraw },
    balance: v.balance,
  };
}

/** Re-verify a saved key (without exposing the plaintext). */
export async function reverifyKeyAction(keyId: string): Promise<RegisterKeyResult> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: row, error } = await supabase
    .from("exchange_api_keys")
    .select("id, exchange, api_key_encrypted, api_secret_encrypted")
    .eq("id", keyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !row) return { ok: false, error: "키를 찾을 수 없습니다." };
  if (row.exchange !== "binance") {
    return { ok: false, error: "Binance 키만 재검증 지원" };
  }

  const { decryptSecret } = await import("@/lib/crypto");
  const apiKey = decryptSecret(row.api_key_encrypted);
  const apiSecret = decryptSecret(row.api_secret_encrypted);

  const v = await verifyCredentials({ apiKey, apiSecret });
  const update: Record<string, string | null | object> = {
    last_verified_at: new Date().toISOString(),
    verification_status: v.valid ? "valid" : "invalid",
    verification_error: v.error ?? null,
  };
  if (v.valid) {
    update.permissions = {
      canTrade: v.permissions.canTrade,
      canWithdraw: v.permissions.canWithdraw,
      canDeposit: v.permissions.canDeposit,
    };
  }
  await supabase.from("exchange_api_keys").update(update).eq("id", keyId);
  revalidatePath("/app/settings/api-keys");
  return {
    ok: v.valid,
    error: v.error,
    permissions: v.valid
      ? { canTrade: v.permissions.canTrade, canWithdraw: v.permissions.canWithdraw }
      : undefined,
    balance: v.valid ? v.balance : undefined,
  };
}

/** Permanently delete a saved key. */
export async function deleteKeyAction(keyId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("exchange_api_keys")
    .delete()
    .eq("id", keyId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/settings/api-keys");
  return { ok: true };
}
