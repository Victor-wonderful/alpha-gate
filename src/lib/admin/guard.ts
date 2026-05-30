import "server-only";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";

export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

/**
 * Server-side admin gate. Redirects non-admins to /app.
 * Returns the authenticated admin's id + email.
 */
export async function requireAdmin(): Promise<{ id: string; email: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/admin");
  if (!isAdminEmail(user.email)) redirect("/app");
  return { id: user.id, email: user.email! };
}
