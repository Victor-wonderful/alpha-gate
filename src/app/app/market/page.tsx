import { Suspense } from "react";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { AutoRefreshBar } from "@/components/market/auto-refresh-bar";
import { CapitalFlowCard } from "@/components/market/capital-flow-card";
import { CollapsibleSection } from "@/components/market/collapsible-section";
import { MarketSummaryBanner } from "@/components/market/market-summary-banner";
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

/**
 * 시장 현황 — 매매 전 환경 점검.
 * 최상단 "진입 환경 요약"이 결론을 먼저 주고, 상세는 접이식 섹션으로.
 * (시안: pencil-new.pen "시안 — 마켓")
 */
export default async function MarketPage() {
  const t = await getT();
  return (
    <div className="space-y-7">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold leading-[1.15]">{t("market.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("market.subtitle")}</p>
        </div>
      </header>

      {/* 결론 먼저 — 진입 환경 요약 */}
      <Suspense fallback={<BannerSkeleton label={t("market.checking")} />}>
        <MarketSummaryBanner />
      </Suspense>

      <AutoRefreshBar intervalMs={60_000} />

      <CollapsibleSection
        storageKey="sessions"
        title={t("market.sec.sessionsTitle")}
        desc={t("market.sec.sessionsDesc")}
        freq={t("market.freq.realtime")}
      >
        <SessionsClock />
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="snapshot"
        title={t("market.sec.snapshotTitle")}
        desc={t("market.sec.snapshotDesc")}
        freq={t("market.freq.min10")}
      >
        <Suspense fallback={<MarketSkeleton height="lg" label="Snapshot · Today" loading={t("market.loadingData")} />}>
          <SnapshotToday />
        </Suspense>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="sentiment"
        title={t("market.sec.sentimentTitle")}
        desc={t("market.sec.sentimentDesc")}
        freq={t("market.freq.min10_30")}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Suspense fallback={<MarketSkeleton label="Fear & Greed" loading={t("market.loadingData")} />}>
            <FearGreedCard />
          </Suspense>
          <Suspense fallback={<MarketSkeleton label="BTC Dominance" loading={t("market.loadingData")} />}>
            <DominanceCard />
          </Suspense>
          <Suspense fallback={<MarketSkeleton label="Alt Season Index" loading={t("market.loadingData")} />}>
            <AltSeasonCard />
          </Suspense>
          <Suspense fallback={<MarketSkeleton label={t("market.card.kimchi")} loading={t("market.loadingData")} />}>
            <KimchiCard />
          </Suspense>
          <Suspense fallback={<MarketSkeleton label="Stablecoin Mcap" loading={t("market.loadingData")} />}>
            <StablecapCard />
          </Suspense>
          <Suspense fallback={<MarketSkeleton label="Long/Short · BTC" loading={t("market.loadingData")} />}>
            <LongShortCard />
          </Suspense>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="onchain"
        title={t("market.sec.onchainTitle")}
        desc={t("market.sec.onchainDesc")}
        freq={t("market.freq.hour1")}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Suspense fallback={<MarketSkeleton label="On-chain · DeFi TVL" height="md" loading={t("market.loadingData")} />}>
            <DefiTvlCard />
          </Suspense>
          <Suspense fallback={<MarketSkeleton label="Capital Flow · 7d" height="md" loading={t("market.loadingData")} />}>
            <CapitalFlowCard />
          </Suspense>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="macro"
        title={t("market.sec.macroTitle")}
        desc={t("market.sec.macroDesc")}
        freq={t("market.freq.daily")}
      >
        <MacroCalendar />
      </CollapsibleSection>

      <p className="text-xs text-muted-foreground">{t("market.footnote")}</p>
    </div>
  );
}

function BannerSkeleton({ label }: { label: string }) {
  return (
    <div className="flex min-h-[88px] items-center rounded-2xl border border-border/60 bg-card/30 px-5 py-4 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function MarketSkeleton({
  label,
  loading,
  height = "sm",
}: {
  label: string;
  loading: string;
  height?: "sm" | "md" | "lg";
}) {
  const h =
    height === "lg" ? "min-h-[280px]" : height === "md" ? "min-h-[200px]" : "min-h-[140px]";
  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-border/60 bg-card/30 px-6 py-5",
        h,
      )}
    >
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-auto text-xs text-muted-foreground">{loading}</p>
    </article>
  );
}
