import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
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
export default function MarketPage() {
  return (
    <div className="space-y-7">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold leading-[1.15]">시장 현황</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            매매 전 1분 — 지금 진입해도 되는 환경인지 점검하세요.
          </p>
        </div>
      </header>

      {/* 결론 먼저 — 진입 환경 요약 */}
      <Suspense fallback={<BannerSkeleton />}>
        <MarketSummaryBanner />
      </Suspense>

      <AutoRefreshBar intervalMs={60_000} />

      <CollapsibleSection
        storageKey="sessions"
        title="글로벌 세션"
        desc="세계 주요 시장의 개장 상태 — 유동성 골든 타임에 거래하면 슬리피지가 줄어듭니다"
        freq="실시간"
      >
        <SessionsClock />
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="snapshot"
        title="오늘 시세 스냅샷"
        desc="UTC 0시 기준 일간 변동 — 홈·후보 레이더와 같은 기준입니다"
        freq="10분"
      >
        <Suspense fallback={<MarketSkeleton height="lg" label="Snapshot · Today" />}>
          <SnapshotToday />
        </Suspense>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="sentiment"
        title="심리 · 수급 지표"
        desc="투자 심리와 시장 구조 — 극단값(과욕·과공포)은 반전 신호일 수 있습니다"
        freq="10–30분"
      >
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
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="onchain"
        title="온체인 · 자금 흐름"
        desc="DeFi 예치금과 스테이블코인 이동 — 큰돈이 들어오는지 나가는지"
        freq="1시간"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Suspense fallback={<MarketSkeleton label="On-chain · DeFi TVL" height="md" />}>
            <DefiTvlCard />
          </Suspense>
          <Suspense fallback={<MarketSkeleton label="Capital Flow · 7d" height="md" />}>
            <CapitalFlowCard />
          </Suspense>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="macro"
        title="매크로 일정"
        desc="금리·물가 이벤트 — 발표 전후 2시간은 신규 진입 비추천"
        freq="일간"
      >
        <MacroCalendar />
      </CollapsibleSection>

      {/* 김치 프리미엄 상세 — 차익거래 페이지로 (접힘 형태 진입점) */}
      <Link
        href="/app/arbitrage"
        className="group flex items-center gap-2.5 rounded-2xl border border-border/60 bg-card/40 px-5 py-3.5 transition-all hover:border-ring/40 hover:bg-card/60"
      >
        <ChevronRight className="h-4 w-4 flex-none text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        <span className="text-[15px] font-semibold">김치 프리미엄 상세</span>
        <span className="hidden min-w-0 flex-1 truncate text-[11px] text-muted-foreground/70 sm:block">
          26개 코인별 김프 · 변동성 랭킹 · 리밸런싱 차익거래 — 펼쳐서 보기
        </span>
        <span className="ml-auto flex-none text-xs font-medium text-primary/90 sm:ml-0">
          차익거래 →
        </span>
      </Link>

      <p className="text-xs text-muted-foreground">
        새로고침 주기: Snapshot 10분 · 펀딩 5분 · 도미넌스·Alt Season·Stablecoin 10–30분 · F&amp;G·DeFi
        TVL 1시간. 모든 수치는 참고용이며 매매 결정은 본인 책임입니다.
      </p>
    </div>
  );
}

function BannerSkeleton() {
  return (
    <div className="flex min-h-[88px] items-center rounded-2xl border border-border/60 bg-card/30 px-5 py-4 text-sm text-muted-foreground">
      진입 환경 점검 중…
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
    height === "lg" ? "min-h-[280px]" : height === "md" ? "min-h-[200px]" : "min-h-[140px]";
  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-border/60 bg-card/30 px-6 py-5",
        h,
      )}
    >
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-auto text-xs text-muted-foreground">데이터 로드 중…</p>
    </article>
  );
}
