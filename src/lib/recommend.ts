import type { TradingStyle } from "@/lib/analysis/style";

// Base risk per trade by style (% of account).
// Reflects professional sizing: tighter stops in short styles allow slightly larger
// %-risk, while swing/position carry more risk per trade to compensate for slower frequency.
const BASE_RISK_PCT: Record<TradingStyle, number> = {
  scalp: 0.3,
  day: 0.75,
  swing: 1.5,
  position: 2.0,
};

// Grade-based risk multiplier — A high-quality setups get full size, lower grades reduced.
// D never goes to 0 (otherwise UI shows blank 0% and user doesn't know why);
// instead it's tiny so the size warns visually while still being a usable number.
const GRADE_FACTOR: Record<"A" | "B" | "C" | "D", number> = {
  A: 1.0,
  B: 0.7,
  C: 0.4,
  D: 0.2,
};

export interface RecommendedTradeParams {
  riskPct: number; // % of account at risk per trade
  leverage: number; // suggested leverage (integer)
  reasoning: string; // 1-line explanation
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
}: {
  style: TradingStyle;
  grade: "A" | "B" | "C" | "D";
  confidence: number;
  stopPct: number;
  userPreferredRiskPct: number;
}): RecommendedTradeParams {
  // 1) Risk %
  const base = BASE_RISK_PCT[style] ?? 1.0;
  const gradeF = GRADE_FACTOR[grade] ?? 0.5;
  const confF = Math.max(0.5, Math.min(1.0, confidence)); // confidence dampening 0.5..1.0
  let riskPct = base * gradeF * confF;
  // Never exceed user's preference (treat as their personal cap)
  if (userPreferredRiskPct > 0) {
    riskPct = Math.min(riskPct, userPreferredRiskPct);
  }
  // Clamp to safety band — minimum 0.1% so we never return 0 (blank UI is confusing).
  riskPct = Math.max(0.1, Math.min(3, Number(riskPct.toFixed(2))));

  // 2) Leverage — keep liquidation distance ≥ ~25% beyond stop distance.
  //    Leverage ≈ 25 / stopPct, with a hard cap by style.
  const styleLevCap: Record<TradingStyle, number> = {
    scalp: 20,
    day: 15,
    swing: 8,
    position: 5,
  };
  const safetyFactor = 25; // 25 stop-distances between entry and liquidation
  let lev = stopPct > 0 ? Math.floor(safetyFactor / stopPct) : 5;
  lev = Math.max(1, Math.min(styleLevCap[style] ?? 10, lev));

  const reasoning = `기본 ${base.toFixed(2)}% × 등급 ${grade}(${(gradeF * 100).toFixed(0)}%) × 신뢰도 ${(confF * 100).toFixed(0)}% = ${riskPct.toFixed(2)}%, 손절폭 ${stopPct.toFixed(2)}%에 청산 안전거리 25배수 → ${lev}배`;

  return { riskPct, leverage: lev, reasoning };
}
