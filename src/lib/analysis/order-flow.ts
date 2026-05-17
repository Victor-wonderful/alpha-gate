import type { AggTrade, Depth } from "./binance";

export interface FlowSummary {
  buyVolume: number;
  sellVolume: number;
  delta: number;
  buyRatio: number; // 0..1
  largeBuys: number; // count of trades > threshold
  largeSells: number;
  largestTradeUsd: number;
  windowMs: number;
}

export function summarizeFlow(trades: AggTrade[], largeUsd = 50_000): FlowSummary {
  let buy = 0;
  let sell = 0;
  let largeBuys = 0;
  let largeSells = 0;
  let largestTradeUsd = 0;
  let first = Number.MAX_SAFE_INTEGER;
  let last = 0;
  for (const t of trades) {
    const usd = t.price * t.qty;
    if (usd > largestTradeUsd) largestTradeUsd = usd;
    if (t.isBuyerMaker) {
      // Buyer is maker means an aggressive SELL hit the bid
      sell += t.qty;
      if (usd >= largeUsd) largeSells += 1;
    } else {
      buy += t.qty;
      if (usd >= largeUsd) largeBuys += 1;
    }
    if (t.time < first) first = t.time;
    if (t.time > last) last = t.time;
  }
  const delta = buy - sell;
  const total = buy + sell;
  return {
    buyVolume: buy,
    sellVolume: sell,
    delta,
    buyRatio: total === 0 ? 0.5 : buy / total,
    largeBuys,
    largeSells,
    largestTradeUsd,
    windowMs: Math.max(0, last - first),
  };
}

export interface DepthSummary {
  bestBid: number;
  bestAsk: number;
  spreadBps: number;
  bidWalls: { price: number; usd: number }[]; // top 3 by size
  askWalls: { price: number; usd: number }[];
  bidUsd10: number; // cumulative within 0.1% of mid
  askUsd10: number;
  imbalance: number; // (bid-ask) / (bid+ask), within 0.5% band
}

export function summarizeDepth(depth: Depth): DepthSummary {
  const bestBid = depth.bids[0]?.[0] ?? 0;
  const bestAsk = depth.asks[0]?.[0] ?? 0;
  const mid = (bestBid + bestAsk) / 2 || 1;
  const spreadBps = mid === 0 ? 0 : ((bestAsk - bestBid) / mid) * 10_000;

  const usd = (price: number, qty: number) => price * qty;

  const bids = depth.bids
    .map(([p, q]) => ({ price: p, usd: usd(p, q) }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 3);
  const asks = depth.asks
    .map(([p, q]) => ({ price: p, usd: usd(p, q) }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 3);

  const within = (price: number, pct: number) => Math.abs(price - mid) / mid <= pct;
  const bidUsd10 = depth.bids.filter(([p]) => within(p, 0.001)).reduce((s, [p, q]) => s + usd(p, q), 0);
  const askUsd10 = depth.asks.filter(([p]) => within(p, 0.001)).reduce((s, [p, q]) => s + usd(p, q), 0);
  const bidUsd50 = depth.bids.filter(([p]) => within(p, 0.005)).reduce((s, [p, q]) => s + usd(p, q), 0);
  const askUsd50 = depth.asks.filter(([p]) => within(p, 0.005)).reduce((s, [p, q]) => s + usd(p, q), 0);

  const imbalance = bidUsd50 + askUsd50 === 0 ? 0 : (bidUsd50 - askUsd50) / (bidUsd50 + askUsd50);

  return { bestBid, bestAsk, spreadBps, bidWalls: bids, askWalls: asks, bidUsd10, askUsd10, imbalance };
}

export function classifyFunding(rate: number): {
  bias: "long_heavy" | "short_heavy" | "neutral";
  label: string;
} {
  // Binance perp default funding is 8h. Threshold ~0.05% = strongly long-skewed.
  if (rate > 0.0005) return { bias: "long_heavy", label: `펀딩 ${(rate * 100).toFixed(4)}% — 롱 과열` };
  if (rate < -0.0005) return { bias: "short_heavy", label: `펀딩 ${(rate * 100).toFixed(4)}% — 숏 과열` };
  return { bias: "neutral", label: `펀딩 ${(rate * 100).toFixed(4)}% — 중립` };
}
