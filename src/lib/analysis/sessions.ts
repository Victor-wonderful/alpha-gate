import type { TradingStyle } from "./style";

/**
 * 글로벌 마켓 세션 + 유동성 구간 — 단일 소스.
 * SessionsClock(위젯), AnalysisTimingHint(분석 타이밍), AnalysisTimingGuide(가이드)가 공유한다.
 * 모든 시각은 KST(UTC+9) 기준 분(minute-of-day, 0~1439).
 */

export type LiquidityTier = "golden" | "active" | "quiet" | "dead";

/** 현재 시각을 KST 시/분/분누계로 변환. (PC 타임존과 무관하게 일관 처리) */
export function kstParts(now: Date): { h: number; m: number; totalMin: number } {
  const kst = new Date(now.getTime() + 9 * 60 * 60_000);
  const h = kst.getUTCHours();
  const m = kst.getUTCMinutes();
  return { h, m, totalMin: h * 60 + m };
}

/** [a, b) 구간 포함 여부 — 자정을 넘어가는(wrap) 구간도 처리. */
function inRange(totalMin: number, a: number, b: number): boolean {
  return a < b ? totalMin >= a && totalMin < b : totalMin >= a || totalMin < b;
}

export interface LiquidityInfo {
  tier: LiquidityTier;
  /** 짧은 라벨 (배지용) */
  label: string;
  /** 한 줄 설명 */
  note: string;
}

// 유동성 구간 경계 (KST 분누계) — 위젯의 골든/함정 배지와 동일 기준.
const GOLDEN_START = 22 * 60 + 30; // 22:30
const GOLDEN_END = 1 * 60; //        01:00 (다음날)
const DEAD_START = 5 * 60; //        05:00
const DEAD_END = 9 * 60; //          09:00
const ACTIVE_EU_START = 16 * 60; //  16:00 (런던 개장)
// active = 16:00~22:30(유럽~미국 전) + 01:00~05:00(미국 후반)
// quiet  = 09:00~16:00 (아시아)

/** 현재 KST 분누계의 유동성 등급을 판정. */
export function classifyLiquidity(totalMin: number): LiquidityInfo {
  if (inRange(totalMin, GOLDEN_START, GOLDEN_END)) {
    return {
      tier: "golden",
      label: "골든 타임",
      note: "런던·뉴욕 겹침 — 최고 유동성·추세 발생. 분석 신뢰도 최상.",
    };
  }
  if (inRange(totalMin, DEAD_START, DEAD_END)) {
    return {
      tier: "dead",
      label: "죽은 구간",
      note: "미국 마감~아시아 개장 — 유동성 최저·휩쏘 빈발. 단기 매매 비권장.",
    };
  }
  if (inRange(totalMin, ACTIVE_EU_START, GOLDEN_START) || inRange(totalMin, GOLDEN_END, DEAD_START)) {
    return {
      tier: "active",
      label: "활성 세션",
      note: "유럽·미국 세션 — 유동성 양호. 추세·돌파 분석에 적합.",
    };
  }
  return {
    tier: "quiet",
    label: "한산 세션",
    note: "아시아 세션 — 변동성 낮고 박스 잦음. 단기 신호 신뢰도 보통.",
  };
}

/**
 * 스타일별 "추천 분석 시각" (KST 분누계).
 * 캔들 마감 + 유동성을 종합한 하루 중 베스트 타이밍.
 * - 스캘핑: 런던 개장(16:00) · 골든 타임 시작(22:30)
 * - 데이: 미국 개장 전 포지셔닝(21:30) · 미국 마감 후 복기(05:00)
 * - 스윙: 일봉 마감 직후(09:10, 펀딩 노이즈 회피) · 4H 마감+뉴욕 전(21:00)
 * - 포지션: 일봉 마감 직후(09:10). 주봉은 월요일 09:10(별도 안내).
 */
export const STYLE_PRIME_TIMES_KST: Record<TradingStyle, number[]> = {
  scalp: [16 * 60, 22 * 60 + 30],
  day: [21 * 60 + 30, 5 * 60],
  swing: [9 * 60 + 10, 21 * 60],
  position: [9 * 60 + 10],
};

/** 다음 추천 분석 시각과 남은 분 (오늘 남은 게 없으면 내일 첫 타임). */
export function nextPrimeTime(
  style: TradingStyle,
  totalMin: number,
): { at: number; minsAhead: number } {
  const times = [...STYLE_PRIME_TIMES_KST[style]].sort((a, b) => a - b);
  for (const t of times) {
    if (t > totalMin) return { at: t, minsAhead: t - totalMin };
  }
  return { at: times[0], minsAhead: 24 * 60 - totalMin + times[0] };
}

/** 분누계 → "HH:MM" (KST). */
export function fmtClock(totalMin: number): string {
  const t = ((totalMin % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 남은 분 → "X시간 Y분" / "Y분". */
export function fmtDuration(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}
