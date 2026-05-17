import type { Candle } from "./binance";

export interface VolumeProfile {
  poc: number; // Point of Control
  vah: number; // Value Area High
  val: number; // Value Area Low
  bins: { price: number; volume: number }[];
}

/** Compute a simple volume profile by binning candles into price buckets,
 *  distributing each candle's volume uniformly across [low, high]. */
export function computeVolumeProfile(candles: Candle[], binCount = 40, valueAreaPct = 0.7): VolumeProfile {
  if (candles.length === 0) return { poc: 0, vah: 0, val: 0, bins: [] };

  const globalHigh = Math.max(...candles.map((c) => c.high));
  const globalLow = Math.min(...candles.map((c) => c.low));
  const binSize = (globalHigh - globalLow) / binCount;
  if (binSize === 0) return { poc: globalHigh, vah: globalHigh, val: globalLow, bins: [] };

  const bins = new Array(binCount).fill(0) as number[];

  for (const c of candles) {
    const range = c.high - c.low;
    if (range === 0) {
      const idx = Math.min(binCount - 1, Math.floor((c.close - globalLow) / binSize));
      bins[idx] += c.volume;
      continue;
    }
    const startIdx = Math.max(0, Math.floor((c.low - globalLow) / binSize));
    const endIdx = Math.min(binCount - 1, Math.floor((c.high - globalLow) / binSize));
    const span = endIdx - startIdx + 1;
    const each = c.volume / span;
    for (let i = startIdx; i <= endIdx; i++) bins[i] += each;
  }

  let pocIdx = 0;
  for (let i = 1; i < bins.length; i++) if (bins[i] > bins[pocIdx]) pocIdx = i;
  const poc = globalLow + (pocIdx + 0.5) * binSize;

  const total = bins.reduce((a, b) => a + b, 0);
  const target = total * valueAreaPct;
  let acc = bins[pocIdx];
  let lo = pocIdx;
  let hi = pocIdx;
  while (acc < target && (lo > 0 || hi < binCount - 1)) {
    const left = lo > 0 ? bins[lo - 1] : -1;
    const right = hi < binCount - 1 ? bins[hi + 1] : -1;
    if (right >= left) {
      hi += 1;
      acc += bins[hi];
    } else {
      lo -= 1;
      acc += bins[lo];
    }
  }
  const val = globalLow + lo * binSize;
  const vah = globalLow + (hi + 1) * binSize;

  return {
    poc,
    vah,
    val,
    bins: bins.map((v, i) => ({ price: globalLow + (i + 0.5) * binSize, volume: v })),
  };
}
