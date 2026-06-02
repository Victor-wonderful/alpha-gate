"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Clock, Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TradingStyle } from "@/lib/analysis/style";
import {
  classifyLiquidity,
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

type Status = "good" | "caution" | "wait" | "avoid";

type Verdict = {
  status: Status;
  title: string;
  detail: string;
  nextWindow?: string;
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
  const { h, m, totalMin } = parts;

  // 0) 펀딩 정산 ±10분 — 모든 스타일 최우선 회피
  if (inFundingWindow(h, m)) {
    return {
      status: "avoid",
      title: "펀딩 정산 ±10분 — 분석 회피",
      detail: "정산 직전·직후 변동성이 폭증해 분석 신뢰도가 떨어집니다. 10분 뒤 재시도.",
      nextWindow: "10분 후",
    };
  }

  // ── 스캘핑: 캔들 마감 + 유동성 둘 다 필요 ──────────────────────────
  if (style === "scalp") {
    const sinceLast5m = m % 5;
    const fresh = sinceLast5m <= 2;

    // 죽은 구간은 캔들이 막 마감해도 체결이 얇아 휩쏘 위험 → 하향
    if (tier === "dead") {
      return {
        status: "avoid",
        title: "유동성 죽은 구간 — 스캘핑 비권장",
        detail: "체결이 얇아 캔들 마감 신호도 휩쏘로 무너지기 쉽습니다. 16:00 런던 개장 이후 권장.",
        nextWindow: "16:00 KST",
      };
    }
    if (!fresh) {
      return {
        status: "wait",
        title: "다음 5M 캔들 마감 대기",
        detail: `${5 - sinceLast5m}분 뒤 캔들 확정 후 분석하면 더 정확합니다.`,
        nextWindow: `${5 - sinceLast5m}분 후`,
      };
    }
    if (tier === "quiet") {
      return {
        status: "caution",
        title: "분석 가능 — 단 아시아 한산",
        detail: `5M 마감 ${sinceLast5m}분 경과. 변동성 낮아 박스 잦음, 목표 좁게.`,
      };
    }
    // active / golden + fresh
    return {
      status: "good",
      title: tier === "golden" ? "골든 타임 — 스캘핑 최적" : "지금 분석하기 좋은 시점",
      detail: `5M 마감 ${sinceLast5m}분 경과 · 유동성 양호. 단기 데이터 안정적.`,
    };
  }

  // ── 데이: 1H 마감 우선, 유동성은 보조 메모 ─────────────────────────
  if (style === "day") {
    const fresh = m <= 15;
    if (!fresh) {
      return {
        status: "wait",
        title: "다음 1H 캔들 마감 대기",
        detail: `${60 - m}분 뒤 분석하면 데이터가 더 안정적입니다.`,
        nextWindow: `${60 - m}분 후`,
      };
    }
    if (tier === "dead") {
      return {
        status: "caution",
        title: "1H 마감 직후 — 단 한산",
        detail: `1H 마감 ${m}분 경과. 미국 마감 후 복기엔 적합하나 신규 진입은 유동성 확인 후.`,
      };
    }
    return {
      status: "good",
      title: "지금 분석하기 좋은 시점",
      detail: `1H 마감 ${m}분 경과 · 유동성 양호. 안정적.`,
    };
  }

  // ── 스윙: 4H/1D 마감 기준 (HTF라 세션 영향 작음) ───────────────────
  if (style === "swing") {
    const fourHourAnchors = [1, 5, 9, 13, 17, 21];
    const sinceLast4h = minutesSinceLastHourCycle(h, m, 4, 1);
    const sinceLast1d = h * 60 + m - 9 * 60; // since today 09:00 KST
    const sinceLast1dAdjusted = sinceLast1d >= 0 ? sinceLast1d : sinceLast1d + 24 * 60;

    if (sinceLast1dAdjusted <= 60) {
      return {
        status: "good",
        title: "지금 분석하기 좋은 시점 — 일봉 마감 직후",
        detail: `1D 마감 ${sinceLast1dAdjusted}분 경과. 큰 시간대까지 안정적 — 스윙 최적.`,
      };
    }
    if (sinceLast4h <= 30) {
      return {
        status: "good",
        title: "지금 분석하기 좋은 시점",
        detail: `4H 마감 ${sinceLast4h}분 경과. 데이터 안정적.`,
      };
    }
    const minsToNext4h = minutesToNextHourCycle(h, m, 4, 1);
    const nextHour = fourHourAnchors.find((fh) => {
      const diff = (fh - h + 24) % 24;
      return diff * 60 - m === minsToNext4h || (diff === 0 && minsToNext4h === 24 * 60);
    });
    return {
      status: "wait",
      title: "다음 4H 캔들 마감 대기",
      detail: `${Math.floor(minsToNext4h / 60)}시간 ${minsToNext4h % 60}분 뒤 ${
        nextHour !== undefined ? String(nextHour).padStart(2, "0") : "??"
      }:00 KST.`,
      nextWindow: `${Math.floor(minsToNext4h / 60)}시간 ${minsToNext4h % 60}분 후`,
    };
  }

  // ── 포지션: 1D 마감 기준 ───────────────────────────────────────────
  const sincePositionDay = h * 60 + m - 9 * 60;
  const sincePositionDayAdj = sincePositionDay >= 0 ? sincePositionDay : sincePositionDay + 24 * 60;
  if (sincePositionDayAdj <= 120) {
    return {
      status: "good",
      title: "지금 분석하기 좋은 시점 — 일봉 마감 직후",
      detail: `1D 마감 ${sincePositionDayAdj}분 경과. 포지션 매매에 가장 적합.`,
    };
  }
  const minsToNext1D = (24 * 60 - sincePositionDayAdj) % (24 * 60);
  const since4hPos = minutesSinceLastHourCycle(h, m, 4, 1);
  if (since4hPos <= 30) {
    return {
      status: "good",
      title: "4H 마감 직후 — 분석 가능",
      detail: "이상적인 시점은 1D 마감(09:00 KST) 직후이지만, 4H 마감 직후도 무방.",
    };
  }
  void totalMin;
  return {
    status: "wait",
    title: "다음 1D 마감(09:00 KST) 대기 권장",
    detail: `${Math.floor(minsToNext1D / 60)}시간 ${minsToNext1D % 60}분 뒤가 최적.`,
    nextWindow: `${Math.floor(minsToNext1D / 60)}시간 ${minsToNext1D % 60}분 후`,
  };
}

const TIER_BADGE: Record<LiquidityTier, { label: string; cls: string }> = {
  golden: { label: "🌟 골든 타임", cls: "bg-grade-a/15 text-grade-a" },
  active: { label: "활성 세션", cls: "bg-primary/15 text-primary" },
  quiet: { label: "한산 (아시아)", cls: "bg-muted/50 text-muted-foreground" },
  dead: { label: "⚠ 죽은 구간", cls: "bg-grade-d/15 text-grade-d" },
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
          <div className="text-sm font-semibold text-muted-foreground">최적 시점 판정 중…</div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            현재 시각·세션 기준으로 분석하기 좋은 시점인지 확인합니다.
          </p>
        </div>
      </div>
    );
  }

  const liquidity = classifyLiquidity(parts.totalMin);
  const verdict = evaluate(style, parts, liquidity.tier);
  const next = nextPrimeTime(style, parts.totalMin);

  const tone =
    verdict.status === "good"
      ? "border-grade-a/40 bg-grade-a/5"
      : verdict.status === "caution"
        ? "border-grade-c/40 bg-grade-c/5"
        : verdict.status === "wait"
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-grade-d/40 bg-grade-d/5";
  const dotTone =
    verdict.status === "good"
      ? "bg-grade-a"
      : verdict.status === "caution"
        ? "bg-grade-c"
        : verdict.status === "wait"
          ? "bg-amber-500"
          : "bg-grade-d";
  const Icon =
    verdict.status === "good"
      ? CheckCircle2
      : verdict.status === "caution"
        ? Waves
        : verdict.status === "wait"
          ? Clock
          : AlertTriangle;
  const iconColor =
    verdict.status === "good"
      ? "text-grade-a"
      : verdict.status === "caution"
        ? "text-grade-c"
        : verdict.status === "wait"
          ? "text-amber-500"
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
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">다음 적정</div>
            <div className="text-xs font-semibold">{verdict.nextWindow}</div>
          </div>
        ) : null}
      </div>

      {/* 하단: 현재 유동성 등급 + 오늘 다음 추천 분석 시각 */}
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
          다음 추천 분석{" "}
          <span className="font-mono tabular-nums text-foreground">{fmtClock(next.at)} KST</span>
          <span className="text-muted-foreground/70"> · {fmtDuration(next.minsAhead)} 후</span>
        </span>
      </div>
    </div>
  );
}
