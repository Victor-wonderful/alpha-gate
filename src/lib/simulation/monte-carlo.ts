// Monte Carlo trade simulation.
// Given an entry/stop/target setup and the current volatility (ATR % per bar),
// run N random walks to estimate the probability the trade hits target first,
// hits stop first, or times out within the style's typical hold window.
//
// Random walk model: geometric Brownian motion with σ = atrPctPerBar / 100.
// Each step is one "bar" of the style's main timeframe.
//
// This is a probabilistic preview — not a guarantee. It assumes future returns
// are stationary at current ATR. It does NOT model:
//  - regime changes / news shocks
//  - mean reversion
//  - skew / fat tails (uses normal distribution)
// Use it as a sanity check, not a crystal ball.

export interface MonteCarloResult {
  runs: number;
  winRate: number; // 0..1 — paths that hit target first
  lossRate: number; // 0..1 — paths that hit stop first
  timeoutRate: number; // 0..1 — paths that hit neither in time
  expectedR: number; // average outcome in R (target hit = +rr, stop hit = -1, timeout = 0)
  medianBarsToWin: number | null;
  medianBarsToLoss: number | null;
  rrRatio: number;
  /** Time horizon used (number of bars) */
  barLimit: number;
  /** Volatility used (% per bar) */
  atrPctPerBar: number;
}

export interface MonteCarloInput {
  entry: number;
  stop: number;
  target: number;
  direction: "long" | "short";
  atrPctPerBar: number;
  barLimit: number;
  runs?: number;
}

// Box-Muller transform for standard normal random variables
function randomNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function monteCarloSim({
  entry,
  stop,
  target,
  direction,
  atrPctPerBar,
  barLimit,
  runs = 1000,
}: MonteCarloInput): MonteCarloResult | null {
  if (entry <= 0 || stop <= 0 || target <= 0 || atrPctPerBar <= 0 || barLimit <= 0) return null;
  if (direction === "long" && (stop >= entry || target <= entry)) return null;
  if (direction === "short" && (stop <= entry || target >= entry)) return null;

  const sigma = atrPctPerBar / 100; // % to ratio
  const stopDist = Math.abs(entry - stop);
  const targetDist = Math.abs(target - entry);
  const rrRatio = stopDist > 0 ? targetDist / stopDist : 0;

  let wins = 0;
  let losses = 0;
  let timeouts = 0;
  let totalR = 0;
  const winBars: number[] = [];
  const lossBars: number[] = [];

  for (let r = 0; r < runs; r++) {
    let price = entry;
    let resolved = false;
    for (let bar = 1; bar <= barLimit; bar++) {
      // log-return shock
      const shock = randomNormal() * sigma;
      price = price * Math.exp(shock);
      if (direction === "long") {
        if (price >= target) {
          wins++;
          winBars.push(bar);
          totalR += rrRatio;
          resolved = true;
          break;
        }
        if (price <= stop) {
          losses++;
          lossBars.push(bar);
          totalR -= 1;
          resolved = true;
          break;
        }
      } else {
        if (price <= target) {
          wins++;
          winBars.push(bar);
          totalR += rrRatio;
          resolved = true;
          break;
        }
        if (price >= stop) {
          losses++;
          lossBars.push(bar);
          totalR -= 1;
          resolved = true;
          break;
        }
      }
    }
    if (!resolved) {
      timeouts++;
      // timeout = 0 R contribution
    }
  }

  return {
    runs,
    winRate: wins / runs,
    lossRate: losses / runs,
    timeoutRate: timeouts / runs,
    expectedR: totalR / runs,
    medianBarsToWin: median(winBars),
    medianBarsToLoss: median(lossBars),
    rrRatio,
    barLimit,
    atrPctPerBar,
  };
}

/** Style-based bar count limit (how many bars to walk before considering it a timeout). */
export const STYLE_BAR_LIMITS: Record<string, number> = {
  scalp: 32, // 15M × 32 ≈ 8h
  day: 48, // 1H × 48 ≈ 2 days
  swing: 60, // 4H × 60 ≈ 10 days
  position: 30, // 1D × 30 ≈ 30 days
};
