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
