import { CheckCircle2, XCircle, Clock, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseService } from "@/lib/supabase/service";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

function minutesAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

export default async function AdminSystemPage() {
  const svc = getSupabaseService();

  const [kimchiRes, totalAnalysesRes, dayAnalysesRes, totalTradesRes] = await Promise.all([
    svc.from("kimchi_history").select("recorded_at").order("recorded_at", { ascending: false }).limit(1),
    svc.from("analyses").select("id", { count: "exact", head: true }),
    svc
      .from("analyses")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    svc.from("trades").select("id", { count: "exact", head: true }),
  ]);

  const lastKimchi = (kimchiRes.data?.[0]?.recorded_at as string | undefined) ?? null;
  const kimchiAge = minutesAgo(lastKimchi);
  const kimchiHealthy = kimchiAge != null && kimchiAge <= 15;

  const envChecks: { key: string; ok: boolean }[] = [
    { key: "ANTHROPIC_API_KEY", ok: !!process.env.ANTHROPIC_API_KEY },
    { key: "SUPABASE_SERVICE_ROLE_KEY", ok: !!process.env.SUPABASE_SERVICE_ROLE_KEY },
    { key: "ADMIN_EMAILS", ok: !!process.env.ADMIN_EMAILS },
    { key: "CRON_SECRET", ok: !!process.env.CRON_SECRET },
    { key: "TELEGRAM_BOT_TOKEN", ok: !!process.env.TELEGRAM_BOT_TOKEN },
    { key: "ENCRYPTION_KEY", ok: !!process.env.ENCRYPTION_KEY },
  ];

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* Cron status */}
      <Card>
        <CardHeader>
          <CardTitle>Cron 상태</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">record-kimchi (5분 주기)</div>
                <div className="text-xs text-muted-foreground">
                  {lastKimchi ? new Date(lastKimchi).toLocaleString("ko-KR") : "기록 없음"}
                </div>
              </div>
            </div>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                kimchiHealthy
                  ? "bg-primary/10 text-primary"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {kimchiAge == null ? "—" : kimchiHealthy ? `${kimchiAge}분 전` : `지연 ${kimchiAge}분`}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            record-kimchi가 15분 이상 지연되면 Vercel Cron 또는 Upbit/Binance API를 점검하세요.
          </p>
        </CardContent>
      </Card>

      {/* AI usage */}
      <Card>
        <CardHeader>
          <CardTitle>AI · 활동 사용량</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" /> 총 분석
              </div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums">
                {formatNumber(totalAnalysesRes.count ?? 0)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">24h 분석</div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums">
                {formatNumber(dayAnalysesRes.count ?? 0)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">총 거래</div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums">
                {formatNumber(totalTradesRes.count ?? 0)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Env checks */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>환경 변수 점검</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {envChecks.map((c) => (
              <div
                key={c.key}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2"
              >
                <span className="font-mono text-sm">{c.key}</span>
                {c.ok ? (
                  <span className="inline-flex items-center gap-1 text-xs text-primary">
                    <CheckCircle2 className="h-4 w-4" /> 설정됨
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-destructive">
                    <XCircle className="h-4 w-4" /> 없음
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            값은 노출하지 않고 설정 여부만 표시합니다. 서버 런타임 기준.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
