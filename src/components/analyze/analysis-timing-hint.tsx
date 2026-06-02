"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Clock, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TradingStyle } from "@/lib/analysis/style";
import {
  analysisEntryLink,
  classifyLiquidity,
  entrySuitability,
  fmtClock,
  fmtDuration,
  kstParts,
  nextPrimeTime,
  type LiquidityTier,
} from "@/lib/analysis/sessions";

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

// 톤 철학(개방적): 분석은 대부분의 시간에 유효하다. 캔들 마감 대기는 '금지'가 아니라
// '미세 최적화'이므로 격려 톤("분석 가능")으로 보여주고, 베스트 순간만 초록으로 강조한다.
// 진짜 회피(빨강)는 펀딩 정산 ±10분 같은 변동성 노이즈 구간으로 한정한다.
type Status = "optimal" | "fine" | "avoid";

type Verdict = {
  status: Status;
  title: string;
  detail: string;
  /** 우측 미니 표시 (더 정확해지는 시점 / 재시도 시점) */
  nextWindow?: string;
  nextLabel?: string;
};

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
  style: TradingStyle,
  parts: { h: number; m: number; totalMin: number },
  tier: LiquidityTier,
): Verdict {
  const { h, m } = parts;

  // 0) 진짜 회피 — 펀딩 정산 ±10분 (변동성 노이즈). 매크로 이벤트는 추후 추가.
  if (inFundingWindow(h, m)) {
    return {
      status: "avoid",
      title: "펀딩 정산 ±10분 — 잠시 후 재시도",
      detail: "정산 직전·직후 변동성이 폭증해 결과가 흔들립니다. 10분 뒤가 깔끔합니다.",
      nextWindow: "10분 후",
      nextLabel: "재시도",
    };
  }

  // ── 스캘핑: 캔들 마감 + 유동성이 최적의 조건. 그 외엔 '가능'(격려). ──
  if (style === "scalp") {
    const sinceLast5m = m % 5;
    const fresh = sinceLast5m <= 2;
    if (fresh && (tier === "active" || tier === "golden")) {
      return {
        status: "optimal",
        title: tier === "golden" ? "골든 타임 — 스캘핑 최적" : "지금 분석하기 좋은 시점",
        detail: `5M 마감 ${sinceLast5m}분 경과 · 유동성 양호. 단기 데이터 안정적.`,
      };
    }
    let detail = "지금 분석해도 무방합니다.";
    let nextWindow: string | undefined;
    let nextLabel: string | undefined;
    if (!fresh) {
      detail += ` ${5 - sinceLast5m}분 뒤 5M 마감 시 더 정확.`;
      nextWindow = `${5 - sinceLast5m}분 후`;
      nextLabel = "더 정확";
    }
    if (tier === "dead") detail += " 유동성 낮은 구간 — 16:00 런던 개장 이후 더 안정적.";
    else if (tier === "quiet") detail += " 아시아 한산 — 목표는 좁게 잡으세요.";
    return { status: "fine", title: "지금 분석 가능", detail, nextWindow, nextLabel };
  }

  // ── 데이: 1H 마감이 최적, 그 외엔 '가능'. ──
  if (style === "day") {
    const fresh = m <= 15;
    if (fresh && tier !== "dead") {
      return {
        status: "optimal",
        title: "지금 분석하기 좋은 시점",
        detail: `1H 마감 ${m}분 경과 · 유동성 양호. 안정적.`,
      };
    }
    let detail = "지금 분석해도 무방합니다.";
    let nextWindow: string | undefined;
    let nextLabel: string | undefined;
    if (!fresh) {
      detail += ` ${60 - m}분 뒤 1H 마감 시 더 정확.`;
      nextWindow = `${60 - m}분 후`;
      nextLabel = "더 정확";
    } else if (tier === "dead") {
      detail += " 미국 마감 후 한산 — 신규 진입은 유동성 확인 후.";
    }
    return { status: "fine", title: "지금 분석 가능", detail, nextWindow, nextLabel };
  }

  // ── 스윙: 4H/1D 마감이 최적 (HTF라 세션 영향 작음). 그 외엔 '가능'. ──
  if (style === "swing") {
    const sinceLast4h = minutesSinceLastHourCycle(h, m, 4, 1);
    const sinceLast1d = h * 60 + m - 9 * 60; // since today 09:00 KST
    const sinceLast1dAdjusted = sinceLast1d >= 0 ? sinceLast1d : sinceLast1d + 24 * 60;

    if (sinceLast1dAdjusted <= 60) {
      return {
        status: "optimal",
        title: "지금 분석하기 좋은 시점 — 일봉 마감 직후",
        detail: `1D 마감 ${sinceLast1dAdjusted}분 경과. 큰 시간대까지 안정적 — 스윙 최적.`,
      };
    }
    if (sinceLast4h <= 30) {
      return {
        status: "optimal",
        title: "지금 분석하기 좋은 시점",
        detail: `4H 마감 ${sinceLast4h}분 경과. 데이터 안정적.`,
      };
    }
    const minsToNext4h = minutesToNextHourCycle(h, m, 4, 1);
    return {
      status: "fine",
      title: "지금 분석 가능",
      detail: `지금 분석해도 무방합니다. ${Math.floor(minsToNext4h / 60)}시간 ${
        minsToNext4h % 60
      }분 뒤 4H 마감 시 더 정확.`,
      nextWindow: `${Math.floor(minsToNext4h / 60)}시간 ${minsToNext4h % 60}분 후`,
      nextLabel: "더 정확",
    };
  }

  // ── 포지션: 1D 마감이 최적. 그 외엔 '가능'. ──
  const sincePositionDay = h * 60 + m - 9 * 60;
  const sincePositionDayAdj = sincePositionDay >= 0 ? sincePositionDay : sincePositionDay + 24 * 60;
  if (sincePositionDayAdj <= 120) {
    return {
      status: "optimal",
      title: "지금 분석하기 좋은 시점 — 일봉 마감 직후",
      detail: `1D 마감 ${sincePositionDayAdj}분 경과. 포지션 매매에 가장 적합.`,
    };
  }
  if (minutesSinceLastHourCycle(h, m, 4, 1) <= 30) {
    return {
      status: "optimal",
      title: "4H 마감 직후 — 분석 가능",
      detail: "이상적인 시점은 1D 마감(09:00 KST) 직후이지만, 4H 마감 직후도 무방.",
    };
  }
  const minsToNext1D = (24 * 60 - sincePositionDayAdj) % (24 * 60);
  return {
    status: "fine",
    title: "지금 분석 가능",
    detail: `지금 분석해도 무방합니다. 가장 정확한 시점은 다음 1D 마감(09:00 KST).`,
    nextWindow: `${Math.floor(minsToNext1D / 60)}시간 ${minsToNext1D % 60}분 후`,
    nextLabel: "최적",
  };
}

const TIER_BADGE: Record<LiquidityTier, { label: string; cls: string }> = {
  golden: { label: "🌟 골든 타임", cls: "bg-grade-a/15 text-grade-a" },
  active: { label: "활성 세션", cls: "bg-primary/15 text-primary" },
  quiet: { label: "한산 (아시아)", cls: "bg-muted/50 text-muted-foreground" },
  dead: { label: "유동성 낮음", cls: "bg-muted/50 text-muted-foreground" },
};

export function AnalysisTimingHint({ style }: { style: TradingStyle }) {
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
        className="flex items-start gap-3 rounded-lg border border-border bg-card/40 px-4 py-3"
      >
        <div className="flex flex-none items-center gap-1.5 pt-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-muted" />
          <Clock className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-muted-foreground">시점 판정 중…</div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            현재 시각·세션 기준으로 지금이 분석에 좋은 시점인지 확인합니다.
          </p>
        </div>
      </div>
    );
  }

  const liquidity = classifyLiquidity(parts.totalMin);
  const verdict = evaluate(style, parts, liquidity.tier);
  const next = nextPrimeTime(style, parts.totalMin);
  const entry = entrySuitability(parts.totalMin, parts.dow);
  const entryLink = analysisEntryLink(style, parts.totalMin, entry);

  const tone =
    verdict.status === "optimal"
      ? "border-grade-a/40 bg-grade-a/5"
      : verdict.status === "fine"
        ? "border-primary/25 bg-primary/[0.04]"
        : "border-grade-d/40 bg-grade-d/5";
  const dotTone =
    verdict.status === "optimal"
      ? "bg-grade-a"
      : verdict.status === "fine"
        ? "bg-primary"
        : "bg-grade-d";
  const Icon = verdict.status === "avoid" ? AlertTriangle : CheckCircle2;
  const iconColor =
    verdict.status === "optimal"
      ? "text-grade-a"
      : verdict.status === "fine"
        ? "text-primary"
        : "text-grade-d";

  const timeStr = `${String(parts.h).padStart(2, "0")}:${String(parts.m).padStart(2, "0")} KST`;
  const tierBadge = TIER_BADGE[liquidity.tier];

  return (
    <div className={cn("rounded-lg border", tone)}>
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex flex-none items-center gap-1.5 pt-0.5">
          <span className={cn("h-1.5 w-1.5 animate-pulse rounded-full", dotTone)} />
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold">{verdict.title}</span>
            <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{timeStr}</span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{verdict.detail}</p>
        </div>
        {verdict.nextWindow ? (
          <div className="flex-none text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {verdict.nextLabel ?? "참고"}
            </div>
            <div className="text-xs font-semibold">{verdict.nextWindow}</div>
          </div>
        ) : null}
      </div>

      {/* 진입 연계 — 스타일별로 분석 실행이 실제 진입과 어떻게 이어지는지 */}
      <div className="flex items-start gap-1.5 border-t border-border/50 px-4 py-2 text-[11px] text-muted-foreground">
        <Target className="mt-0.5 h-3 w-3 flex-none text-muted-foreground/70" />
        <span className="min-w-0">
          <span className="font-medium text-foreground/80">진입 연계</span> · {entryLink}
        </span>
      </div>

      {/* 하단: 현재 유동성 등급 + 오늘 다음 추천(최적) 분석 시각 */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/50 px-4 py-2">
        <span
          className={cn(
            "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold",
            tierBadge.cls,
          )}
          title={liquidity.note}
        >
          {tierBadge.label}
        </span>
        <span className="text-[11px] text-muted-foreground">
          오늘 추천 시각{" "}
          <span className="font-mono tabular-nums text-foreground">{fmtClock(next.at)} KST</span>
          <span className="text-muted-foreground/70"> · {fmtDuration(next.minsAhead)} 후</span>
        </span>
      </div>
    </div>
  );
}
