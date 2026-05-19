// Trend strength indicators — established formulas with published thresholds.
//   • ADX (J. Welles Wilder, "New Concepts in Technical Trading Systems", 1978)
//   • KER — Kaufman Efficiency Ratio (Perry Kaufman, "Smarter Trading", 1995)
//   • Choppiness Index (Bill Dreiss)
//
// Used to classify market state (trending vs ranging) on a per-style basis.

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime: number;
}

/**
 * ADX (Average Directional Index), Wilder 1978.
 * Returns +DI, -DI, ADX. Standard period = 14.
 * Thresholds (industry standard):
 *   ADX > 25 → strong trend
 *   ADX 20-25 → developing
 *   ADX < 20 → no trend (range)
 * Direction from sign of (+DI − -DI).
 */
export function computeADX(
  candles: Candle[],
  period = 14,
): { adx: number; plusDI: number; minusDI: number } | null {
  if (candles.length < period * 2 + 1) return null;
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
    const upMove = c.high - p.high;
    const downMove = p.low - c.low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  // Wilder smoothing
  const wilder = (arr: number[]): number[] => {
    const out: number[] = [];
    let sum = arr.slice(0, period).reduce((s, v) => s + v, 0);
    out[period - 1] = sum;
    for (let i = period; i < arr.length; i++) {
      sum = sum - sum / period + arr[i];
      out[i] = sum;
    }
    return out;
  };
  const trS = wilder(tr);
  const pdmS = wilder(plusDM);
  const mdmS = wilder(minusDM);

  const dx: number[] = [];
  for (let i = period - 1; i < tr.length; i++) {
    const trv = trS[i];
    if (!trv || trv === 0) {
      dx.push(0);
      continue;
    }
    const pdi = (100 * pdmS[i]) / trv;
    const mdi = (100 * mdmS[i]) / trv;
    const denom = pdi + mdi;
    dx.push(denom === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / denom);
  }
  if (dx.length < period) return null;
  // ADX is Wilder-smoothed DX
  let adx = dx.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < dx.length; i++) {
    adx = (adx * (period - 1) + dx[i]) / period;
  }
  const lastTr = trS[trS.length - 1];
  const plusDI = lastTr > 0 ? (100 * pdmS[pdmS.length - 1]) / lastTr : 0;
  const minusDI = lastTr > 0 ? (100 * mdmS[mdmS.length - 1]) / lastTr : 0;
  return { adx, plusDI, minusDI };
}

/**
 * Kaufman Efficiency Ratio (Kaufman 1995).
 *   ER = |close[t] − close[t−N]| / Σ |close[i] − close[i−1]|, over last N bars.
 * Range 0..1. Higher = more directional (trending).
 * Period 10 typical.
 *   > 0.6 trending, 0.3–0.6 mixed, < 0.3 noise/range.
 */
export function computeKER(candles: Candle[], period = 10): number | null {
  if (candles.length < period + 1) return null;
  const slice = candles.slice(-(period + 1));
  const direction = Math.abs(slice[slice.length - 1].close - slice[0].close);
  let volatility = 0;
  for (let i = 1; i < slice.length; i++) volatility += Math.abs(slice[i].close - slice[i - 1].close);
  if (volatility === 0) return null;
  return direction / volatility;
}

/**
 * Choppiness Index (Bill Dreiss).
 *   CI = 100 · log10( Σ TR(n) / (max(high, n) − min(low, n)) ) / log10(n)
 * Range 0..100. HIGHER = MORE choppy (ranging).
 *   > 61.8 → very choppy / range
 *   < 38.2 → strong trend
 *   38.2–61.8 → mixed
 */
export function computeChoppiness(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const slice = candles.slice(-(period + 1));
  let sumTR = 0;
  for (let i = 1; i < slice.length; i++) {
    const c = slice[i];
    const p = slice[i - 1];
    sumTR += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  const bars = slice.slice(1);
  const hiMax = Math.max(...bars.map((c) => c.high));
  const loMin = Math.min(...bars.map((c) => c.low));
  const range = hiMax - loMin;
  if (range <= 0) return null;
  return (100 * Math.log10(sumTR / range)) / Math.log10(period);
}

export interface TrendVerdict {
  adx: { value: number; verdict: "trend" | "developing" | "range"; plusDI: number; minusDI: number } | null;
  ker: { value: number; verdict: "trend" | "mixed" | "range" } | null;
  choppiness: { value: number; verdict: "trend" | "mixed" | "range" } | null;
  /** Final composite — majority vote (≥2 of 3 agree on trend/range; else mixed) */
  composite: {
    classification: "up" | "down" | "range" | "mixed";
    strength: "strong" | "moderate" | "weak";
    /** How many of the 3 indicators voted for "trend" */
    trendVotes: number;
    /** How many voted "range" */
    rangeVotes: number;
  };
}

/**
 * Run all three indicators and compose a final verdict.
 * Direction is taken from ADX's +DI vs -DI when classified as trending.
 */
export function classifyTrendComposite(candles: Candle[]): TrendVerdict {
  const adxR = computeADX(candles, 14);
  const kerR = computeKER(candles, 10);
  const chR = computeChoppiness(candles, 14);

  const adx = adxR
    ? {
        value: adxR.adx,
        plusDI: adxR.plusDI,
        minusDI: adxR.minusDI,
        verdict: (adxR.adx >= 25 ? "trend" : adxR.adx < 20 ? "range" : "developing") as
          | "trend"
          | "developing"
          | "range",
      }
    : null;
  const ker = kerR != null
    ? {
        value: kerR,
        verdict: (kerR >= 0.6 ? "trend" : kerR < 0.3 ? "range" : "mixed") as "trend" | "mixed" | "range",
      }
    : null;
  const choppiness = chR != null
    ? {
        value: chR,
        verdict: (chR > 61.8 ? "range" : chR < 38.2 ? "trend" : "mixed") as "trend" | "mixed" | "range",
      }
    : null;

  let trendVotes = 0;
  let rangeVotes = 0;
  if (adx) {
    if (adx.verdict === "trend") trendVotes++;
    else if (adx.verdict === "range") rangeVotes++;
  }
  if (ker) {
    if (ker.verdict === "trend") trendVotes++;
    else if (ker.verdict === "range") rangeVotes++;
  }
  if (choppiness) {
    if (choppiness.verdict === "trend") trendVotes++;
    else if (choppiness.verdict === "range") rangeVotes++;
  }

  let classification: "up" | "down" | "range" | "mixed";
  let strength: "strong" | "moderate" | "weak";

  if (trendVotes >= 2) {
    const dir = adx && adx.plusDI > adx.minusDI ? "up" : "down";
    classification = dir;
    strength = trendVotes === 3 && (adx?.value ?? 0) >= 40 ? "strong" : "moderate";
  } else if (rangeVotes >= 2) {
    classification = "range";
    strength = "weak";
  } else {
    classification = "mixed";
    strength = "weak";
  }

  return {
    adx,
    ker,
    choppiness,
    composite: { classification, strength, trendVotes, rangeVotes },
  };
}
