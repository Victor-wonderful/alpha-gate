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

// ─── 진입(트레이딩) 적합도 ────────────────────────────────────────────
// "분석"이 아니라 "실제 진입"하기 좋은 시점인가? 유동성 + 펀딩 + 요일을 종합.

/** 펀딩 정산 ±10분 (Binance 8h: 09 / 17 / 01 KST). */
export function inFundingWindow(totalMin: number): boolean {
  const fundingMins = [1 * 60, 9 * 60, 17 * 60];
  return fundingMins.some((fm) => {
    const diff = Math.min(
      Math.abs(totalMin - fm),
      Math.abs(totalMin - (fm + 24 * 60)),
      Math.abs(totalMin - (fm - 24 * 60)),
    );
    return diff <= 10;
  });
}

export type EntryTier = "optimal" | "good" | "caution" | "avoid";

export interface EntrySuitability {
  tier: EntryTier;
  /** 배지 라벨 */
  label: string;
  /** 한 줄 조언 */
  advice: string;
}

/**
 * 현재 진입 적합도. dow = KST 기준 요일(0=일 … 6=토).
 * 골든 타임 > 활성 세션 > 아시아 한산 > 죽은 구간. 펀딩 ±10분은 잠시 회피.
 * 주말은 유동성 낮아 한 단계 하향.
 */
export function entrySuitability(totalMin: number, dow: number): EntrySuitability {
  if (inFundingWindow(totalMin)) {
    return {
      tier: "avoid",
      label: "펀딩 정산 — 잠시 회피",
      advice: "정산 ±10분은 변동성 노이즈. 10분 뒤가 깔끔합니다.",
    };
  }

  const liq = classifyLiquidity(totalMin);
  const weekend = dow === 0 || dow === 6;

  let tier: EntryTier =
    liq.tier === "golden" ? "optimal" : liq.tier === "active" ? "good" : liq.tier === "quiet" ? "caution" : "avoid";

  // 주말은 유동성·갭 위험으로 한 단계 하향 (최소 caution)
  if (weekend && (tier === "optimal" || tier === "good")) tier = "caution";

  const advice: Record<EntryTier, string> = {
    optimal: weekend
      ? "유동성은 좋지만 주말이라 갭 위험 — 사이즈 줄여서."
      : "런던·뉴욕 겹침 — 추세·유동성 최상. 진입에 가장 좋은 시간.",
    good: "유럽·미국 세션 — 유동성 양호. 추세·돌파 진입에 적합.",
    caution: weekend
      ? "주말 — 유동성 낮고 박스·갭 위험. 신규 진입 신중."
      : "아시아 한산 — 박스 잦고 돌파가 가짜인 경우 많음. 신중히.",
    avoid: "죽은 구간(미국 마감~아시아 개장) — 유동성 최저·휩쏘. 진입 비권장.",
  };

  const label: Record<EntryTier, string> = {
    optimal: "진입 최적",
    good: "진입 양호",
    caution: "진입 신중",
    avoid: "진입 비권장",
  };

  return { tier, label: label[tier], advice: advice[tier] };
}

/** 요일 효과 메모. dow = KST 기준 요일(0=일 … 6=토). */
export function dayOfWeekNote(dow: number): string {
  switch (dow) {
    case 2:
    case 3:
    case 4:
      return "화·수·목 — 추세 가장 안정적, 베스트 트레이딩 요일";
    case 1:
      return "월요일 — 주말 갭 소화로 변동성 큼 (기회이자 위험)";
    case 5:
      return "금요일 — 오후부터 포지션 정리, 신규 스윙은 신중";
    default:
      return "주말 — 유동성 낮음, 일요일 밤 스파이크 주의";
  }
}
