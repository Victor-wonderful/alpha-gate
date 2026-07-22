import type { TradingStyle } from "@/lib/analysis/style";

// 거래당 리스크 상한 (계좌 대비 %). Victor 결정: 어떤 셋업도 한 판에 계좌의 1% 넘게 안 건다.
const MAX_RISK_PCT = 1.0;

// 등급 배수 — 좋은 셋업엔 상한까지, 애매할수록 작게. (Victor 결정: A1.0 / B0.5 / C0.25 / D0.1)
// 거래당 리스크 = min(사용자·강도 설정, 1%) × 이 배수. 등급이 셋업 품질을 이미 반영하므로
// 스타일 base·신뢰도는 리스크에 곱하지 않는다(등급 하나로 스케일).
const GRADE_FACTOR: Record<"A" | "B" | "C" | "D", number> = {
  A: 1.0,
  B: 0.5,
  C: 0.25,
  D: 0.1,
};

export interface RecommendedTradeParams {
  riskPct: number; // % of account at risk per trade
  leverage: number; // suggested leverage (integer)
  reasoning: string; // 1-line explanation
  budgetLimited?: boolean; // 남은 위험 예산에 의해 축소됐는지
}

/**
 * Compute a single coherent set of order parameters for a given scenario.
 *
 * Inputs:
 *  - style: trading style (drives base risk and stop-vs-leverage geometry)
 *  - grade: scenario grade A/B/C/D (scales down risk for lower-quality setups)
 *  - confidence: strategy confidence 0..1 (LLM-reported)
 *  - stopPct: |entry - stop| / entry × 100 — needed for leverage safety bound
 *  - userPreferredRiskPct: user's default risk % (used as upper cap)
 */
export function recommendTradeParams({
  style,
  grade,
  confidence,
  stopPct,
  userPreferredRiskPct,
  remainingRiskPct,
}: {
  style: TradingStyle;
  grade: "A" | "B" | "C" | "D";
  confidence: number;
  stopPct: number;
  userPreferredRiskPct: number;
  /** 남은 위험 예산(계좌 대비 %). 주어지면 이 안으로 상한. 오픈·예약 포지션 차감 후 남은 양. */
  remainingRiskPct?: number;
}): RecommendedTradeParams {
  // 1) Risk % — 거래당 상한(≤1%) 안에서 등급으로 스케일. 사용자/강도 설정을 상한으로 쓰되
  //    1%를 넘지 못하게 하드 캡. (신뢰도·스타일 base는 리스크에 안 곱함 — 등급 하나로 결정)
  const gradeF = GRADE_FACTOR[grade] ?? 0.25;
  const cap = Math.min(userPreferredRiskPct > 0 ? userPreferredRiskPct : MAX_RISK_PCT, MAX_RISK_PCT);
  const idealRiskPct = cap * gradeF;
  let riskPct = idealRiskPct;
  // 위험 예산 상한 — 오픈+예약 포지션이 이미 쓴 위험을 뺀 "남은 예산" 안으로 축소.
  let budgetLimited = false;
  if (remainingRiskPct != null) {
    if (riskPct > remainingRiskPct) budgetLimited = true;
    riskPct = Math.min(riskPct, Math.max(0, remainingRiskPct));
  }
  // Clamp. 예산이 바닥이면(≈0) 0.1% floor 없이 실제 0으로 → "보류" 신호.
  const budgetExhausted = remainingRiskPct != null && remainingRiskPct < 0.1;
  riskPct = budgetExhausted
    ? Number(Math.max(0, riskPct).toFixed(2))
    : Math.max(0.1, Math.min(MAX_RISK_PCT, Number(riskPct.toFixed(2))));

  // 2) Leverage — 청산 가격이 손절 가격보다 8배수 이상 떨어진 곳에 오도록.
  //    레버리지 L에서 청산 ≈ 100/L% 적자.
  //    목표: 청산% ≈ 8 × stopPct → L ≈ 100 / (8 × stopPct) = 12.5 / stopPct
  //    이전에 25/stopPct(실제 4×버퍼)는 빠른 시장에서 부족 → 12로 낮춰 8× 버퍼.
  const styleLevCap: Record<TradingStyle, number> = {
    scalp: 20,
    day: 15,
    swing: 8,
    position: 5,
  };
  const safetyFactor = 12; // 청산까지 ≈ 8× stop 거리 확보
  let lev = stopPct > 0 ? Math.floor(safetyFactor / stopPct) : 5;
  lev = Math.max(1, Math.min(styleLevCap[style] ?? 10, lev));

  const reasoning = budgetLimited
    ? `상한 ${cap.toFixed(2)}% × 등급 ${grade}(${(gradeF * 100).toFixed(0)}%) = ${idealRiskPct.toFixed(2)}% 이나, 남은 위험 예산 ${(remainingRiskPct ?? 0).toFixed(2)}%로 축소 → ${riskPct.toFixed(2)}% (레버리지 ${lev}배)`
    : `상한 ${cap.toFixed(2)}% × 등급 ${grade}(${(gradeF * 100).toFixed(0)}%) = ${riskPct.toFixed(2)}%, 손절폭 ${stopPct.toFixed(2)}%에 청산 안전 8배수 → ${lev}배`;

  return { riskPct, leverage: lev, reasoning, budgetLimited };
}
