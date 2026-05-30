import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUserDetail } from "@/lib/admin/data";
import { UserActions } from "@/components/admin/user-actions";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

function dt(s: string | null) {
  return s ? new Date(s).toLocaleString("ko-KR") : "—";
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const u = await getUserDetail(id);
  if (!u) notFound();

  return (
    <div className="space-y-5">
      <Link
        href="/app/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        회원 목록
      </Link>

      {/* Header */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-bold">{u.displayName ?? u.email}</h2>
              {u.disabled ? (
                <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">비활성</span>
              ) : (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">활성</span>
              )}
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground">{u.email}</div>
            <div className="mt-0.5 font-mono text-xs text-muted-foreground">
              가입 {dt(u.createdAt)} · {u.id}
            </div>
          </div>
          <div className="flex gap-5 text-right">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">분석</div>
              <div className="font-mono text-lg font-bold tabular-nums">{u.analysesCount}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">거래</div>
              <div className="font-mono text-lg font-bold tabular-nums">{u.tradesCount}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Wallet + actions */}
        <Card>
          <CardHeader>
            <CardTitle>지갑 · 관리 액션</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">vUSDT</div>
                <div className="mt-1 font-mono text-base font-bold tabular-nums">
                  {formatNumber(u.usdtBalance, { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">AI 크레딧</div>
                <div className="mt-1 font-mono text-base font-bold tabular-nums">{u.aiCredits}</div>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">사용 마진</div>
                <div className="mt-1 font-mono text-base font-bold tabular-nums">
                  {formatNumber(u.usedMargin, { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>
            <UserActions userId={u.id} disabled={u.disabled} />
          </CardContent>
        </Card>

        {/* Admin audit log for this user */}
        <Card>
          <CardHeader>
            <CardTitle>관리자 액션 기록</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[320px] divide-y divide-border overflow-y-auto">
              {u.adminLog.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-muted-foreground">기록 없음</div>
              ) : (
                u.adminLog.map((l) => (
                  <div key={l.id} className="px-5 py-2.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{l.action}</span>
                      <span className="font-mono text-xs text-muted-foreground">{dt(l.created_at)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {l.admin_email} · {JSON.stringify(l.detail)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Recent trades */}
        <Card>
          <CardHeader>
            <CardTitle>최근 거래</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {u.recentTrades.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-muted-foreground">거래 없음</div>
              ) : (
                u.recentTrades.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.symbol}</span>
                      <span className="text-xs text-muted-foreground">{t.direction}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold">{t.pre_grade}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {t.result_r != null ? (
                        <span
                          className={`font-mono text-xs tabular-nums ${t.result_r >= 0 ? "text-primary" : "text-destructive"}`}
                        >
                          {t.result_r >= 0 ? "+" : ""}
                          {t.result_r.toFixed(2)}R
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">진행중</span>
                      )}
                      <span className="font-mono text-[11px] text-muted-foreground">{dt(t.created_at)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent wallet tx */}
        <Card>
          <CardHeader>
            <CardTitle>최근 지갑 내역</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {u.recentTx.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-muted-foreground">내역 없음</div>
              ) : (
                u.recentTx.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <span className="text-xs text-muted-foreground">{tx.kind}</span>
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-mono text-xs tabular-nums ${tx.amount >= 0 ? "text-primary" : "text-destructive"}`}
                      >
                        {tx.amount >= 0 ? "+" : ""}
                        {formatNumber(tx.amount, { maximumFractionDigits: 2 })}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">{dt(tx.created_at)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
