import Link from "next/link";
import { Users, UserCheck, UserX, Coins, Sparkles, LineChart, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { listAllUsers } from "@/lib/admin/data";
import { formatNumber } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "primary" | "amber" | "destructive";
}) {
  const toneCls =
    tone === "primary"
      ? "text-primary"
      : tone === "amber"
        ? "text-amber-400"
        : tone === "destructive"
          ? "text-destructive"
          : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="p-4 pt-4">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Icon className={`h-3.5 w-3.5 ${toneCls}`} />
          {label}
        </div>
        <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums">{value}</div>
        {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

export default async function AdminDashboardPage() {
  const t = await getT();
  const users = await listAllUsers();

  const total = users.length;
  const disabled = users.filter((u) => u.disabled).length;
  const active = total - disabled;
  const totalVusdt = users.reduce((s, u) => s + u.usdtBalance, 0);
  const totalCredits = users.reduce((s, u) => s + u.aiCredits, 0);
  const totalAnalyses = users.reduce((s, u) => s + u.analysesCount, 0);
  const totalTrades = users.reduce((s, u) => s + u.tradesCount, 0);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newThisWeek = users.filter((u) => new Date(u.createdAt).getTime() >= weekAgo).length;

  const recent = [...users]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Users} label={t("admin.statTotalUsers")} value={formatNumber(total)} sub={t("admin.statNewSub", { n: newThisWeek })} />
        <StatCard icon={UserCheck} label={t("admin.statActive")} value={formatNumber(active)} tone="primary" />
        <StatCard icon={UserX} label={t("admin.statDisabled")} value={formatNumber(disabled)} tone={disabled ? "destructive" : "default"} />
        <StatCard icon={Clock} label={t("admin.statNew7d")} value={formatNumber(newThisWeek)} />
        <StatCard icon={Coins} label={t("admin.statTotalVusdt")} value={formatNumber(totalVusdt, { maximumFractionDigits: 0 })} tone="primary" />
        <StatCard icon={Sparkles} label={t("admin.statTotalCredits")} value={formatNumber(totalCredits)} tone="amber" />
        <StatCard icon={LineChart} label={t("admin.statTotalAnalyses")} value={formatNumber(totalAnalyses)} />
        <StatCard icon={CheckCircle2} label={t("admin.statTotalTrades")} value={formatNumber(totalTrades)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">{t("admin.recentSignups")}</div>
          <div className="divide-y divide-border">
            {recent.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">{t("admin.noUsers")}</div>
            ) : (
              recent.map((u) => (
                <Link
                  key={u.id}
                  href={`/app/admin/users/${u.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{u.displayName ?? u.email}</div>
                    <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {u.disabled ? (
                      <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">{t("admin.disabled")}</span>
                    ) : null}
                    <span className="font-mono tabular-nums">
                      {new Date(u.createdAt).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
