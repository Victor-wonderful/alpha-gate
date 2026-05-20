import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  BookOpen,
  CandlestickChart,
  CheckCircle2,
  LineChart as LineChartIcon,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradeBadge } from "@/components/trade/grade-badge";
import { AnalysisTimingGuide } from "@/components/app/analysis-timing-guide";
import { getSupabaseServer } from "@/lib/supabase/server";
import { cn, formatNumber } from "@/lib/utils";
import { fetchTicker24h } from "@/lib/analysis/binance";
import type { Grade } from "@/types/trade";

export const dynamic = "force-dynamic";

const QUICK_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"];

async function getQuickTickers() {
  return Promise.all(
    QUICK_SYMBOLS.map(async (s) => {
      try {
        const t = await fetchTicker24h(s);
        return { symbol: s, last: t.lastPrice, change: t.priceChangePercent, ok: true as const };
      } catch {
        return { symbol: s, ok: false as const };
      }
    }),
  );
}

export default async function HomePage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const displayName = user?.email?.split("@")[0] ?? "트레이더";

  const [recentTradesRes, tickers, statsRes] = await Promise.all([
    supabase
      .from("trades")
      .select("id, symbol, direction, timeframe, pre_grade, pre_rr, result_r, closed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    getQuickTickers(),
    supabase.from("trades").select("result_r, pre_grade, closed_at, mode").neq("mode", "backtest"),
  ]);

  const recent = recentTradesRes.data ?? [];
  const allTrades = statsRes.data ?? [];
  const closed = allTrades.filter((t) => t.closed_at && t.result_r != null);
  const closedCount = closed.length;
  const wins = closed.filter((t) => Number(t.result_r ?? 0) > 0).length;
  const losses = closed.filter((t) => Number(t.result_r ?? 0) < 0).length;
  const winRate = closedCount > 0 ? Math.round((wins / closedCount) * 100) : 0;
  const totalR = closed.reduce((s, t) => s + Number(t.result_r ?? 0), 0);
  const openCount = allTrades.filter((t) => !t.closed_at).length;
  const totalTrades = closedCount + openCount;

  // 상황별 가이드 결정
  type GuideKind = "open_positions" | "first_time" | "continue";
  let guideKind: GuideKind;
  let guideTitle: string;
  let guideDesc: string;
  let guideCTA: { href: string; label: string };
  if (openCount > 0) {
    guideKind = "open_positions";
    guideTitle = `진행 중 ${openCount}건 — 결과 확인`;
    guideDesc = "이미 진입한 포지션이 있습니다. 청산 후 내 거래에서 결과를 기록해 다음 거래에 반영하세요.";
    guideCTA = { href: "/app/journal", label: "내 거래로" };
  } else if (totalTrades === 0) {
    guideKind = "first_time";
    guideTitle = "첫 시작 — AI 분석부터";
    guideDesc = "Alpha Gate는 4단계 사이클입니다. AI 분석 → 주문 검토 → 내 거래(결과 입력) → 성과 분석. 첫 분석부터 시작하세요.";
    guideCTA = { href: "/app/analyze", label: "AI 분석 시작" };
  } else {
    guideKind = "continue";
    guideTitle = "다음 셋업 찾기";
    guideDesc = "AI 분석으로 시장을 보고 진입할 자리를 찾으세요.";
    guideCTA = { href: "/app/analyze", label: "AI 분석으로" };
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/5 p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-primary">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Alpha Gate · 매매 전 점검
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            안녕하세요, <span className="text-primary">{displayName}</span>님
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            AI 분석 → 주문 검토 → 내 거래 → 성과 분석. 네 단계가 한 사이클입니다.
          </p>
          <div
            className={cn(
              "mt-5 flex flex-wrap items-start gap-3 rounded-lg border p-4",
              guideKind === "open_positions"
                ? "border-grade-b/40 bg-grade-b/10"
                : "border-primary/40 bg-primary/10",
            )}
          >
            <div className="flex-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                오늘 무엇부터?
              </div>
              <div className="mt-0.5 text-sm font-bold text-foreground">{guideTitle}</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{guideDesc}</p>
            </div>
            <Link
              href={guideCTA.href}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {guideCTA.label}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="전체 거래"
          value={String(totalTrades)}
          sub={`종료 ${closedCount} · 진행 ${openCount}`}
          icon={<Activity className="h-3.5 w-3.5" />}
          accentColor="primary"
        />
        <StatCard
          label="승률"
          value={closedCount > 0 ? `${winRate}%` : "—"}
          sub={closedCount > 0 ? `${wins}승 ${losses}패 (종료 ${closedCount}건 기준)` : "종료 거래 없음"}
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          accentColor="grade-a"
          trend={closedCount > 0 ? (winRate >= 50 ? "up" : "down") : undefined}
        />
        <StatCard
          label="누적 R"
          value={closedCount > 0 ? `${totalR >= 0 ? "+" : ""}${totalR.toFixed(2)}R` : "—"}
          sub={closedCount > 0 ? `거래당 평균 ${totalR / closedCount >= 0 ? "+" : ""}${(totalR / closedCount).toFixed(2)}R` : "종료 거래 없음"}
          icon={<LineChartIcon className="h-3.5 w-3.5" />}
          accentColor={totalR >= 0 ? "grade-a" : "grade-d"}
          tone={totalR > 0 ? "good" : totalR < 0 ? "bad" : "neutral"}
        />
        <StatCard
          label="진행 중"
          value={String(openCount)}
          sub={openCount > 0 ? "자동 정산 대기 중" : "열린 거래 없음"}
          icon={<BookOpen className="h-3.5 w-3.5" />}
          accentColor="grade-b"
          badge={openCount > 0 ? "live" : undefined}
        />
      </div>

      {/* 분석 타이밍 가이드 */}
      <AnalysisTimingGuide />

      {/* Quick start + Tickers */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              지금 시작하기
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2.5 sm:grid-cols-3">
            <ActionCard
              href="/app/analyze"
              title="AI 시장 분석"
              desc="멀티 TF · 호가 · 펀딩"
              icon={<Sparkles className="h-4 w-4" />}
              accent="primary"
            />
            <ActionCard
              href="/app/trade"
              title="주문 검토"
              desc="등급 · 손익비 · 사이징"
              icon={<CheckCircle2 className="h-4 w-4" />}
              accent="grade-a"
            />
            <ActionCard
              href="/app/journal"
              title="내 거래 · AI 복기"
              desc="결과 기록 · 패턴 분석"
              icon={<BookOpen className="h-4 w-4" />}
              accent="grade-c"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CandlestickChart className="h-4 w-4 text-primary" />
              주요 종목
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-grade-a" />
                LIVE
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border/60">
              {tickers.map((t) => (
                <li key={t.symbol}>
                  {t.ok ? (
                    <Link
                      href={`/app/analyze?symbol=${t.symbol}`}
                      className="flex items-center justify-between px-5 py-2.5 transition-colors hover:bg-muted/30"
                    >
                      <span className="font-mono text-sm font-medium">{t.symbol}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm">${formatNumber(t.last)}</span>
                        <span
                          className={cn(
                            "inline-flex w-[68px] items-center justify-end gap-0.5 font-mono text-xs font-medium",
                            t.change >= 0 ? "text-grade-a" : "text-grade-d",
                          )}
                        >
                          {t.change >= 0 ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {Math.abs(t.change).toFixed(2)}%
                        </span>
                      </div>
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between px-5 py-2.5 text-muted-foreground">
                      <span className="font-mono text-sm">{t.symbol}</span>
                      <span className="text-xs">조회 실패</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Recent trades */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            최근 거래
          </CardTitle>
          <Link
            href="/app/journal"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            전체 보기
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <div className="px-5 pb-5 text-sm text-muted-foreground">
              아직 저장한 거래가 없습니다.{" "}
              <Link href="/app/trade" className="text-primary underline-offset-2 hover:underline">
                거래 평가
              </Link>
              에서 첫 거래를 기록하세요.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {recent.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/app/journal/${t.id}`}
                    className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-3">
                      <GradeBadge grade={t.pre_grade as Grade} size="sm" />
                      <span className="font-mono text-sm font-medium">{t.symbol}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.direction === "long" ? "롱" : "숏"} · {t.timeframe}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {t.closed_at ? (
                        <span
                          className={cn(
                            "font-mono font-medium",
                            Number(t.result_r) >= 0 ? "text-grade-a" : "text-grade-d",
                          )}
                        >
                          {Number(t.result_r) >= 0 ? "+" : ""}
                          {Number(t.result_r).toFixed(2)}R
                        </span>
                      ) : (
                        <Badge className="border-grade-b/40 bg-grade-b/10 text-grade-b">진행</Badge>
                      )}
                      <span className="text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString("ko-KR", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
  accentColor,
  trend,
  badge,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: "good" | "bad" | "neutral";
  accentColor?: "primary" | "grade-a" | "grade-b" | "grade-c" | "grade-d";
  trend?: "up" | "down";
  badge?: "live";
}) {
  const accent = {
    primary: "from-primary/30 to-transparent",
    "grade-a": "from-grade-a/30 to-transparent",
    "grade-b": "from-grade-b/30 to-transparent",
    "grade-c": "from-grade-c/30 to-transparent",
    "grade-d": "from-grade-d/30 to-transparent",
  };

  return (
    <Card className="overflow-hidden">
      {accentColor ? (
        <span
          aria-hidden
          className={cn("absolute inset-x-0 top-0 h-px bg-gradient-to-r", accent[accentColor])}
        />
      ) : null}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <span className="text-muted-foreground/70">{icon}</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className={cn(
              "font-mono text-2xl font-bold leading-none tracking-tight",
              tone === "good" && "text-grade-a",
              tone === "bad" && "text-grade-d",
            )}
          >
            {value}
          </span>
          {trend === "up" ? <ArrowUpRight className="h-3.5 w-3.5 text-grade-a" /> : null}
          {trend === "down" ? <ArrowDownRight className="h-3.5 w-3.5 text-grade-d" /> : null}
          {badge === "live" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-grade-a/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-grade-a">
              <span className="h-1 w-1 animate-pulse rounded-full bg-grade-a" />
              LIVE
            </span>
          ) : null}
        </div>
        {sub ? <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div> : null}
      </div>
    </Card>
  );
}

function ActionCard({
  href,
  title,
  desc,
  icon,
  accent,
}: {
  href: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  accent: "primary" | "grade-a" | "grade-c";
}) {
  const accentStyles = {
    primary: "bg-primary/10 text-primary border-primary/20 group-hover:border-primary/40",
    "grade-a": "bg-grade-a/10 text-grade-a border-grade-a/20 group-hover:border-grade-a/40",
    "grade-c": "bg-grade-c/10 text-grade-c border-grade-c/20 group-hover:border-grade-c/40",
  };
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-lg border border-border bg-card-2/40 p-4 transition-all hover:-translate-y-px hover:border-border hover:bg-card-2/60"
    >
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md border transition-colors",
          accentStyles[accent],
        )}
      >
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
      </div>
      <ArrowRight className="absolute right-3 top-3 h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}
