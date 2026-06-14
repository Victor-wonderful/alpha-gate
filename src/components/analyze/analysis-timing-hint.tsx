"use client";

import { useEffect, useState } from "react";
import { AlarmClock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
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

const STYLE_LABEL: Record<TradingStyle, string> = {
  scalp: "스캘핑",
  day: "데이",
  swing: "스윙",
  position: "포지션",
};

const LEVEL_NAME: Record<Status, string> = {
  optimal: "최적",
  good: "양호",
  fair: "보통",
  avoid: "회피",
};

/** "N분 경과" / "직후" — 막 마감했으면 직후. */
function elapsed(unit: string, mins: number): string {
  return mins <= 0 ? `${unit} 마감 직후` : `${unit} 마감 ${mins}분 경과`;
}
/** "N분 전" / "X시간 Y분 전" — 다음 마감까지. */
function until(unit: string, mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const dur = h === 0 ? `${m}분` : m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
  return `${unit} 마감 ${dur} 전`;
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
  style: TradingStyle,
  parts: { h: number; m: number; totalMin: number },
  tier: LiquidityTier,
): Verdict {
  const { h, m } = parts;
  const liqGood = tier === "golden" || tier === "active";

  // 0) 회피 — 펀딩 정산 ±10분 (변동성 노이즈)
  if (inFundingWindow(h, m)) {
    return {
      status: "avoid",
      candle: "펀딩 정산 ±10분",
      detail: "정산 직전·직후 변동성이 폭증해 결과가 흔들립니다. 10분 뒤가 깔끔합니다.",
    };
  }

  // ── 스캘핑: 캔들 신선도 + 유동성 둘 다 비중 ──
  if (style === "scalp") {
    const since5 = m % 5;
    const fresh = since5 <= 2;
    if (fresh && liqGood) {
      return {
        status: "optimal",
        candle: elapsed("5M", since5),
        detail: `5M 마감 ${since5}분 경과 · 단기 데이터 안정적.`,
      };
    }
    if (fresh) {
      return {
        status: tier === "dead" ? "fair" : "good",
        candle: elapsed("5M", since5),
        detail:
          tier === "dead"
            ? `5M 마감 ${since5}분 경과. 체결 얇음 — 목표 좁게, 16:00 이후 더 안정적.`
            : `5M 마감 ${since5}분 경과. 박스 잦으니 목표는 좁게.`,
      };
    }
    return {
      status: liqGood ? "good" : "fair",
      candle: until("5M", 5 - since5),
      detail: `지금 분석해도 무방. ${5 - since5}분 뒤 5M 마감 시 더 정확.`,
    };
  }

  // ── 데이: 1H 마감 우선, 유동성 보조 ──
  if (style === "day") {
    const fresh = m <= 15;
    if (fresh && liqGood) {
      return {
        status: "optimal",
        candle: elapsed("1H", m),
        detail: `1H 마감 ${m}분 경과 · 안정적.`,
      };
    }
    if (fresh) {
      return {
        status: "good",
        candle: elapsed("1H", m),
        detail:
          tier === "dead"
            ? `1H 마감 ${m}분 경과. 미국 마감 후 복기엔 적합, 신규 진입은 유동성 확인.`
            : `1H 마감 ${m}분 경과 · 안정적.`,
      };
    }
    return {
      status: liqGood ? "good" : "fair",
      candle: until("1H", 60 - m),
      detail: `지금 분석해도 무방. ${60 - m}분 뒤 1H 마감 시 더 정확.`,
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
        candle: elapsed("일봉", since1dAdj),
        detail: `1D 마감 ${since1dAdj}분 경과. 큰 시간대까지 안정적.`,
      };
    }
    if (since4h <= 30) {
      return {
        status: "optimal",
        candle: elapsed("4H", since4h),
        detail: `4H 마감 ${since4h}분 경과. 데이터 안정적.`,
      };
    }
    if (since4h <= 120) {
      return {
        status: "good",
        candle: elapsed("4H", since4h),
        detail: `4H 마감 ${since4h}분 경과. 구조는 아직 유효합니다.`,
      };
    }
    const toNext4h = minutesToNextHourCycle(h, m, 4, 1);
    return {
      status: "fair",
      candle: until("4H", toNext4h),
      detail: `지금 분석해도 무방. ${Math.floor(toNext4h / 60)}시간 ${toNext4h % 60}분 뒤 4H 마감 시 더 정확.`,
    };
  }

  // ── 포지션: 1D 마감 기준 ──
  const since1d = h * 60 + m - 9 * 60;
  const since1dAdj = since1d >= 0 ? since1d : since1d + 24 * 60;
  if (since1dAdj <= 120) {
    return {
      status: "optimal",
      candle: elapsed("일봉", since1dAdj),
      detail: `1D 마감 ${since1dAdj}분 경과. 포지션 매매에 가장 적합.`,
    };
  }
  const since4hPos = minutesSinceLastHourCycle(h, m, 4, 1);
  if (since4hPos <= 30) {
    return {
      status: "good",
      candle: elapsed("4H", since4hPos),
      detail: "이상적인 시점은 1D 마감(09:00 KST) 직후이지만, 4H 마감 직후도 무방.",
    };
  }
  const toNext1D = (24 * 60 - since1dAdj) % (24 * 60);
  return {
    status: "fair",
    candle: until("일봉", toNext1D),
    detail: "지금 분석해도 무방. 가장 정확한 시점은 다음 1D 마감(09:00 KST).",
  };
}

const STATUS_STYLE: Record<Status, { pill: string; text: string; icon: typeof AlarmClock }> = {
  optimal: { pill: "bg-grade-a/10", text: "text-grade-a", icon: AlarmClock },
  good: { pill: "bg-primary/10", text: "text-primary", icon: AlarmClock },
  fair: { pill: "bg-muted/40", text: "text-muted-foreground", icon: AlarmClock },
  avoid: { pill: "bg-grade-d/10", text: "text-grade-d", icon: AlertTriangle },
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
        className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground"
      >
        <AlarmClock className="h-4 w-4 flex-none" />
        분석 적합도 판정 중…
      </div>
    );
  }

  const liquidity = classifyLiquidity(parts.totalMin);
  const verdict = evaluate(style, parts, liquidity.tier);
  const s = STATUS_STYLE[verdict.status];
  const Icon = s.icon;
  const styleLabel = STYLE_LABEL[style];

  return (
    <div
      title={verdict.detail}
      className={cn("flex items-center gap-2 rounded-md px-3 py-2.5 text-sm", s.pill, s.text)}
    >
      <Icon className="h-4 w-4 flex-none" />
      <span className="min-w-0 leading-snug">
        지금은 <span className="font-semibold">{styleLabel}</span> 분석{" "}
        <span className="font-bold">{LEVEL_NAME[verdict.status]}</span>
        <span className="opacity-80">
          {" "}
          — {liquidity.label} · {verdict.candle}
        </span>
      </span>
    </div>
  );
}
