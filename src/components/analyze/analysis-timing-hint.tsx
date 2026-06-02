"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Clock, Circle, Target } from "lucide-react";
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

// 분석 적합도 4단계. optimal/good/fair 는 모두 "지금 분석 가능"이지만 품질이 다르다.
// avoid 는 펀딩 정산 ±10분 같은 노이즈 구간(잠시 회피).
type Status = "optimal" | "good" | "fair" | "avoid";

type Verdict = {
  status: Status;
  /** 레벨 옆 짧은 사유 */
  headline: string;
  detail: string;
  /** 우측 미니 (더 정확해지는 시점 / 재시도) */
  nextWindow?: string;
  nextLabel?: string;
};

const LEVEL_NAME: Record<Status, string> = {
  optimal: "최적",
  good: "양호",
  fair: "보통",
  avoid: "회피",
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
  const liqGood = tier === "golden" || tier === "active";

  // 0) 회피 — 펀딩 정산 ±10분 (변동성 노이즈)
  if (inFundingWindow(h, m)) {
    return {
      status: "avoid",
      headline: "펀딩 정산 ±10분",
      detail: "정산 직전·직후 변동성이 폭증해 결과가 흔들립니다. 10분 뒤가 깔끔합니다.",
      nextWindow: "10분 후",
      nextLabel: "재시도",
    };
  }

  // ── 스캘핑: 캔들 신선도 + 유동성 둘 다 비중 ──
  if (style === "scalp") {
    const since5 = m % 5;
    const fresh = since5 <= 2;
    if (fresh && liqGood) {
      return {
        status: "optimal",
        headline: tier === "golden" ? "골든 타임 · 5M 마감 직후" : "5M 마감 직후 · 유동성 양호",
        detail: `5M 마감 ${since5}분 경과 · 단기 데이터 안정적.`,
      };
    }
    if (fresh) {
      // 신선하나 유동성 약함
      return {
        status: tier === "dead" ? "fair" : "good",
        headline: tier === "dead" ? "5M 마감 직후 · 유동성 낮음" : "5M 마감 직후 · 아시아 한산",
        detail:
          tier === "dead"
            ? `5M 마감 ${since5}분 경과. 체결 얇음 — 목표 좁게, 16:00 이후 더 안정적.`
            : `5M 마감 ${since5}분 경과. 박스 잦으니 목표는 좁게.`,
      };
    }
    // 미마감
    return {
      status: liqGood ? "good" : "fair",
      headline: liqGood ? "유동성 양호 · 캔들 형성 중" : "분석 가능 · 캔들 형성 중",
      detail: `지금 분석해도 무방. ${5 - since5}분 뒤 5M 마감 시 더 정확.`,
      nextWindow: `${5 - since5}분 후`,
      nextLabel: "더 정확",
    };
  }

  // ── 데이: 1H 마감 우선, 유동성 보조 ──
  if (style === "day") {
    const fresh = m <= 15;
    if (fresh && liqGood) {
      return {
        status: "optimal",
        headline: "1H 마감 직후 · 유동성 양호",
        detail: `1H 마감 ${m}분 경과 · 안정적.`,
      };
    }
    if (fresh) {
      return {
        status: "good",
        headline: tier === "dead" ? "1H 마감 직후 · 한산" : "1H 마감 직후",
        detail:
          tier === "dead"
            ? `1H 마감 ${m}분 경과. 미국 마감 후 복기엔 적합, 신규 진입은 유동성 확인.`
            : `1H 마감 ${m}분 경과 · 안정적.`,
      };
    }
    return {
      status: liqGood ? "good" : "fair",
      headline: liqGood ? "유동성 양호 · 캔들 형성 중" : "분석 가능 · 캔들 형성 중",
      detail: `지금 분석해도 무방. ${60 - m}분 뒤 1H 마감 시 더 정확.`,
      nextWindow: `${60 - m}분 후`,
      nextLabel: "더 정확",
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
        headline: "일봉 마감 직후 — 스윙 최적",
        detail: `1D 마감 ${since1dAdj}분 경과. 큰 시간대까지 안정적.`,
      };
    }
    if (since4h <= 30) {
      return {
        status: "optimal",
        headline: "4H 마감 직후",
        detail: `4H 마감 ${since4h}분 경과. 데이터 안정적.`,
      };
    }
    if (since4h <= 120) {
      return {
        status: "good",
        headline: "4H 마감 후 구간 · 구조 유효",
        detail: `4H 마감 ${since4h}분 경과. 구조는 아직 유효합니다.`,
      };
    }
    const toNext4h = minutesToNextHourCycle(h, m, 4, 1);
    return {
      status: "fair",
      headline: "분석 가능 · 4H 마감 대기 구간",
      detail: `지금 분석해도 무방. ${Math.floor(toNext4h / 60)}시간 ${toNext4h % 60}분 뒤 4H 마감 시 더 정확.`,
      nextWindow: `${Math.floor(toNext4h / 60)}시간 ${toNext4h % 60}분 후`,
      nextLabel: "더 정확",
    };
  }

  // ── 포지션: 1D 마감 기준 ──
  const since1d = h * 60 + m - 9 * 60;
  const since1dAdj = since1d >= 0 ? since1d : since1d + 24 * 60;
  if (since1dAdj <= 120) {
    return {
      status: "optimal",
      headline: "일봉 마감 직후 — 포지션 최적",
      detail: `1D 마감 ${since1dAdj}분 경과. 포지션 매매에 가장 적합.`,
    };
  }
  if (minutesSinceLastHourCycle(h, m, 4, 1) <= 30) {
    return {
      status: "good",
      headline: "4H 마감 직후",
      detail: "이상적인 시점은 1D 마감(09:00 KST) 직후이지만, 4H 마감 직후도 무방.",
    };
  }
  const toNext1D = (24 * 60 - since1dAdj) % (24 * 60);
  return {
    status: "fair",
    headline: "분석 가능 · 1D 마감 대기 구간",
    detail: "지금 분석해도 무방. 가장 정확한 시점은 다음 1D 마감(09:00 KST).",
    nextWindow: `${Math.floor(toNext1D / 60)}시간 ${toNext1D % 60}분 후`,
    nextLabel: "최적",
  };
}

const TIER_BADGE: Record<LiquidityTier, { label: string; cls: string }> = {
  golden: { label: "🌟 골든 타임", cls: "bg-grade-a/15 text-grade-a" },
  active: { label: "활성 세션", cls: "bg-primary/15 text-primary" },
  quiet: { label: "한산 (아시아)", cls: "bg-muted/50 text-muted-foreground" },
  dead: { label: "유동성 낮음", cls: "bg-muted/50 text-muted-foreground" },
};

const STATUS_STYLE: Record<
  Status,
  { box: string; dot: string; text: string; icon: typeof CheckCircle2 }
> = {
  optimal: { box: "border-grade-a/40 bg-grade-a/5", dot: "bg-grade-a", text: "text-grade-a", icon: CheckCircle2 },
  good: { box: "border-primary/30 bg-primary/[0.04]", dot: "bg-primary", text: "text-primary", icon: CheckCircle2 },
  fair: { box: "border-border bg-card/40", dot: "bg-muted-foreground", text: "text-muted-foreground", icon: Circle },
  avoid: { box: "border-grade-d/40 bg-grade-d/5", dot: "bg-grade-d", text: "text-grade-d", icon: AlertTriangle },
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
          <div className="text-sm font-semibold text-muted-foreground">분석 적합도 판정 중…</div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            현재 시각·세션 기준으로 분석 적합도를 평가합니다.
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

  const s = STATUS_STYLE[verdict.status];
  const Icon = s.icon;
  const timeStr = `${String(parts.h).padStart(2, "0")}:${String(parts.m).padStart(2, "0")} KST`;
  const tierBadge = TIER_BADGE[liquidity.tier];

  return (
    <div className={cn("rounded-lg border", s.box)}>
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex flex-none items-center gap-1.5 pt-0.5">
          <span className={cn("h-1.5 w-1.5 animate-pulse rounded-full", s.dot)} />
          <Icon className={cn("h-4 w-4", s.text)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">분석 적합도</span>
            <span className={cn("text-sm font-bold", s.text)}>{LEVEL_NAME[verdict.status]}</span>
            <span className="text-xs text-muted-foreground">· {verdict.headline}</span>
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
