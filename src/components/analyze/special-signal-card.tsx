"use client";

import { Target, TrendingUp, TrendingDown, Zap, Clock, Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { TFunction } from "@/lib/i18n/messages";
import type { AnalysisSnapshot } from "@/lib/analysis/analyze";
import type { StrategyResult } from "@/lib/analysis/strategy";
import { STRATEGY_LABELS } from "@/lib/analysis/strategy";

type Props = {
  snapshot: AnalysisSnapshot;
  strategy: StrategyResult;
  /** Hints found across scenarios — used to render multiple special cards
   *  when scenarios pull from different special strategies. */
  scenarioHints?: Array<string | undefined>;
};

/** Show the data-level evidence for each special strategy that drives at least
 *  one scenario in this analysis. Renders nothing for generic-only analyses. */
export function SpecialSignalCard({ snapshot, strategy, scenarioHints = [] }: Props) {
  const ids = new Set<string>();
  // Always include the main strategy if it's a special one.
  if (
    strategy.primary === "liquidity_grab" ||
    strategy.primary === "funding_squeeze" ||
    strategy.primary === "session_open_drive"
  ) {
    ids.add(strategy.primary);
  }
  // Add any special strategies referenced by individual scenarios.
  for (const h of scenarioHints) {
    if (h === "liquidity_grab" || h === "funding_squeeze" || h === "session_open_drive") {
      ids.add(h);
    }
  }
  if (ids.size === 0) return null;

  return (
    <div className="space-y-3">
      {ids.has("liquidity_grab") ? <LiquidityGrabCard snapshot={snapshot} /> : null}
      {ids.has("funding_squeeze") ? <FundingSqueezeCard snapshot={snapshot} /> : null}
      {ids.has("session_open_drive") ? <SessionDriveCard snapshot={snapshot} /> : null}
    </div>
  );
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
  const t = useT();
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
              {t("analyze.cmpB.specialSignal")}
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
  const t = useT();
  const sweeps = snapshot.liquiditySweeps ?? [];
  const freshest = sweeps[0];
  if (!freshest) {
    return (
      <CardShell
        icon={<Target className="h-4 w-4" />}
        title={STRATEGY_LABELS.liquidity_grab}
        subtitle={t("analyze.cmpB.grabNoSweepSubtitle")}
        tone="amber"
      >
        <div className="text-xs text-muted-foreground">{t("analyze.cmpB.grabNoSweep")}</div>
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
          ? t("analyze.cmpB.grabBullishSubtitle")
          : t("analyze.cmpB.grabBearishSubtitle")
      }
      tone={isBullish ? "grade-a" : "grade-d"}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label={t("analyze.cmpB.grabSweptLabel")}
          value={`$${formatNumber(freshest.sweptLevel)}`}
          hint={isBullish ? t("analyze.cmpB.grabPrevLow") : t("analyze.cmpB.grabPrevHigh")}
        />
        <Stat
          label={isBullish ? t("analyze.cmpB.grabLowWick") : t("analyze.cmpB.grabHighWick")}
          value={`$${formatNumber(freshest.wickExtreme)}`}
          hint={t("analyze.cmpB.grabPierce", { p: piercePct.toFixed(2) })}
        />
        <Stat
          label={t("analyze.cmpB.grabRecoveryClose")}
          value={`$${formatNumber(freshest.recoveryClose)}`}
          hint={t("analyze.cmpB.grabRecoveredWithin", { n: freshest.recoveredWithinBars })}
        />
        <Stat
          label={t("analyze.cmpB.grabFreshness")}
          value={t("analyze.cmpB.grabAgeBars", { n: freshest.ageBars })}
          hint={t("analyze.cmpB.grabFreshnessHint")}
          tone={freshest.ageBars <= 2 ? "good" : "warn"}
        />
      </div>
      {sweeps.length > 1 ? (
        <div className="mt-2 text-[10px] text-muted-foreground">
          {t("analyze.cmpB.grabMoreSweeps", { n: sweeps.length - 1 })}
        </div>
      ) : null}
    </CardShell>
  );
}

// ─── funding_squeeze ────────────────────────────────────────────────────────
function FundingSqueezeCard({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const t = useT();
  const sq = snapshot.fundingSqueeze;
  if (!sq) return null;
  const c = sq.components;
  const fundingPct = (c.fundingRate * 100).toFixed(4);
  const avgPct = (c.avg24h * 100).toFixed(4);
  const crowded = sq.direction === "long" ? t("common.long") : t("common.short");
  const reverseSide = sq.direction === "long" ? t("common.short") : t("common.long");
  return (
    <CardShell
      icon={<Zap className="h-4 w-4" />}
      title={STRATEGY_LABELS.funding_squeeze}
      subtitle={t("analyze.cmpB.squeezeSubtitle", { crowded, reverse: reverseSide })}
      tone="amber"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label={t("analyze.cmpB.squeezeCurFunding")}
          value={`${c.fundingRate >= 0 ? "+" : ""}${fundingPct}%`}
          hint={t("analyze.cmpB.squeeze8h")}
          tone={Math.abs(c.fundingRate) >= 0.0008 ? "warn" : "default"}
        />
        <Stat
          label={t("analyze.cmpB.squeezeAvgFunding")}
          value={`${c.avg24h >= 0 ? "+" : ""}${avgPct}%`}
          hint={t("analyze.cmpB.squeezeTrend", { trend: c.fundingTrend ?? "—" })}
        />
        <Stat
          label={t("analyze.cmpB.squeezeOi4h")}
          value={c.oi4hChangePct !== null ? `${c.oi4hChangePct >= 0 ? "+" : ""}${c.oi4hChangePct.toFixed(1)}%` : "—"}
          hint={t("analyze.cmpB.squeezeOiHint")}
          tone={c.oi4hChangePct !== null && Math.abs(c.oi4hChangePct) >= 15 ? "warn" : "default"}
        />
        <Stat
          label={t("analyze.cmpB.signalIntensity")}
          value={`${Math.round(sq.intensity * 100)}%`}
          hint={t("analyze.cmpB.squeezeIntensityHint")}
          tone={sq.intensity >= 0.6 ? "good" : "warn"}
        />
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">{sq.reason}</div>
    </CardShell>
  );
}

// ─── session_open_drive ────────────────────────────────────────────────────
function SessionDriveCard({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const t = useT();
  const sd = snapshot.sessionOpenDrive;
  if (!sd) return null;
  const c = sd.components;
  const isLong = sd.direction === "long";
  const sessionLabel = c.sessionLabel || t("analyze.cmpB.sessionFallback");
  const threshold = c.moveThresholdPct ?? 0.4;
  return (
    <CardShell
      icon={<Clock className="h-4 w-4" />}
      title={`${STRATEGY_LABELS.session_open_drive} (${sessionLabel})`}
      subtitle={t("analyze.cmpB.driveSubtitle", { session: sessionLabel })}
      tone={isLong ? "grade-a" : "grade-d"}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label={t("analyze.cmpB.driveOpenPrice")}
          value={c.openPrice !== null ? `$${formatNumber(c.openPrice)}` : "—"}
          hint={t("analyze.cmpB.driveNaturalStop")}
        />
        <Stat
          label={t("analyze.cmpB.driveCurrentPrice")}
          value={c.currentPrice !== null ? `$${formatNumber(c.currentPrice)}` : "—"}
        />
        <Stat
          label={t("analyze.cmpB.driveMove")}
          value={c.movePct !== null ? `${c.movePct >= 0 ? "+" : ""}${c.movePct.toFixed(2)}%` : "—"}
          hint={t("analyze.cmpB.driveMoveHint", { threshold })}
          tone={c.movePct !== null && Math.abs(c.movePct) >= threshold ? "good" : "default"}
        />
        <Stat
          label={t("analyze.cmpB.driveVolRatio")}
          value={c.volumeRatio !== null ? `${c.volumeRatio.toFixed(2)}×` : "—"}
          hint={t("analyze.cmpB.driveVolHint")}
          tone={c.volumeRatio !== null && c.volumeRatio >= 1.5 ? "good" : "default"}
        />
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
        <Layers className="h-3 w-3" />
        {t("analyze.cmpB.driveFooter", {
          session: sessionLabel,
          mins: c.minutesIntoSession,
          intensity: Math.round(sd.intensity * 100),
        })}
      </div>
    </CardShell>
  );
}
