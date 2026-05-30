"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guard";
import { logAdminAction } from "@/lib/admin/audit";
import { getSupabaseService } from "@/lib/supabase/service";
import { addAiCredits, creditBalance, resetWallet, getOrCreateWallet } from "@/lib/paper-wallet";

type Result = { ok?: true; error?: string };

export async function grantAiCreditsAction(userId: string, count: number): Promise<Result> {
  const admin = await requireAdmin();
  if (!Number.isFinite(count) || count <= 0) return { error: "크레딧 수는 0보다 커야 합니다." };
  try {
    const after = await addAiCredits(userId, Math.floor(count));
    await logAdminAction({
      adminId: admin.id,
      adminEmail: admin.email,
      targetUserId: userId,
      action: "grant_ai_credits",
      detail: { count: Math.floor(count), credits_after: after },
    });
    revalidatePath(`/app/admin/users/${userId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "크레딧 부여 실패" };
  }
}

export async function depositVusdtAction(userId: string, amount: number): Promise<Result> {
  const admin = await requireAdmin();
  if (!Number.isFinite(amount) || amount <= 0) return { error: "입금액은 0보다 커야 합니다." };
  try {
    const after = await creditBalance(userId, amount, "admin_adjust", {
      by: admin.email,
      reason: "admin deposit",
    });
    await logAdminAction({
      adminId: admin.id,
      adminEmail: admin.email,
      targetUserId: userId,
      action: "deposit_vusdt",
      detail: { amount, balance_after: after },
    });
    revalidatePath(`/app/admin/users/${userId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "입금 실패" };
  }
}

export async function resetVusdtAction(userId: string): Promise<Result> {
  const admin = await requireAdmin();
  try {
    const before = await getOrCreateWallet(userId);
    const res = await resetWallet({ userId });
    if (!res.ok) return { error: res.error };
    await logAdminAction({
      adminId: admin.id,
      adminEmail: admin.email,
      targetUserId: userId,
      action: "reset_vusdt",
      detail: { balance_before: before.usdtBalance, balance_after: res.wallet?.usdtBalance ?? null },
    });
    revalidatePath(`/app/admin/users/${userId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "초기화 실패" };
  }
}

export async function toggleDisabledAction(userId: string, disabled: boolean): Promise<Result> {
  const admin = await requireAdmin();
  if (userId === admin.id) return { error: "본인 계정은 비활성화할 수 없습니다." };
  try {
    const svc = getSupabaseService();
    const { error } = await svc.from("profiles").update({ disabled }).eq("id", userId);
    if (error) return { error: error.message };
    await logAdminAction({
      adminId: admin.id,
      adminEmail: admin.email,
      targetUserId: userId,
      action: "toggle_disabled",
      detail: { disabled },
    });
    revalidatePath(`/app/admin/users/${userId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "상태 변경 실패" };
  }
}
