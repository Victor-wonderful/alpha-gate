import type { TradingStyle } from "@/lib/analysis/style";

// Base risk per trade by style (% of account).
// 업계 관행: 데이 트레이더 보통 1%, 스윙 1~2%, 포지션 2%.
const BASE_RISK_PCT: Record<TradingStyle, number> = {
  scalp: 0.3,
  day: 1.0,
  swing: 1.5,
  position: 2.0,
};

// Grade-based risk multiplier — A high-quality setups get full size, lower grades reduced.
// D는 거래 금지 권장 → override 모달 통과 시에만 진입 허용, 그때도 10%로 작게.
const GRADE_FACTOR: Record<"A" | "B" | "C" | "D", number> = {
  A: 1.0,
  B: 0.7,
  C: 0.3,
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
  // 1) Risk %
  const base = BASE_RISK_PCT[style] ?? 1.0;
  const gradeF = GRADE_FACTOR[grade] ?? 0.5;
  // 신뢰도 0~1 → 0.3~1.0 매핑. AI가 "전혀 모르겠다(0)"고 하면 30%까지 줄임.
  const confF = Math.max(0.3, Math.min(1.0, confidence));
  const idealRiskPct = base * gradeF * confF;
  let riskPct = idealRiskPct;
  // Never exceed user's preference (treat as their personal cap)
  if (userPreferredRiskPct > 0) {
    riskPct = Math.min(riskPct, userPreferredRiskPct);
  }
  // 위험 예산 상한 — 오픈+예약 포지션이 이미 쓴 위험을 뺀 "남은 예산" 안으로 축소.
  let budgetLimited = false;
  if (remainingRiskPct != null) {
    if (riskPct > remainingRiskPct) budgetLimited = true;
    riskPct = Math.min(riskPct, Math.max(0, remainingRiskPct));
  }
  // Clamp to safety band. 예산이 바닥이면(≈0) 0.1% floor를 두지 않고 실제 0으로 → "보류" 신호.
  const budgetExhausted = remainingRiskPct != null && remainingRiskPct < 0.1;
  riskPct = budgetExhausted
    ? Number(Math.max(0, riskPct).toFixed(2))
    : Math.max(0.1, Math.min(3, Number(riskPct.toFixed(2))));

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
    ? `기본 ${base.toFixed(2)}% × 등급 ${grade} × 신뢰도 ${(confF * 100).toFixed(0)}% = ${idealRiskPct.toFixed(2)}% 이나, 남은 위험 예산 ${(remainingRiskPct ?? 0).toFixed(2)}%로 축소 → ${riskPct.toFixed(2)}% (레버리지 ${lev}배)`
    : `기본 ${base.toFixed(2)}% × 등급 ${grade}(${(gradeF * 100).toFixed(0)}%) × 신뢰도 ${(confF * 100).toFixed(0)}% = ${riskPct.toFixed(2)}%, 손절폭 ${stopPct.toFixed(2)}%에 청산 안전 8배수 → ${lev}배`;

  return { riskPct, leverage: lev, reasoning, budgetLimited };
}
