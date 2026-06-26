"use client";

import { useMemo } from "react";
import { Dice5, Info } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { simulateScenario } from "@/lib/analysis/monte-carlo";
import type { TradingStyle } from "@/lib/analysis/style";

// 스타일별 시뮬 기간 (기준 MTF 봉 수). 스타일 보유기간에 대략 대응.
const STYLE_HORIZON: Record<TradingStyle, number> = {
  scalp: 16, // 15m × 16 ≈ 4h
  day: 16, // 1h × 16 ≈ 16h
  swing: 42, // 4h × 42 ≈ 7d
  position: 90, // 4h × 90 ≈ 15d
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function ScenarioProbability({
  entry,
  stop,
  target,
  direction,
  closes,
  style,
  compact = false,
}: {
  entry: number;
  stop: number;
  target: number;
  direction: "long" | "short";
  closes: number[];
  style: TradingStyle;
  /** 시안 카드용 한 줄(라벨 + 바 + 카운트) 표시 */
  compact?: boolean;
}) {
  const t = useT();
  const result = useMemo(
    () =>
      simulateScenario({
        entry,
        stop,
        target,
        direction,
        closes,
        horizonBars: STYLE_HORIZON[style] ?? 42,
      }),
    [entry, stop, target, direction, closes, style],
  );

  if (result.insufficient) return null;

  const { pTarget, pStop, pTimeout, expR, p10, p50, p90, medianDrawdownPct, paths } = result;
  const expGood = expR >= 0;
  const n = (p: number) => Math.round(p * 100);

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <span
          title={t("analyze.cmpB.compactTitle", {
            n: paths.toLocaleString(),
            exp: `${expR >= 0 ? "+" : ""}${expR.toFixed(2)}`,
          })}
          className="flex-none cursor-help text-xs text-muted-foreground"
        >
          {t("analyze.cmpB.reachProb")}{" "}
          <span className="hidden sm:inline text-muted-foreground/60">{t("analyze.cmpB.monteCarloParen")}</span>
        </span>
        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="bg-grade-a" style={{ width: pct(pTarget) }} />
          <div className="bg-muted-foreground/40" style={{ width: pct(pTimeout) }} />
          <div className="bg-grade-d" style={{ width: pct(pStop) }} />
        </div>
        <span className="flex-none font-mono text-xs tabular-nums text-muted-foreground">
          <span className="text-grade-a">{t("analyze.cmpB.compactTarget", { n: n(pTarget) })}</span>
          {" · "}{t("analyze.cmpB.compactTimeout", { n: n(pTimeout) })}
          {" · "}
          <span className="text-grade-d">{t("analyze.cmpB.compactStop", { n: n(pStop) })}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background/40 p-4">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Dice5 className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{t("analyze.cmpB.reachProbFull")}</span>
        <span
          title={t("analyze.cmpB.fullTitle", { n: paths.toLocaleString() })}
          className="ml-auto inline-flex cursor-help items-center gap-1 text-[10px] text-muted-foreground/70"
        >
          <Info className="h-3 w-3" />
          {t("analyze.cmpB.noDirection")}
        </span>
      </div>

      {/* 확률 바 */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-grade-a" style={{ width: pct(pTarget) }} title={t("analyze.cmpB.barTarget", { p: pct(pTarget) })} />
        <div className="bg-grade-d" style={{ width: pct(pStop) }} title={t("analyze.cmpB.barStop", { p: pct(pStop) })} />
        <div className="bg-muted-foreground/40" style={{ width: pct(pTimeout) }} title={t("analyze.cmpB.barTimeout", { p: pct(pTimeout) })} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="font-mono text-base font-bold tabular-nums text-grade-a">{pct(pTarget)}</div>
          <div className="text-[10px] text-muted-foreground">{t("analyze.cmpB.targetFirst")}</div>
        </div>
        <div>
          <div className="font-mono text-base font-bold tabular-nums text-grade-d">{pct(pStop)}</div>
          <div className="text-[10px] text-muted-foreground">{t("analyze.cmpB.stopFirst")}</div>
        </div>
        <div>
          <div className="font-mono text-base font-bold tabular-nums text-muted-foreground">{pct(pTimeout)}</div>
          <div className="text-[10px] text-muted-foreground">{t("analyze.cmpB.timeoutLabel")}</div>
        </div>
      </div>

      {/* 기대 R + 분포 */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border/50 pt-2.5 text-xs">
        <span className="text-muted-foreground">
          {t("analyze.cmpB.expValue")}{" "}
          <span className={"font-mono font-semibold tabular-nums " + (expGood ? "text-grade-a" : "text-grade-d")}>
            {expR >= 0 ? "+" : ""}
            {expR.toFixed(2)}R
          </span>
        </span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {t("analyze.cmpB.rDist")}{" "}
          <span className="text-grade-d">{p10 >= 0 ? "+" : ""}{p10.toFixed(1)}</span>
          {" · "}{t("analyze.cmpB.median")} <span className="text-foreground/80">{p50 >= 0 ? "+" : ""}{p50.toFixed(1)}</span>
          {" · "}p90 <span className="text-grade-a">{p90 >= 0 ? "+" : ""}{p90.toFixed(1)}</span>
        </span>
        <span className="text-muted-foreground">
          {t("analyze.cmpB.avgDrawdown")} <span className="font-mono tabular-nums text-amber-400">−{medianDrawdownPct.toFixed(1)}%</span>
        </span>
      </div>
    </div>
  );
}
