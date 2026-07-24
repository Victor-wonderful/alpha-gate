/**
 * 스타일×전략 허용 테이블 — 코드 결정론 게이트.
 *
 * 기존엔 "session_open_drive는 scalp/day만" 같은 제약이 strategy.ts/synthesize.ts의
 * **프롬프트 문장으로만** 존재해 LLM이 가끔 어겼다. Stock-Alpha의 styles 분기
 * (셋업별 허용 스타일 제한)를 본떠, 이 제약을 코드 테이블로 박아 위반을 차단한다.
 *
 * 순수 함수 + 타입 import만 → strategy.ts와 순환참조 없음.
 */
import type { TradingStyle } from "./style";
import type { StrategyId } from "./strategy";

/**
 * 전략별 허용 스타일.
 * - 핵심 4전략(trend_pullback/breakout/range_fade/reversal) + wait: 전 스타일 허용.
 * - 특수 전략 3종은 보유기간(horizon) 제약이 명확 → 제한:
 *   · session_open_drive: 미국 개장 인트라데이 전용 (프롬프트 명시: swing/position 무효)
 *   · funding_squeeze: 펀딩 정산 기준 시간 한도 12~24h → 단기 스타일만
 *   · liquidity_grab: 매우 좁은 sweep 손절(ATR×0.3~0.5) → 포지션 스케일 부적합
 */
export const STRATEGY_STYLE_ELIGIBILITY: Record<StrategyId, TradingStyle[]> = {
  trend_pullback: ["scalp", "day", "swing", "position"],
  // structure_reversal: 스윙 CHoCH 되돌림. 백테스트 검증 TF만(1h·4h). scalp 15m 전멸, position 미검증.
  structure_reversal: ["day", "swing"],
  breakout: ["scalp", "day", "swing", "position"],
  range_fade: ["scalp", "day", "swing", "position"],
  reversal: ["scalp", "day", "swing", "position"],
  liquidity_grab: ["scalp", "day", "swing"],
  funding_squeeze: ["scalp", "day"],
  session_open_drive: ["scalp", "day"],
  wait: ["scalp", "day", "swing", "position"],
};

export function isStrategyEligible(strategy: StrategyId, style: TradingStyle): boolean {
  return STRATEGY_STYLE_ELIGIBILITY[strategy]?.includes(style) ?? true;
}

/**
 * 레짐(추세 분류)별 기본 전략 — 부적합 전략을 대체할 때 사용.
 * strategy.ts 프롬프트의 "강제 플레이북"과 동일한 매핑.
 *
 * mixed/미상은 wait가 아니라 range_fade로 둔다(2026-06-28):
 *  - wait면 시나리오가 하드 0개 → 부적합 특수전략을 고른 혼조장에서 분석이 통째로 비고,
 *    "BTCUSDT는 항상 1개 이상" 규칙도 깨진다.
 *  - range_fade면 synthesize가 시도하고, 셋업이 부실하면 enforceEntryProximity가
 *    "필터됨"으로 정직하게 거른다(하드 wait보다 정보량↑). BTC 예외도 보존.
 */
export function regimeDefaultStrategy(
  classification: "up" | "down" | "range" | "mixed" | undefined,
): { primary: StrategyId; direction: "long" | "short" | null } {
  switch (classification) {
    case "up":
      return { primary: "trend_pullback", direction: "long" };
    case "down":
      return { primary: "trend_pullback", direction: "short" };
    default:
      // range + mixed + 미상 → breakout (박스 돌파=새 추세. 백테스트: 페이드는 손실, 돌파는 +).
      // 항상 거래 셋업을 내기 위해 wait이 아닌 breakout으로.
      return { primary: "breakout", direction: null };
  }
}

// ─────────────────────────────────────────────────────────────
// 레짐/신호 라우팅 — 시나리오를 줄이지 않는 안전 게이트
//
// 프롬프트에만 있던 두 규칙을 코드로 강제한다. 둘 다 시나리오를 깎지 않는다:
//  ① 신호 없는 특수전략 차단 — sweep 없는데 liquidity_grab 등(프롬프트 금지) →
//     레짐 기본으로 교체(여전히 시나리오 생성, 단지 올바른 전략으로).
//  ② 헛된 wait 차단 — 추세/횡보가 명확(또는 BTC 기준자산)한데 wait → 레짐 기본으로
//     교체(시나리오 증가). mixed·비BTC의 정당한 wait는 보존.
// ─────────────────────────────────────────────────────────────

/** 특수 전략별 필수 신호 (snapshot에 해당 신호가 있어야 선택 정당). */
export interface SignalPresence {
  liquiditySweep: boolean;
  fundingSqueeze: boolean;
  sessionOpenDrive: boolean;
}

export const STRATEGY_REQUIRED_SIGNAL: Partial<Record<StrategyId, keyof SignalPresence>> = {
  liquidity_grab: "liquiditySweep",
  funding_squeeze: "fundingSqueeze",
  session_open_drive: "sessionOpenDrive",
};

export interface RouteDecision {
  primary: StrategyId;
  direction: "long" | "short" | null;
  changed: boolean;
  reasonCode?: "missing_signal" | "spurious_wait";
  /** missing_signal이면 부재 신호 키, spurious_wait이면 레짐 문자열. */
  detail?: string;
  /** 교체 전 원래 전략. */
  original?: StrategyId;
}

export function routeStrategy(
  primary: StrategyId,
  direction: "long" | "short" | null,
  classification: "up" | "down" | "range" | "mixed" | undefined,
  signals: SignalPresence,
  alwaysAnalyze: boolean,
): RouteDecision {
  // ① 신호 없는 특수전략 → 레짐 기본
  const req = STRATEGY_REQUIRED_SIGNAL[primary];
  if (req && !signals[req]) {
    const fb = regimeDefaultStrategy(classification);
    return { ...fb, changed: true, reasonCode: "missing_signal", detail: req, original: primary };
  }
  // ② 헛된 wait → 레짐 기본 (추세/횡보 명확 또는 기준자산)
  const regimeDecisive = classification === "up" || classification === "down" || classification === "range";
  if (primary === "wait" && (regimeDecisive || alwaysAnalyze)) {
    const fb = regimeDefaultStrategy(classification);
    if (fb.primary !== "wait") {
      return { ...fb, changed: true, reasonCode: "spurious_wait", detail: classification ?? "unknown", original: "wait" };
    }
  }
  return { primary, direction, changed: false };
}
