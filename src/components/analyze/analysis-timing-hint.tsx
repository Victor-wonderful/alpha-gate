"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TradingStyle } from "@/lib/analysis/style";

/** Returns the current moment expressed as KST date parts (hour/minute/day/etc).
 *  Used to evaluate where we are relative to candle boundaries and funding windows. */
function getKstParts() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60_000);
  return {
    h: kst.getUTCHours(),
    m: kst.getUTCMinutes(),
    s: kst.getUTCSeconds(),
    now,
  };
}

/** Distance to the next time `H:00` candle close on a given hour cycle.
 *  e.g. for 4h cycle, returns minutes until the next 01/05/09/13/17/21 KST hour. */
function minutesToNextHourCycle(h: number, m: number, cycle: number, offset = 0): number {
  // Anchor list: which hours of day count as cycle boundaries?
  // 4h with offset 1 = [1,5,9,13,17,21]; 1h cycle = every hour.
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

type Verdict = {
  status: "good" | "wait" | "avoid";
  title: string;
  detail: string;
  nextWindow?: string;
};

function evaluate(style: TradingStyle, parts: { h: number; m: number }): Verdict {
  const { h, m } = parts;

  // 1) Funding window check (priority highest) — Binance 8h cycle: 09 / 17 / 01 KST
  const fundingHours = [1, 9, 17];
  const fundingAvoid = fundingHours.some((fh) => {
    const diff = Math.min(
      Math.abs(h * 60 + m - fh * 60),
      Math.abs(h * 60 + m - (fh * 60 + 24 * 60)),
      Math.abs(h * 60 + m - (fh * 60 - 24 * 60)),
    );
    return diff <= 10;
  });
  if (fundingAvoid) {
    return {
      status: "avoid",
      title: "펀딩 정산 ±10분 — 분석 회피 권장",
      detail: "정산 직전·직후 변동성이 폭증해 분석 신뢰도가 떨어집니다.",
      nextWindow: "정산 후 10분 뒤 재시도",
    };
  }

  // 2) Style-specific windows
  if (style === "scalp") {
    // 5분 캔들 마감 직후가 가장 좋음. 5분 안쪽이면 good, 그 외 항상 진입 직전 매번 OK.
    const sinceLast5m = m % 5;
    return sinceLast5m <= 2
      ? {
          status: "good",
          title: "지금 분석하기 좋은 시점",
          detail: `5M 캔들 마감 ${sinceLast5m}분 경과. 단기 데이터 안정적.`,
        }
      : {
          status: "wait",
          title: "다음 5M 캔들 마감 대기",
          detail: `${5 - sinceLast5m}분 뒤 더 정확한 결과를 얻을 수 있습니다.`,
          nextWindow: `${5 - sinceLast5m}분 후`,
        };
  }

  if (style === "day") {
    // 1H 캔들 마감 직후 가장 좋음
    if (m <= 15) {
      return {
        status: "good",
        title: "지금 분석하기 좋은 시점",
        detail: `1H 캔들 마감 ${m}분 경과. 안정적.`,
      };
    }
    return {
      status: "wait",
      title: "다음 1H 캔들 마감 대기",
      detail: `${60 - m}분 뒤 분석하면 데이터가 더 안정적입니다.`,
      nextWindow: `${60 - m}분 후`,
    };
  }

  if (style === "swing") {
    // 4H 캔들 마감 (UTC 0/4/8/12/16/20 → KST 9/13/17/21/01/05)
    const fourHourAnchors = [1, 5, 9, 13, 17, 21];
    const sinceLast4h = minutesSinceLastHourCycle(h, m, 4, 1);
    const sinceLast1d = h * 60 + m - 9 * 60; // since today 09:00 KST
    const sinceLast1dAdjusted = sinceLast1d >= 0 ? sinceLast1d : sinceLast1d + 24 * 60;

    if (sinceLast1dAdjusted <= 60) {
      return {
        status: "good",
        title: "지금 분석하기 좋은 시점 — 일봉 마감 직후",
        detail: `1D 캔들 마감 ${sinceLast1dAdjusted}분 경과. 큰 시간대까지 안정적.`,
      };
    }
    if (sinceLast4h <= 30) {
      return {
        status: "good",
        title: "지금 분석하기 좋은 시점",
        detail: `4H 캔들 마감 ${sinceLast4h}분 경과. 데이터 안정적.`,
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

  // position
  const sincePositionDay = h * 60 + m - 9 * 60;
  const sincePositionDayAdj = sincePositionDay >= 0 ? sincePositionDay : sincePositionDay + 24 * 60;
  if (sincePositionDayAdj <= 120) {
    return {
      status: "good",
      title: "지금 분석하기 좋은 시점 — 일봉 마감 직후",
      detail: `1D 캔들 마감 ${sincePositionDayAdj}분 경과. 포지션 매매에 가장 적합.`,
    };
  }
  const minsToNext1D = (24 * 60 - sincePositionDayAdj) % (24 * 60);
  const minsToNext4hPos = minutesSinceLastHourCycle(h, m, 4, 1) <= 30 ? 0 : minutesToNextHourCycle(h, m, 4, 1);
  if (minsToNext4hPos === 0) {
    return {
      status: "good",
      title: "4H 마감 직후 — 분석 가능",
      detail: "이상적인 시점은 1D 마감(09:00 KST) 직후이지만, 4H 마감 직후도 무방.",
    };
  }
  return {
    status: "wait",
    title: "다음 1D 마감(09:00 KST) 대기 권장",
    detail: `${Math.floor(minsToNext1D / 60)}시간 ${minsToNext1D % 60}분 뒤가 최적.`,
    nextWindow: `${Math.floor(minsToNext1D / 60)}시간 ${minsToNext1D % 60}분 후`,
  };
}

export function AnalysisTimingHint({ style }: { style: TradingStyle }) {
  const [parts, setParts] = useState(() => getKstParts());

  useEffect(() => {
    const id = setInterval(() => setParts(getKstParts()), 30_000);
    return () => clearInterval(id);
  }, []);

  const verdict = evaluate(style, parts);

  const tone =
    verdict.status === "good"
      ? "border-grade-a/40 bg-grade-a/5"
      : verdict.status === "wait"
        ? "border-amber-500/40 bg-amber-500/5"
        : "border-grade-d/40 bg-grade-d/5";
  const dotTone =
    verdict.status === "good"
      ? "bg-grade-a"
      : verdict.status === "wait"
        ? "bg-amber-500"
        : "bg-grade-d";
  const Icon =
    verdict.status === "good" ? CheckCircle2 : verdict.status === "wait" ? Clock : AlertTriangle;
  const iconColor =
    verdict.status === "good"
      ? "text-grade-a"
      : verdict.status === "wait"
        ? "text-amber-500"
        : "text-grade-d";

  const timeStr = `${String(parts.h).padStart(2, "0")}:${String(parts.m).padStart(2, "0")} KST`;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3",
        tone,
      )}
    >
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
  );
}
