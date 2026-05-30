import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";

export type AdminAction =
  | "grant_ai_credits"
  | "deposit_vusdt"
  | "reset_vusdt"
  | "toggle_disabled";

export async function logAdminAction(entry: {
  adminId: string;
  adminEmail: string;
  targetUserId?: string | null;
  action: AdminAction;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const svc = getSupabaseService();
  await svc.from("admin_audit_logs").insert({
    admin_id: entry.adminId,
    admin_email: entry.adminEmail,
    target_user_id: entry.targetUserId ?? null,
    action: entry.action,
    detail: entry.detail ?? {},
  });
}
