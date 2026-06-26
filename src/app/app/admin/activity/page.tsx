import { getSupabaseService } from "@/lib/supabase/service";
import { listAllUsers } from "@/lib/admin/data";
import { formatNumber } from "@/lib/utils";
import { ActivityFeed, type ActivityEvent } from "@/components/admin/activity-feed";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const LIMIT = 100;

export default async function AdminActivityPage() {
  const t = await getT();
  const svc = getSupabaseService();
  const [users, analysesRes, tradesRes, txRes, logRes] = await Promise.all([
    listAllUsers(),
    svc.from("analyses").select("id, user_id, symbol, created_at").order("created_at", { ascending: false }).limit(LIMIT),
    svc
      .from("trades")
      .select("id, user_id, symbol, direction, pre_grade, created_at")
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    svc
      .from("wallet_transactions")
      .select("id, user_id, kind, amount, created_at")
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    svc
      .from("admin_audit_logs")
      .select("id, admin_email, action, target_user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(LIMIT),
  ]);

  const emailOf = new Map(users.map((u) => [u.id, u.displayName ?? u.email]));

  const events: ActivityEvent[] = [];
  for (const a of (analysesRes.data ?? []) as { id: string; user_id: string; symbol: string; created_at: string }[]) {
    events.push({
      id: `a-${a.id}`,
      kind: "analysis",
      at: a.created_at,
      userId: a.user_id,
      label: emailOf.get(a.user_id) ?? a.user_id,
      detail: t("admin.detailAnalysis", { symbol: a.symbol }),
    });
  }
  for (const tr of (tradesRes.data ?? []) as { id: string; user_id: string; symbol: string; direction: string; pre_grade: string; created_at: string }[]) {
    events.push({
      id: `t-${tr.id}`,
      kind: "trade",
      at: tr.created_at,
      userId: tr.user_id,
      label: emailOf.get(tr.user_id) ?? tr.user_id,
      detail: t("admin.detailTrade", { symbol: tr.symbol, direction: tr.direction, grade: tr.pre_grade }),
    });
  }
  for (const x of (txRes.data ?? []) as { id: string; user_id: string; kind: string; amount: number; created_at: string }[]) {
    events.push({
      id: `w-${x.id}`,
      kind: "wallet",
      at: x.created_at,
      userId: x.user_id,
      label: emailOf.get(x.user_id) ?? x.user_id,
      detail: `${x.kind} ${x.amount >= 0 ? "+" : ""}${formatNumber(x.amount, { maximumFractionDigits: 2 })} vUSDT`,
    });
  }
  for (const l of (logRes.data ?? []) as { id: string; admin_email: string; action: string; target_user_id: string | null; created_at: string }[]) {
    events.push({
      id: `l-${l.id}`,
      kind: "admin",
      at: l.created_at,
      userId: l.target_user_id,
      label: l.admin_email,
      detail: `${t("admin.detailAdminPrefix")}: ${l.action}${l.target_user_id ? ` → ${emailOf.get(l.target_user_id) ?? l.target_user_id}` : ""}`,
    });
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return <ActivityFeed events={events.slice(0, 200)} />;
}
