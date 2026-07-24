import type { Candle } from "./binance";

export interface Swing {
  index: number;
  time: number;
  price: number;
  type: "high" | "low";
}

/** Pivot-based swing detection. A bar is a swing high if its high is the max
 *  over [-lookback, +lookback]. Symmetric for swing low. */
export function findSwings(candles: Candle[], lookback = 3): Swing[] {
  const out: Swing[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }
    if (isHigh) out.push({ index: i, time: c.openTime, price: c.high, type: "high" });
    if (isLow) out.push({ index: i, time: c.openTime, price: c.low, type: "low" });
  }
  return out;
}

export interface FVG {
  index: number; // middle candle (the gap candle)
  time: number;
  side: "bullish" | "bearish";
  top: number;
  bottom: number;
  filled: boolean;
}

/** 3-bar Fair Value Gap.
 *  Bullish FVG: low(i) > high(i-2). Bearish FVG: high(i) < low(i-2). */
export function findFVGs(candles: Candle[], maxLookback = 100): FVG[] {
  const out: FVG[] = [];
  const start = Math.max(2, candles.length - maxLookback);
  for (let i = start; i < candles.length; i++) {
    const c2 = candles[i - 2];
    const c0 = candles[i];
    if (c0.low > c2.high) {
      const top = c0.low;
      const bottom = c2.high;
      const filled = candles.slice(i + 1).some((x) => x.low <= bottom);
      out.push({ index: i, time: c0.openTime, side: "bullish", top, bottom, filled });
    } else if (c0.high < c2.low) {
      const top = c2.low;
      const bottom = c0.high;
      const filled = candles.slice(i + 1).some((x) => x.high >= top);
      out.push({ index: i, time: c0.openTime, side: "bearish", top, bottom, filled });
    }
  }
  return out;
}

export interface OrderBlock {
  index: number;
  time: number;
  side: "bullish" | "bearish";
  top: number;
  bottom: number;
}

/** Naive OB: the last opposite-color candle before a strong impulsive move
 *  that breaks the prior swing in the direction of the impulse. */
export function findOrderBlocks(candles: Candle[], maxLookback = 80): OrderBlock[] {
  const out: OrderBlock[] = [];
  const start = Math.max(3, candles.length - maxLookback);
  for (let i = start; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const range = cur.high - cur.low;
    const body = Math.abs(cur.close - cur.open);
    if (range === 0) continue;
    const bodyRatio = body / range;
    // Need a strong body (>= 0.6) impulsive candle
    if (bodyRatio < 0.6) continue;

    // Bullish impulse: close > open and breaks above the prior 5-bar high
    if (cur.close > cur.open) {
      const priorHigh = Math.max(...candles.slice(Math.max(0, i - 6), i).map((c) => c.high));
      if (cur.close > priorHigh) {
        // Find the last bearish candle before this impulse
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          if (candles[j].close < candles[j].open) {
            out.push({
              index: j,
              time: candles[j].openTime,
              side: "bullish",
              top: candles[j].high,
              bottom: candles[j].low,
            });
            break;
          }
        }
      }
    }
    // Bearish impulse: close < open and breaks below the prior 5-bar low
    if (cur.close < cur.open) {
      const priorLow = Math.min(...candles.slice(Math.max(0, i - 6), i).map((c) => c.low));
      if (cur.close < priorLow) {
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          if (candles[j].close > candles[j].open) {
            out.push({
              index: j,
              time: candles[j].openTime,
              side: "bearish",
              top: candles[j].high,
              bottom: candles[j].low,
            });
            break;
          }
        }
      }
    }
  }
  // Dedup nearest neighbors
  return out.filter((b, i, arr) => i === 0 || Math.abs(b.bottom - arr[i - 1].bottom) / b.bottom > 0.001);
}

export interface LiquidityZone {
  price: number;
  side: "buy" | "sell"; // buy-side = above equal highs (longs targeted), sell-side = below equal lows
  touches: number;
}

/** Equal highs (buy-side liquidity above) and equal lows (sell-side below)
 *  within tolerance. */
export function findLiquidityZones(swings: Swing[], tolerancePct = 0.0015): LiquidityZone[] {
  const highs = swings.filter((s) => s.type === "high").map((s) => s.price);
  const lows = swings.filter((s) => s.type === "low").map((s) => s.price);

  function cluster(prices: number[]): { price: number; touches: number }[] {
    const sorted = [...prices].sort((a, b) => a - b);
    const groups: number[][] = [];
    for (const p of sorted) {
      const last = groups[groups.length - 1];
      if (last && Math.abs(p - last[last.length - 1]) / p <= tolerancePct) last.push(p);
      else groups.push([p]);
    }
    return groups
      .filter((g) => g.length >= 2)
      .map((g) => ({ price: g.reduce((a, b) => a + b, 0) / g.length, touches: g.length }));
  }

  return [
    ...cluster(highs).map((g) => ({ price: g.price, touches: g.touches, side: "buy" as const })),
    ...cluster(lows).map((g) => ({ price: g.price, touches: g.touches, side: "sell" as const })),
  ];
}

export interface LiquiditySweep {
  /** Index of the candle whose wick swept the prior swing level. */
  sweepIndex: number;
  sweepTime: number;
  /** "bullish" = swing low was swept + recovered → long setup.
   *  "bearish" = swing high was swept + recovered → short setup. */
  side: "bullish" | "bearish";
  /** The prior swing level that got swept. */
  sweptLevel: number;
  /** Wick extreme that pierced the level (lowest low for bullish, highest high for bearish). */
  wickExtreme: number;
  /** Close that confirmed recovery (close back on the original side of sweptLevel). */
  recoveryClose: number;
  /** How many bars after the sweep candle the close recovered (0 = same candle, 1 = next, etc.). */
  recoveredWithinBars: number;
  /** Bars since the sweep candle to the last bar (freshness — lower is better). */
  ageBars: number;
}

/** Detect recent liquidity sweeps (ICT/SMC).
 *
 *  A sweep is when price wicks beyond a recent swing high/low and the close
 *  comes back to the original side within `maxRecoveryBars` candles. This
 *  signals stop-loss hunting by larger participants.
 *
 *  Only sweeps within the last `maxAgeBars` are returned (older ones are stale).
 *  The freshest sweep is the most actionable.
 */
export function detectLiquiditySweeps(
  candles: Candle[],
  swings: Swing[],
  opts: { maxRecoveryBars?: number; maxAgeBars?: number; minPiercePct?: number } = {},
): LiquiditySweep[] {
  const { maxRecoveryBars = 3, maxAgeBars = 8, minPiercePct = 0.0005 } = opts;
  if (candles.length < 10 || swings.length === 0) return [];

  const lastIdx = candles.length - 1;
  const out: LiquiditySweep[] = [];

  // Pre-build sorted swings for binary lookup not needed at this scale; linear is fine.
  for (let i = Math.max(2, candles.length - maxAgeBars - maxRecoveryBars); i <= lastIdx; i++) {
    const c = candles[i];

    // Find the most recent swing high BEFORE this candle (strict <).
    let priorHigh: Swing | null = null;
    let priorLow: Swing | null = null;
    for (let s = swings.length - 1; s >= 0; s--) {
      const sw = swings[s];
      if (sw.index >= i) continue;
      if (!priorHigh && sw.type === "high") priorHigh = sw;
      if (!priorLow && sw.type === "low") priorLow = sw;
      if (priorHigh && priorLow) break;
    }

    // Bearish sweep: wick above prior swing high, close back below it within N bars.
    if (priorHigh && c.high > priorHigh.price * (1 + minPiercePct)) {
      // Check recovery within window.
      for (let r = 0; r <= maxRecoveryBars && i + r <= lastIdx; r++) {
        const close = candles[i + r].close;
        if (close < priorHigh.price) {
          const age = lastIdx - i;
          if (age <= maxAgeBars) {
            out.push({
              sweepIndex: i,
              sweepTime: c.openTime,
              side: "bearish",
              sweptLevel: priorHigh.price,
              wickExtreme: c.high,
              recoveryClose: close,
              recoveredWithinBars: r,
              ageBars: age,
            });
          }
          break;
        }
      }
    }

    // Bullish sweep: wick below prior swing low, close back above it within N bars.
    if (priorLow && c.low < priorLow.price * (1 - minPiercePct)) {
      for (let r = 0; r <= maxRecoveryBars && i + r <= lastIdx; r++) {
        const close = candles[i + r].close;
        if (close > priorLow.price) {
          const age = lastIdx - i;
          if (age <= maxAgeBars) {
            out.push({
              sweepIndex: i,
              sweepTime: c.openTime,
              side: "bullish",
              sweptLevel: priorLow.price,
              wickExtreme: c.low,
              recoveryClose: close,
              recoveredWithinBars: r,
              ageBars: age,
            });
          }
          break;
        }
      }
    }
  }

  // Dedup: keep one per (side, sweptLevel ≈ same). Sort by freshness (age asc).
  const sorted = out.sort((a, b) => a.ageBars - b.ageBars);
  const seen = new Set<string>();
  const dedup: LiquiditySweep[] = [];
  for (const s of sorted) {
    const key = `${s.side}-${s.sweptLevel.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(s);
  }
  return dedup;
}

/** Minimal candle shape detectStructureBreaks reads — binance Candle and the
 *  lighter chart candles (once time→openTime mapped) both satisfy it. */
export interface StructureCandle {
  high: number;
  low: number;
  close: number;
  openTime: number;
}

export interface StructureBreak {
  /** Bar index where close crossed the pivot (the event bar). */
  index: number;
  time: number;
  /** BOS = break with the prevailing structural trend (continuation).
   *  CHoCH = break against it (character change / potential reversal). */
  type: "BOS" | "CHoCH";
  /** bullish = broke a swing high upward → long bias. bearish = broke a swing low downward. */
  side: "bullish" | "bearish";
  /** The pivot level that was broken. */
  level: number;
}

/**
 * BOS / CHoCH structure-break detection.
 *
 * Ported from LuxAlgo "Smart Money Concepts" (Pine v5, CC BY-NC-SA 4.0) — the
 * pivot-leg + crossover logic only (all drawing/boxes/labels dropped).
 *
 * A pivot high is confirmed `swingSize` bars after the fact (its high exceeds the
 * highest of the following `swingSize` bars); pivot low symmetric. When close then
 * crosses the most recent confirmed pivot, that is a structure break — labeled BOS
 * if it agrees with the current structural trend, CHoCH if it flips it.
 *
 *   swingSize = 50 ≈ swing structure (LuxAlgo default), 5 ≈ internal structure.
 *
 * No look-ahead: each event uses only bars at or before its index.
 */
export function detectStructureBreaks(candles: StructureCandle[], swingSize = 50): StructureBreak[] {
  const n = candles.length;
  const out: StructureBreak[] = [];
  if (n < swingSize + 2) return out;

  let leg = 0; // 0 = bearish leg, 1 = bullish leg (Pine BEARISH_LEG / BULLISH_LEG)
  let swingHighLevel = NaN;
  let swingHighCrossed = true;
  let swingLowLevel = NaN;
  let swingLowCrossed = true;
  let trendBias = 0; // +1 bullish, -1 bearish, 0 none

  for (let i = 0; i < n; i++) {
    // Pivot detection: high[ref] vs highest of the following swingSize bars.
    if (i >= swingSize) {
      const ref = i - swingSize;
      let hh = -Infinity;
      let ll = Infinity;
      for (let j = i - swingSize + 1; j <= i; j++) {
        if (candles[j].high > hh) hh = candles[j].high;
        if (candles[j].low < ll) ll = candles[j].low;
      }
      let newLeg = leg;
      if (candles[ref].high > hh) newLeg = 0; // pivot high confirmed → bearish leg
      else if (candles[ref].low < ll) newLeg = 1; // pivot low confirmed → bullish leg
      const change = newLeg - leg;
      if (change === 1) {
        swingLowLevel = candles[ref].low;
        swingLowCrossed = false;
      } else if (change === -1) {
        swingHighLevel = candles[ref].high;
        swingHighCrossed = false;
      }
      leg = newLeg;
    }

    // Structure break: close crossing the most recent confirmed pivot (once each).
    if (i >= 1) {
      const prevClose = candles[i - 1].close;
      const close = candles[i].close;
      if (!Number.isNaN(swingHighLevel) && !swingHighCrossed && prevClose <= swingHighLevel && close > swingHighLevel) {
        out.push({ index: i, time: candles[i].openTime, type: trendBias === -1 ? "CHoCH" : "BOS", side: "bullish", level: swingHighLevel });
        trendBias = 1;
        swingHighCrossed = true;
      }
      if (!Number.isNaN(swingLowLevel) && !swingLowCrossed && prevClose >= swingLowLevel && close < swingLowLevel) {
        out.push({ index: i, time: candles[i].openTime, type: trendBias === 1 ? "CHoCH" : "BOS", side: "bearish", level: swingLowLevel });
        trendBias = -1;
        swingLowCrossed = true;
      }
    }
  }
  return out;
}

/** Simple trend label from last 50 closes via linear slope sign + EMA cross. */
export function classifyTrend(candles: Candle[]): "up" | "down" | "range" {
  if (candles.length < 50) return "range";
  const recent = candles.slice(-50);
  const ema = (arr: number[], period: number) => {
    const k = 2 / (period + 1);
    let v = arr[0];
    for (let i = 1; i < arr.length; i++) v = arr[i] * k + v * (1 - k);
    return v;
  };
  const closes = recent.map((c) => c.close);
  const fast = ema(closes, 20);
  const slow = ema(closes, 50);
  const last = closes[closes.length - 1];
  const first = closes[0];
  const diffPct = (last - first) / first;

  if (fast > slow && diffPct > 0.01) return "up";
  if (fast < slow && diffPct < -0.01) return "down";
  return "range";
}
