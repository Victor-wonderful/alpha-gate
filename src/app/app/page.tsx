import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  BookOpen,
  Coins,
  Gamepad2,
  HelpCircle,
  LineChart as LineChartIcon,
  Sparkles,
  Wallet,
} from "lucide-react";
import { GradeBadge } from "@/components/trade/grade-badge";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getOrCreateWallet } from "@/lib/paper-wallet";
import { cn, formatNumber } from "@/lib/utils";
import type { Grade } from "@/types/trade";
import { TodayMarketStrip } from "@/components/market/today-strip";
import { ExpiryBanner } from "@/components/trade/expiry-banner";
import { AutoRefreshBar } from "@/components/market/auto-refresh-bar";
import { CapitalFlowCard } from "@/components/market/capital-flow-card";
import { SessionsClock } from "@/components/market/sessions-clock";
import { MacroCalendar } from "@/components/market/macro-calendar";
import { SnapshotToday } from "@/components/market/snapshot-today";
import {
  FearGreedCard,
  DominanceCard,
  AltSeasonCard,
  KimchiCard,
  StablecapCard,
  LongShortCard,
} from "@/components/market/live-market-cards";
import { DefiTvlCard } from "@/components/market/defi-tvl-card";

export const dynamic = "force-dynamic";

function kstMonthStartUtc(): Date {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60_000);
  const monthStartKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1);
  return new Date(monthStartKst - 9 * 60 * 60_000);
}

export default async function HomePage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const displayName = user?.email?.split("@")[0] ?? "트레이더";
  const userId = user?.id;

  const monthStart = kstMonthStartUtc();

  const [walletResult, recentRes, openRes, monthlyAnalysesRes] = await Promise.all([
    userId ? getOrCreateWallet(userId).catch(() => null) : Promise.resolve(null),
    supabase
      .from("trades")
      .select(
        "id, symbol, direction, timeframe, pre_grade, result_r, closed_at, created_at, order_status",
      )
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("trades")
      .select("id, order_status")
      .is("closed_at", null)
      .neq("mode", "backtest"),
    userId
      ? supabase
          .from("analyses")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", monthStart.toISOString())
      : Promise.resolve({ count: 0 }),
  ]);

  const wallet = walletResult;
  const balance = wallet?.usdtBalance ?? 0;
  const aiCredits = wallet?.aiCredits ?? 0;
  const monthlyAnalyses = (monthlyAnalysesRes as { count?: number | null }).count ?? 0;

  const recent = recentRes.data ?? [];
  const openTrades = openRes.data ?? [];
  const openCount = openTrades.filter(
    (t) => (t as { order_status?: string }).order_status !== "pending",
  ).length;
  const pendingCount = openTrades.filter(
    (t) => (t as { order_status?: string }).order_status === "pending",
  ).length;

  const isEmpty = recent.length === 0;

  return (
    <div className="space-y-10">
      {/* 1. Hero — 간결 */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold leading-[1.15]">
            안녕하세요, <span className="text-primary">{displayName}</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {openCount > 0
              ? `진행 중 ${openCount}건`
              : pendingCount > 0
                ? `대기 중 지정가 ${pendingCount}건`
                : "오늘 새 분석으로 시작해보세요."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/app/guide"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/40 px-4 py-2 text-sm text-foreground transition-colors hover:border-border/80 hover:bg-card/80"
          >
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            사용 방법
          </Link>
          <Link
            href="/app/analyze"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            AI 분석 시작
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* 1.5. 만료 임박 경고 (있을 때만) */}
      <Suspense fallback={null}>
        <ExpiryBanner />
      </Suspense>

      {/* 2. 오늘의 시장 한 줄 */}
      <Suspense fallback={<TodaySkeleton />}>
        <TodayMarketStrip />
      </Suspense>

      {/* 3. 리소스 3카드 — 큰 숫자 1개 + 한 줄, 카드 자체가 링크 */}
      <section className="grid gap-3 sm:grid-cols-3">
        <ResourceCard
          href="/app/wallet"
          icon={<Coins className="h-4 w-4 text-primary" />}
          label="vUSDT 잔액"
          value={formatNumber(balance, { maximumFractionDigits: 0 })}
          unit="vUSDT"
          hint={balance < 100 ? "충전 필요" : "사용 가능"}
        />
        <ResourceCard
          href="/app/credits"
          icon={<Sparkles className="h-4 w-4 text-primary" />}
          label="AI 크레딧"
          value={String(aiCredits)}
          unit="회"
          hint={
            aiCredits === 0
              ? "구매 필요"
              : `이번 달 ${monthlyAnalyses}회 사용`
          }
          alert={aiCredits === 0}
        />
        <ResourceCard
          href="/app/journal"
          icon={<Wallet className="h-4 w-4 text-primary" />}
          label="진행 중 거래"
          value={String(openCount)}
          unit="건"
          hint={pendingCount > 0 ? `대기 ${pendingCount}건` : "거래 보기"}
        />
      </section>

      {/* 4. 빠른 진입 4카드 */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuickCard href="/app/analyze" label="AI 분석" Icon={Sparkles} />
        <QuickCard href="/app/virtual-trade" label="트레이딩" Icon={Wallet} />
        <QuickCard href="/app/game" label="예측 게임" Icon={Gamepad2} />
        <QuickCard href="/app/journal" label="내 결과" Icon={LineChartIcon} />
      </section>

      {/* 5. 처음이세요? (빈 상태일 때만) */}
      {isEmpty ? (
        <Link
          href="/app/guide"
          className="group flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card/40 px-6 py-4 transition-all hover:border-primary/40 hover:bg-card/60"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-semibold">처음이세요?</div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                4단계 사이클과 등급 시스템을 한 번에 정리.
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors group-hover:text-primary">
            사용 방법
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      ) : null}

      {/* 6. 최근 거래 */}
      {!isEmpty ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              최근 거래
            </h2>
            <Link
              href="/app/journal"
              className="group inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 hover:text-primary"
            >
              전체 보기
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <ul className="divide-y divide-border/40 rounded-2xl border border-border/60 bg-card/40">
            {recent.map((t) => {
              const status = (t as { order_status?: string }).order_status;
              const isPending = status === "pending";
              return (
                <li key={t.id}>
                  <Link
                    href={`/app/journal/${t.id}`}
                    className="group flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <GradeBadge grade={t.pre_grade as Grade} size="sm" />
                      <span className="font-mono text-sm font-medium">{t.symbol}</span>
                      <span className="text-sm text-muted-foreground">
                        {t.direction === "long" ? "롱" : "숏"} · {t.timeframe}
                      </span>
                      {isPending ? (
                        <span className="rounded-md bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                          대기
                        </span>
                      ) : !t.closed_at ? (
                        <span className="rounded-md bg-grade-b/15 px-2 py-0.5 text-xs font-medium text-grade-b">
                          진행
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      {t.result_r != null ? (
                        <span
                          className={cn(
                            "font-mono font-medium",
                            Number(t.result_r) >= 0 ? "text-grade-a" : "text-grade-d",
                          )}
                        >
                          {Number(t.result_r) >= 0 ? "+" : ""}
                          {Number(t.result_r).toFixed(2)}R
                        </span>
                      ) : null}
                      <span className="text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString("ko-KR", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* 7. 시장 대시보드 — 매매 전 점검용 */}
      <section id="market" className="space-y-8 pt-4">
        <header className="flex items-baseline justify-between gap-4 border-t border-border/40 pt-8">
          <div>
            <h2 className="text-3xl font-bold leading-[1.15]">시장 현황</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              매매 전 1분, 지금 진입해도 되는 환경인지 점검하세요.
            </p>
          </div>
        </header>

        <AutoRefreshBar intervalMs={60_000} />

        <SessionsClock />

        <Suspense fallback={<MarketSkeleton height="lg" label="Snapshot · Today" />}>
          <SnapshotToday />
        </Suspense>

        <section>
          <div className="mb-4 flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            Live Market
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Suspense fallback={<MarketSkeleton label="Fear & Greed" />}>
              <FearGreedCard />
            </Suspense>
            <Suspense fallback={<MarketSkeleton label="BTC Dominance" />}>
              <DominanceCard />
            </Suspense>
            <Suspense fallback={<MarketSkeleton label="Alt Season Index" />}>
              <AltSeasonCard />
            </Suspense>
            <Suspense fallback={<MarketSkeleton label="김치 프리미엄" />}>
              <KimchiCard />
            </Suspense>
            <Suspense fallback={<MarketSkeleton label="Stablecoin Mcap" />}>
              <StablecapCard />
            </Suspense>
            <Suspense fallback={<MarketSkeleton label="Long/Short · BTC" />}>
              <LongShortCard />
            </Suspense>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Suspense fallback={<MarketSkeleton label="On-chain · DeFi TVL" height="md" />}>
            <DefiTvlCard />
          </Suspense>
          <Suspense fallback={<MarketSkeleton label="Capital Flow · 7d" height="md" />}>
            <CapitalFlowCard />
          </Suspense>
        </div>

        <MacroCalendar />

        <p className="text-xs text-muted-foreground">
          새로고침 주기: Snapshot 10분 · 펀딩 5분 · 도미넌스·Alt Season·Stablecoin 10–30분 · F&amp;G·DeFi TVL 1시간.
          모든 수치는 참고용이며 매매 결정은 본인 책임입니다.
        </p>
      </section>
    </div>
  );
}

function MarketSkeleton({
  label,
  height = "sm",
}: {
  label: string;
  height?: "sm" | "md" | "lg";
}) {
  const h =
    height === "lg"
      ? "min-h-[280px]"
      : height === "md"
        ? "min-h-[200px]"
        : "min-h-[140px]";
  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-border/60 bg-card/30 px-6 py-5",
        h,
      )}
    >
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-auto text-xs text-muted-foreground">데이터 로드 중…</p>
    </article>
  );
}

function TodaySkeleton() {
  return (
    <div className="flex items-center justify-between gap-6 rounded-2xl border border-border/60 bg-card/40 px-6 py-4">
      <span className="text-sm text-muted-foreground">시장 상태 확인 중…</span>
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        시장 보기
        <ArrowRight className="h-4 w-4" />
      </span>
    </div>
  );
}

function ResourceCard({
  href,
  icon,
  label,
  value,
  unit,
  hint,
  alert,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-3 rounded-2xl border bg-card/40 px-6 py-5 transition-all hover:bg-card/70",
        alert
          ? "border-grade-d/40 hover:border-grade-d/70"
          : "border-border/60 hover:border-primary/40",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          {icon}
          {label}
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-3xl font-bold leading-[1.15] tabular-nums",
            alert && "text-grade-d",
          )}
        >
          {value}
        </span>
        {unit ? (
          <span className="text-sm text-muted-foreground">{unit}</span>
        ) : null}
      </div>
      {hint ? (
        <p className={cn("text-xs", alert ? "text-grade-d" : "text-muted-foreground")}>
          {hint}
        </p>
      ) : null}
    </Link>
  );
}

function QuickCard({
  href,
  label,
  Icon,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-2xl border border-border/60 bg-card/40 px-5 py-4 transition-all hover:border-primary/40 hover:bg-card/70"
    >
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
        <span className="text-base font-semibold">{label}</span>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}
