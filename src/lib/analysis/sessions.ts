import type { TradingStyle } from "./style";
import type { TFunction } from "@/lib/i18n/messages";

/**
 * 글로벌 마켓 세션 + 유동성 구간 — 단일 소스.
 * SessionsClock(위젯), AnalysisTimingHint(분석 타이밍), AnalysisTimingGuide(가이드)가 공유한다.
 * 모든 시각은 KST(UTC+9) 기준 분(minute-of-day, 0~1439).
 */

export type LiquidityTier = "golden" | "active" | "quiet" | "dead";

/** 현재 시각을 KST 시/분/분누계/요일로 변환. (PC 타임존과 무관하게 일관 처리) */
export function kstParts(now: Date): { h: number; m: number; totalMin: number; dow: number } {
  const kst = new Date(now.getTime() + 9 * 60 * 60_000);
  const h = kst.getUTCHours();
  const m = kst.getUTCMinutes();
  return { h, m, totalMin: h * 60 + m, dow: kst.getUTCDay() };
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
export function classifyLiquidity(totalMin: number, t: TFunction): LiquidityInfo {
  if (inRange(totalMin, GOLDEN_START, GOLDEN_END)) {
    return {
      tier: "golden",
      label: t("sessions.liq.golden.label"),
      note: t("sessions.liq.golden.note"),
    };
  }
  if (inRange(totalMin, DEAD_START, DEAD_END)) {
    return {
      tier: "dead",
      label: t("sessions.liq.dead.label"),
      note: t("sessions.liq.dead.note"),
    };
  }
  if (inRange(totalMin, ACTIVE_EU_START, GOLDEN_START) || inRange(totalMin, GOLDEN_END, DEAD_START)) {
    return {
      tier: "active",
      label: t("sessions.liq.active.label"),
      note: t("sessions.liq.active.note"),
    };
  }
  return {
    tier: "quiet",
    label: t("sessions.liq.quiet.label"),
    note: t("sessions.liq.quiet.note"),
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
export function entrySuitability(totalMin: number, dow: number, t: TFunction): EntrySuitability {
  if (inFundingWindow(totalMin)) {
    return {
      tier: "avoid",
      label: t("sessions.entry.funding.label"),
      advice: t("sessions.entry.funding.advice"),
    };
  }

  const liq = classifyLiquidity(totalMin, t);
  const weekend = dow === 0 || dow === 6;

  let tier: EntryTier =
    liq.tier === "golden" ? "optimal" : liq.tier === "active" ? "good" : liq.tier === "quiet" ? "caution" : "avoid";

  // 주말은 유동성·갭 위험으로 한 단계 하향 (최소 caution)
  if (weekend && (tier === "optimal" || tier === "good")) tier = "caution";

  const advice: Record<EntryTier, string> = {
    optimal: weekend
      ? t("sessions.entry.optimal.adviceWeekend")
      : t("sessions.entry.optimal.advice"),
    good: t("sessions.entry.good.advice"),
    caution: weekend
      ? t("sessions.entry.caution.adviceWeekend")
      : t("sessions.entry.caution.advice"),
    avoid: t("sessions.entry.avoid.advice"),
  };

  const label: Record<EntryTier, string> = {
    optimal: t("sessions.entry.optimal.label"),
    good: t("sessions.entry.good.label"),
    caution: t("sessions.entry.caution.label"),
    avoid: t("sessions.entry.avoid.label"),
  };

  return { tier, label: label[tier], advice: advice[tier] };
}

/**
 * 다음 '좋은 진입' 구간(활성·골든 = 16:00~05:00 KST) 시작.
 * 현재 그 구간 안이면 now=true.
 */
export function nextGoodEntry(totalMin: number): { now: boolean; at: number; minsAhead: number } {
  const inGood = totalMin >= 16 * 60 || totalMin < 5 * 60; // 16:00 → 05:00(+1d)
  if (inGood) return { now: true, at: totalMin, minsAhead: 0 };
  const at = 16 * 60; // 다음 런던 개장
  return { now: false, at, minsAhead: at - totalMin };
}

/** 스타일별 분석↔진입 결합도. */
export type EntryCoupling = "tight" | "moderate" | "loose" | "none";
export const STYLE_ENTRY_COUPLING: Record<TradingStyle, EntryCoupling> = {
  scalp: "tight", //    분석=진입 거의 동시
  day: "moderate", //   분석 후 같은 세션 진입
  swing: "loose", //    분석=계획, 진입은 따로
  position: "none", //  타이밍 무관, 분산 진입
};

/**
 * 분석을 지금 실행하는 것이 진입과 어떻게 연결되는지 — 스타일별 한 줄 안내.
 * entry = entrySuitability(totalMin, dow) 결과.
 */
export function analysisEntryLink(
  style: TradingStyle,
  totalMin: number,
  entry: EntrySuitability,
  t: TFunction,
): string {
  const coupling = STYLE_ENTRY_COUPLING[style];
  const good = nextGoodEntry(totalMin);
  const actionable = entry.tier === "optimal" || entry.tier === "good";

  if (coupling === "tight") {
    // 스캘핑 — 분석=진입
    if (actionable) return t("sessions.link.tight.actionable", { label: entry.label });
    return good.now
      ? t("sessions.link.tight.now", { label: entry.label })
      : t("sessions.link.tight.later", { clock: fmtClock(good.at) });
  }
  if (coupling === "moderate") {
    // 데이 — 같은 세션 안에서 진입
    if (actionable) return t("sessions.link.moderate.actionable", { label: entry.label });
    return good.now
      ? t("sessions.link.moderate.now", { label: entry.label })
      : t("sessions.link.moderate.later", { clock: fmtClock(good.at) });
  }
  if (coupling === "loose") {
    // 스윙 — 분석은 계획, 진입은 따로
    return good.now
      ? t("sessions.link.loose.now")
      : t("sessions.link.loose.later", { clock: fmtClock(good.at) });
  }
  // 포지션 — 타이밍 무관
  return t("sessions.link.none");
}

// ─── 분석 시간 텔레그램 알림 ──────────────────────────────────────────
// 사용자가 받을 시각을 직접 고른다(복수 선택). 값은 KST 분누계.

export interface AnalysisAlertOption {
  /** KST 분누계 (0~1439) */
  min: number;
  /** "HH:MM" */
  time: string;
  /** 설명 라벨 */
  label: string;
}

/** 알림으로 고를 수 있는 추천 분석 시각 (스타일별 베스트 타이밍). */
export function getAnalysisAlertOptions(t: TFunction): AnalysisAlertOption[] {
  return [
    { min: 9 * 60 + 10, time: "09:10", label: t("sessions.times.dailyClose") },
    { min: 16 * 60, time: "16:00", label: t("sessions.times.londonOpen") },
    { min: 21 * 60, time: "21:00", label: t("sessions.times.h4Close") },
    { min: 21 * 60 + 30, time: "21:30", label: t("sessions.times.usPreOpen") },
    { min: 22 * 60 + 30, time: "22:30", label: t("sessions.times.goldenTime") },
    { min: 5 * 60, time: "05:00", label: t("sessions.times.usPostClose") },
  ];
}

/** 요일 효과 메모. dow = KST 기준 요일(0=일 … 6=토). */
export function dayOfWeekNote(dow: number, t: TFunction): string {
  switch (dow) {
    case 2:
    case 3:
    case 4:
      return t("sessions.dow.midweek");
    case 1:
      return t("sessions.dow.monday");
    case 5:
      return t("sessions.dow.friday");
    default:
      return t("sessions.dow.weekend");
  }
}
