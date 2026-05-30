import Link from "next/link";
import { Sparkles, LineChart, Coins, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getSupabaseService } from "@/lib/supabase/service";
import { listAllUsers } from "@/lib/admin/data";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Event = {
  id: string;
  kind: "analysis" | "trade" | "wallet" | "admin";
  at: string;
  userId: string | null;
  label: string;
  detail: string;
};

export default async function AdminActivityPage() {
  const svc = getSupabaseService();
  const [users, analysesRes, tradesRes, txRes, logRes] = await Promise.all([
    listAllUsers(),
    svc.from("analyses").select("id, user_id, symbol, created_at").order("created_at", { ascending: false }).limit(30),
    svc
      .from("trades")
      .select("id, user_id, symbol, direction, pre_grade, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    svc
      .from("wallet_transactions")
      .select("id, user_id, kind, amount, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    svc
      .from("admin_audit_logs")
      .select("id, admin_email, action, target_user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const emailOf = new Map(users.map((u) => [u.id, u.displayName ?? u.email]));

  const events: Event[] = [];
  for (const a of (analysesRes.data ?? []) as { id: string; user_id: string; symbol: string; created_at: string }[]) {
    events.push({
      id: `a-${a.id}`,
      kind: "analysis",
      at: a.created_at,
      userId: a.user_id,
      label: emailOf.get(a.user_id) ?? a.user_id,
      detail: `${a.symbol} 분석`,
    });
  }
  for (const t of (tradesRes.data ?? []) as { id: string; user_id: string; symbol: string; direction: string; pre_grade: string; created_at: string }[]) {
    events.push({
      id: `t-${t.id}`,
      kind: "trade",
      at: t.created_at,
      userId: t.user_id,
      label: emailOf.get(t.user_id) ?? t.user_id,
      detail: `${t.symbol} ${t.direction} 거래 (${t.pre_grade})`,
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
      detail: `관리자: ${l.action}${l.target_user_id ? ` → ${emailOf.get(l.target_user_id) ?? l.target_user_id}` : ""}`,
    });
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const top = events.slice(0, 60);

  const META: Record<Event["kind"], { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
    analysis: { icon: Sparkles, tone: "text-primary" },
    trade: { icon: LineChart, tone: "text-foreground" },
    wallet: { icon: Coins, tone: "text-amber-400" },
    admin: { icon: Shield, tone: "text-destructive" },
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">통합 활동 타임라인</div>
        <div className="divide-y divide-border">
          {top.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">활동이 없습니다.</div>
          ) : (
            top.map((e) => {
              const M = META[e.kind];
              const Icon = M.icon;
              const inner = (
                <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
                  <Icon className={`h-4 w-4 shrink-0 ${M.tone}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{e.detail}</div>
                    <div className="truncate text-xs text-muted-foreground">{e.label}</div>
                  </div>
                  <div className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {new Date(e.at).toLocaleString("ko-KR")}
                  </div>
                </div>
              );
              return e.userId ? (
                <Link key={e.id} href={`/app/admin/users/${e.userId}`} className="block">
                  {inner}
                </Link>
              ) : (
                <div key={e.id}>{inner}</div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
