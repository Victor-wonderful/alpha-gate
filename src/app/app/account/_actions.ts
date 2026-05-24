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
