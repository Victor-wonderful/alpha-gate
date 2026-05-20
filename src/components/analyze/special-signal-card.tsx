"use client";

import { Target, TrendingUp, TrendingDown, Zap, Clock, Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";
import type { AnalysisSnapshot } from "@/lib/analysis/analyze";
import type { StrategyResult } from "@/lib/analysis/strategy";
import { STRATEGY_LABELS } from "@/lib/analysis/strategy";

type Props = {
  snapshot: AnalysisSnapshot;
  strategy: StrategyResult;
};

/** Show the data-level evidence for a special strategy selection.
 *  Renders nothing for the generic strategies (trend_pullback / breakout / etc.). */
export function SpecialSignalCard({ snapshot, strategy }: Props) {
  switch (strategy.primary) {
    case "liquidity_grab":
      return <LiquidityGrabCard snapshot={snapshot} />;
    case "funding_squeeze":
      return <FundingSqueezeCard snapshot={snapshot} />;
    case "session_open_drive":
      return <SessionDriveCard snapshot={snapshot} />;
    default:
      return null;
  }
}

function CardShell({
  icon,
  title,
  subtitle,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tone: "primary" | "grade-a" | "grade-d" | "amber";
  children: React.ReactNode;
}) {
  const toneClass: Record<typeof tone, string> = {
    primary: "border-primary/30 bg-primary/5",
    "grade-a": "border-grade-a/30 bg-grade-a/5",
    "grade-d": "border-grade-d/30 bg-grade-d/5",
    amber: "border-amber-500/30 bg-amber-500/5",
  };
  const iconClass: Record<typeof tone, string> = {
    primary: "bg-primary/15 text-primary",
    "grade-a": "bg-grade-a/15 text-grade-a",
    "grade-d": "bg-grade-d/15 text-grade-d",
    amber: "bg-amber-500/15 text-amber-400",
  };
  return (
    <Card className={cn("overflow-hidden", toneClass[tone])}>
      <div className="flex items-start gap-3 p-4">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", iconClass[tone])}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              특수 전략 신호
            </span>
            <Badge className={cn("border text-[10px]", toneClass[tone])}>
              {title}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "bad" | "warn";
}) {
  const toneClass = {
    default: "text-foreground",
    good: "text-grade-a",
    bad: "text-grade-d",
    warn: "text-amber-400",
  }[tone];
  return (
    <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-mono text-sm font-semibold tabular-nums", toneClass)}>{value}</div>
      {hint ? <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

// ─── liquidity_grab ─────────────────────────────────────────────────────────
function LiquidityGrabCard({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const sweeps = snapshot.liquiditySweeps ?? [];
  const freshest = sweeps[0];
  if (!freshest) {
    return (
      <CardShell
        icon={<Target className="h-4 w-4" />}
        title={STRATEGY_LABELS.liquidity_grab}
        subtitle="LLM이 이 전략을 골랐으나, 감지 모듈은 최근 스윕을 찾지 못했습니다. 시나리오의 근거를 카드의 트리거로 확인하세요."
        tone="amber"
      >
        <div className="text-xs text-muted-foreground">감지된 sweep 이벤트 없음</div>
      </CardShell>
    );
  }
  const isBullish = freshest.side === "bullish";
  const piercePct = (Math.abs(freshest.wickExtreme - freshest.sweptLevel) / freshest.sweptLevel) * 100;
  return (
    <CardShell
      icon={isBullish ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
      title={STRATEGY_LABELS.liquidity_grab}
      subtitle={
        isBullish
          ? "직전 저점을 잠깐 깬 뒤 회복 — 큰손이 매도 스톱을 청산시킨 자리. 롱 우위 신호."
          : "직전 고점을 잠깐 뚫은 뒤 회복 — 큰손이 매수 스톱을 청산시킨 자리. 숏 우위 신호."
      }
      tone={isBullish ? "grade-a" : "grade-d"}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Sweep된 가격"
          value={`$${formatNumber(freshest.sweptLevel)}`}
          hint={isBullish ? "직전 저점" : "직전 고점"}
        />
        <Stat
          label={isBullish ? "최저 wick" : "최고 wick"}
          value={`$${formatNumber(freshest.wickExtreme)}`}
          hint={`±${piercePct.toFixed(2)}% 침투`}
        />
        <Stat
          label="회복 종가"
          value={`$${formatNumber(freshest.recoveryClose)}`}
          hint={`${freshest.recoveredWithinBars}봉 내 회복`}
        />
        <Stat
          label="신선도"
          value={`${freshest.ageBars}봉 전`}
          hint="낮을수록 신선"
          tone={freshest.ageBars <= 2 ? "good" : "warn"}
        />
      </div>
      {sweeps.length > 1 ? (
        <div className="mt-2 text-[10px] text-muted-foreground">
          + 다른 sweep {sweeps.length - 1}건 더 감지됨
        </div>
      ) : null}
    </CardShell>
  );
}

// ─── funding_squeeze ────────────────────────────────────────────────────────
function FundingSqueezeCard({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const sq = snapshot.fundingSqueeze;
  if (!sq) return null;
  const c = sq.components;
  const fundingPct = (c.fundingRate * 100).toFixed(4);
  const avgPct = (c.avg24h * 100).toFixed(4);
  const crowded = sq.direction === "long" ? "롱" : "숏";
  const reverseSide = sq.direction === "long" ? "숏" : "롱";
  return (
    <CardShell
      icon={<Zap className="h-4 w-4" />}
      title={STRATEGY_LABELS.funding_squeeze}
      subtitle={`${crowded} 포지션 군집 형성 — 강제 청산 캐스케이드 노려 ${reverseSide} 진입 후보. 시간 한도 12~24시간.`}
      tone="amber"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="현재 펀딩"
          value={`${c.fundingRate >= 0 ? "+" : ""}${fundingPct}%`}
          hint="8시간 기준"
          tone={Math.abs(c.fundingRate) >= 0.0008 ? "warn" : "default"}
        />
        <Stat label="24h 평균 펀딩" value={`${c.avg24h >= 0 ? "+" : ""}${avgPct}%`} hint={`추세 ${c.fundingTrend ?? "—"}`} />
        <Stat
          label="OI 4h 변화"
          value={c.oi4hChangePct !== null ? `${c.oi4hChangePct >= 0 ? "+" : ""}${c.oi4hChangePct.toFixed(1)}%` : "—"}
          hint="±15% 이상 군집 신호"
          tone={c.oi4hChangePct !== null && Math.abs(c.oi4hChangePct) >= 15 ? "warn" : "default"}
        />
        <Stat
          label="신호 강도"
          value={`${Math.round(sq.intensity * 100)}%`}
          hint="60% 이상 액션 후보"
          tone={sq.intensity >= 0.6 ? "good" : "warn"}
        />
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">{sq.reason}</div>
    </CardShell>
  );
}

// ─── session_open_drive ────────────────────────────────────────────────────
function SessionDriveCard({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const sd = snapshot.sessionOpenDrive;
  if (!sd) return null;
  const c = sd.components;
  const isLong = sd.direction === "long";
  return (
    <CardShell
      icon={<Clock className="h-4 w-4" />}
      title={STRATEGY_LABELS.session_open_drive}
      subtitle="미국 개장 첫 30~60분 강한 방향성 — 그 방향 추종. 미국 마감 전 청산 권장."
      tone={isLong ? "grade-a" : "grade-d"}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="개장 시가"
          value={c.openPrice !== null ? `$${formatNumber(c.openPrice)}` : "—"}
          hint="자연 손절선"
        />
        <Stat
          label="현재가"
          value={c.currentPrice !== null ? `$${formatNumber(c.currentPrice)}` : "—"}
        />
        <Stat
          label="이동 폭"
          value={c.movePct !== null ? `${c.movePct >= 0 ? "+" : ""}${c.movePct.toFixed(2)}%` : "—"}
          hint="0.4% 이상 발동"
          tone={c.movePct !== null && Math.abs(c.movePct) >= 0.4 ? "good" : "default"}
        />
        <Stat
          label="거래량 배율"
          value={c.volumeRatio !== null ? `${c.volumeRatio.toFixed(2)}×` : "—"}
          hint="1.5× 이상 발동"
          tone={c.volumeRatio !== null && c.volumeRatio >= 1.5 ? "good" : "default"}
        />
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
        <Layers className="h-3 w-3" />
        개장 후 {c.minutesIntoSession}분 경과 · 신호 강도 {Math.round(sd.intensity * 100)}%
      </div>
    </CardShell>
  );
}
