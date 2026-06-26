"use client";

import { useEffect, useState } from "react";
import { AlarmClock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { TFunction } from "@/lib/i18n/messages";
import type { TradingStyle } from "@/lib/analysis/style";
import { classifyLiquidity, kstParts, type LiquidityTier } from "@/lib/analysis/sessions";

/** Distance to the next time `H:00` candle close on a given hour cycle.
 *  e.g. for 4h cycle, returns minutes until the next 01/05/09/13/17/21 KST hour. */
function minutesToNextHourCycle(h: number, m: number, cycle: number, offset = 0): number {
  for (let candidate = h + 1; candidate < h + 25; candidate++) {
    const hr = candidate % 24;
    if (cycle === 1 || (hr - offset + 24) % cycle === 0) {
      const totalMinsAhead = (candidate - h) * 60 - m;
      return totalMinsAhead;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

/** Minutes since the most recent past hour cycle boundary. */
function minutesSinceLastHourCycle(h: number, m: number, cycle: number, offset = 0): number {
  for (let candidate = h; candidate > h - 25; candidate--) {
    const hr = ((candidate % 24) + 24) % 24;
    if (cycle === 1 || (hr - offset + 24) % cycle === 0) {
      return (h - candidate) * 60 + m;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

// 분석 적합도 4단계. optimal/good/fair 는 모두 "지금 분석 가능"이지만 품질이 다르다.
// avoid 는 펀딩 정산 ±10분 같은 노이즈 구간(잠시 회피).
type Status = "optimal" | "good" | "fair" | "avoid";

type Verdict = {
  status: Status;
  /** 캔들 마감 기준 짧은 문구 (예: "4H 마감 직후", "1H 마감 12분 전") */
  candle: string;
  /** 호버 툴팁용 한 줄 설명 */
  detail: string;
};

const STYLE_LABEL_KEY: Record<TradingStyle, string> = {
  scalp: "analyze.cmpB.styleScalp",
  day: "analyze.cmpB.styleDay",
  swing: "analyze.cmpB.styleSwing",
  position: "analyze.cmpB.stylePosition",
};

const LEVEL_NAME_KEY: Record<Status, string> = {
  optimal: "analyze.cmpB.levelOptimal",
  good: "analyze.cmpB.levelGood",
  fair: "analyze.cmpB.levelFair",
  avoid: "analyze.cmpB.levelAvoid",
};

/** "N분 경과" / "직후" — 막 마감했으면 직후. */
function elapsed(t: TFunction, unit: string, mins: number): string {
  return mins <= 0
    ? t("analyze.cmpB.elapsedJust", { unit })
    : t("analyze.cmpB.elapsed", { unit, mins });
}
/** "N분 전" / "X시간 Y분 전" — 다음 마감까지. */
function until(t: TFunction, unit: string, mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const dur =
    h === 0
      ? t("analyze.cmpB.durMin", { m })
      : m === 0
        ? t("analyze.cmpB.durHour", { h })
        : t("analyze.cmpB.durHourMin", { h, m });
  return t("analyze.cmpB.until", { unit, dur });
}

/** 펀딩 정산 ±10분 여부 (Binance 8h: 09 / 17 / 01 KST). */
function inFundingWindow(h: number, m: number): boolean {
  const fundingHours = [1, 9, 17];
  const cur = h * 60 + m;
  return fundingHours.some((fh) => {
    const diff = Math.min(
      Math.abs(cur - fh * 60),
      Math.abs(cur - (fh * 60 + 24 * 60)),
      Math.abs(cur - (fh * 60 - 24 * 60)),
    );
    return diff <= 10;
  });
}

function evaluate(
  t: TFunction,
  style: TradingStyle,
  parts: { h: number; m: number; totalMin: number },
  tier: LiquidityTier,
): Verdict {
  const { h, m } = parts;
  const liqGood = tier === "golden" || tier === "active";
  const dayLabel = t("analyze.cmpB.unitDaily");

  // 0) 회피 — 펀딩 정산 ±10분 (변동성 노이즈)
  if (inFundingWindow(h, m)) {
    return {
      status: "avoid",
      candle: t("analyze.cmpB.candleFunding"),
      detail: t("analyze.cmpB.detailFunding"),
    };
  }

  // ── 스캘핑: 캔들 신선도 + 유동성 둘 다 비중 ──
  if (style === "scalp") {
    const since5 = m % 5;
    const fresh = since5 <= 2;
    if (fresh && liqGood) {
      return {
        status: "optimal",
        candle: elapsed(t, "5M", since5),
        detail: t("analyze.cmpB.detailScalpOptimal", { mins: since5 }),
      };
    }
    if (fresh) {
      return {
        status: tier === "dead" ? "fair" : "good",
        candle: elapsed(t, "5M", since5),
        detail:
          tier === "dead"
            ? t("analyze.cmpB.detailScalpDead", { mins: since5 })
            : t("analyze.cmpB.detailScalpFresh", { mins: since5 }),
      };
    }
    return {
      status: liqGood ? "good" : "fair",
      candle: until(t, "5M", 5 - since5),
      detail: t("analyze.cmpB.detailWait5m", { mins: 5 - since5 }),
    };
  }

  // ── 데이: 1H 마감 우선, 유동성 보조 ──
  if (style === "day") {
    const fresh = m <= 15;
    if (fresh && liqGood) {
      return {
        status: "optimal",
        candle: elapsed(t, "1H", m),
        detail: t("analyze.cmpB.detailDayStable", { mins: m }),
      };
    }
    if (fresh) {
      return {
        status: "good",
        candle: elapsed(t, "1H", m),
        detail:
          tier === "dead"
            ? t("analyze.cmpB.detailDayDead", { mins: m })
            : t("analyze.cmpB.detailDayStable", { mins: m }),
      };
    }
    return {
      status: liqGood ? "good" : "fair",
      candle: until(t, "1H", 60 - m),
      detail: t("analyze.cmpB.detailWait1h", { mins: 60 - m }),
    };
  }

  // ── 스윙: 4H/1D 마감 기준 (HTF라 세션 영향 작음) ──
  if (style === "swing") {
    const since4h = minutesSinceLastHourCycle(h, m, 4, 1);
    const since1d = h * 60 + m - 9 * 60;
    const since1dAdj = since1d >= 0 ? since1d : since1d + 24 * 60;

    if (since1dAdj <= 60) {
      return {
        status: "optimal",
        candle: elapsed(t, dayLabel, since1dAdj),
        detail: t("analyze.cmpB.detailSwing1d", { mins: since1dAdj }),
      };
    }
    if (since4h <= 30) {
      return {
        status: "optimal",
        candle: elapsed(t, "4H", since4h),
        detail: t("analyze.cmpB.detailSwing4hOptimal", { mins: since4h }),
      };
    }
    if (since4h <= 120) {
      return {
        status: "good",
        candle: elapsed(t, "4H", since4h),
        detail: t("analyze.cmpB.detailSwing4hGood", { mins: since4h }),
      };
    }
    const toNext4h = minutesToNextHourCycle(h, m, 4, 1);
    return {
      status: "fair",
      candle: until(t, "4H", toNext4h),
      detail: t("analyze.cmpB.detailWait4h", {
        h: Math.floor(toNext4h / 60),
        m: toNext4h % 60,
      }),
    };
  }

  // ── 포지션: 1D 마감 기준 ──
  const since1d = h * 60 + m - 9 * 60;
  const since1dAdj = since1d >= 0 ? since1d : since1d + 24 * 60;
  if (since1dAdj <= 120) {
    return {
      status: "optimal",
      candle: elapsed(t, dayLabel, since1dAdj),
      detail: t("analyze.cmpB.detailPosition1d", { mins: since1dAdj }),
    };
  }
  const since4hPos = minutesSinceLastHourCycle(h, m, 4, 1);
  if (since4hPos <= 30) {
    return {
      status: "good",
      candle: elapsed(t, "4H", since4hPos),
      detail: t("analyze.cmpB.detailPosition4h"),
    };
  }
  const toNext1D = (24 * 60 - since1dAdj) % (24 * 60);
  return {
    status: "fair",
    candle: until(t, dayLabel, toNext1D),
    detail: t("analyze.cmpB.detailWaitDaily"),
  };
}

const STATUS_STYLE: Record<Status, { pill: string; text: string; icon: typeof AlarmClock }> = {
  optimal: { pill: "bg-grade-a/10", text: "text-grade-a", icon: AlarmClock },
  good: { pill: "bg-primary/10", text: "text-primary", icon: AlarmClock },
  fair: { pill: "bg-muted/40", text: "text-muted-foreground", icon: AlarmClock },
  avoid: { pill: "bg-grade-d/10", text: "text-grade-d", icon: AlertTriangle },
};

export function AnalysisTimingHint({ style }: { style: TradingStyle }) {
  const t = useT();
  // null on SSR + first client render — render neutral placeholder to avoid
  // hydration mismatch. After mount, evaluate with the real time and tick
  // every 30s.
  const [parts, setParts] = useState<ReturnType<typeof kstParts> | null>(null);

  useEffect(() => {
    setParts(kstParts(new Date()));
    const id = setInterval(() => setParts(kstParts(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  if (parts === null) {
    return (
      <div
        suppressHydrationWarning
        className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground"
      >
        <AlarmClock className="h-4 w-4 flex-none" />
        {t("analyze.cmpB.judging")}
      </div>
    );
  }

  const liquidity = classifyLiquidity(parts.totalMin, t);
  const verdict = evaluate(t, style, parts, liquidity.tier);
  const s = STATUS_STYLE[verdict.status];
  const Icon = s.icon;
  const styleLabel = t(STYLE_LABEL_KEY[style]);

  return (
    <div
      title={verdict.detail}
      className={cn("flex items-center gap-2 rounded-md px-3 py-2.5 text-sm", s.pill, s.text)}
    >
      <Icon className="h-4 w-4 flex-none" />
      <span className="min-w-0 leading-snug">
        {t("analyze.cmpB.verdictPrefix")}{" "}
        <span className="font-semibold">{styleLabel}</span>{" "}
        {t("analyze.cmpB.verdictMid")}{" "}
        <span className="font-bold">{t(LEVEL_NAME_KEY[verdict.status])}</span>
        <span className="opacity-80">
          {" "}
          — {liquidity.label} · {verdict.candle}
        </span>
      </span>
    </div>
  );
}
