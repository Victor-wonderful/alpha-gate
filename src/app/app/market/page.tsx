import { Suspense } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { AutoRefreshBar } from "@/components/market/auto-refresh-bar";
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

export const metadata = {
  title: "시장 대시보드 · Alpha Gate",
};

export default function MarketPage() {
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-bold leading-[1.15]">시장 대시보드</h1>
        <p className="mt-2 text-base text-muted-foreground">
          매매 전 1분, 지금 진입해도 되는 환경인지 점검하세요.
        </p>
      </header>

      <AutoRefreshBar intervalMs={60_000} />

      <Suspense fallback={<Skeleton height="lg" label="Snapshot · Today" />}>
        <SnapshotToday />
      </Suspense>

      <section>
        <div className="mb-4 flex items-center gap-2 text-base font-semibold">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          Live Market
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Suspense fallback={<Skeleton label="Fear & Greed" />}>
            <FearGreedCard />
          </Suspense>
          <Suspense fallback={<Skeleton label="BTC Dominance" />}>
            <DominanceCard />
          </Suspense>
          <Suspense fallback={<Skeleton label="Alt Season Index" />}>
            <AltSeasonCard />
          </Suspense>
          <Suspense fallback={<Skeleton label="김치 프리미엄" />}>
            <KimchiCard />
          </Suspense>
          <Suspense fallback={<Skeleton label="Stablecoin Mcap" />}>
            <StablecapCard />
          </Suspense>
          <Suspense fallback={<Skeleton label="Long/Short · BTC" />}>
            <LongShortCard />
          </Suspense>
        </div>
      </section>

      <Suspense fallback={<Skeleton label="On-chain · DeFi TVL" height="md" />}>
        <DefiTvlCard />
      </Suspense>

      <MacroCalendar />
      <SessionsClock />

      <p className="text-xs text-muted-foreground">
        새로고침 주기: Snapshot 10분 · 펀딩 5분 · 도미넌스·Alt Season·Stablecoin 10–30분 · F&amp;G·DeFi TVL 1시간.
        모든 수치는 참고용이며 매매 결정은 본인 책임입니다.
      </p>
    </div>
  );
}

function Skeleton({
  label,
  height = "sm",
}: {
  label: string;
  height?: "sm" | "md" | "lg";
}) {
  const h = height === "lg" ? "min-h-[280px]" : height === "md" ? "min-h-[200px]" : "min-h-[140px]";
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
