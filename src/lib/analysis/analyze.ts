import "server-only";
import {
  fetchKlines,
  fetchDepth,
  fetchAggTrades,
  fetchFundingRate,
  fetchOpenInterest,
  fetchTicker24h,
  fetchBtcDominance,
  type Interval,
} from "./binance";
import { classifyTrend, findFVGs, findLiquidityZones, findOrderBlocks, findSwings } from "./smc";
import { computeVolumeProfile } from "./volume-profile";
import { classifyFunding, summarizeDepth, summarizeFlow } from "./order-flow";
import { STYLE_PRESETS, tfsForStyle, type TradingStyle } from "./style";

export interface AnalysisSnapshot {
  symbol: string;
  generatedAt: string;
  style: TradingStyle;
  styleLabel: string;
  ticker: {
    last: number;
    change24hPct: number;
    high24h: number;
    low24h: number;
    volume24h: number;
  };
  multiTf: Array<{
    tf: Interval;
    role: "HTF" | "MTF" | "LTF";
    trend: "up" | "down" | "range";
    lastSwingHigh: number | null;
    lastSwingLow: number | null;
    unfilledFVGs: { side: "bullish" | "bearish"; top: number; bottom: number }[];
    orderBlocks: { side: "bullish" | "bearish"; top: number; bottom: number }[];
    liquidity: { price: number; side: "buy" | "sell"; touches: number }[];
  }>;
  mtfChart: {
    tf: Interval;
    candles: { time: number; open: number; high: number; low: number; close: number }[];
  };
  volumeProfile: { tf: Interval; poc: number; vah: number; val: number };
  flow1m: {
    buyVolume: number;
    sellVolume: number;
    buyRatio: number;
    largeBuys: number;
    largeSells: number;
    largestTradeUsd: number;
  };
  depth: {
    bestBid: number;
    bestAsk: number;
    spreadBps: number;
    bidWalls: { price: number; usd: number }[];
    askWalls: { price: number; usd: number }[];
    imbalance: number;
  };
  funding: { rate: number; nextFundingTime: number; bias: string };
  openInterest: number;
  macro: { btcDominance: number | null };
}

export async function buildSnapshot(symbol: string, style: TradingStyle = "swing"): Promise<AnalysisSnapshot> {
  const sym = symbol.toUpperCase();
  const preset = STYLE_PRESETS[style];
  const tfs = tfsForStyle(style); // HTF, MTF, LTF
  const ROLES: ("HTF" | "MTF" | "LTF")[] = ["HTF", "MTF", "LTF"];

  // Make sure we also fetch the volume-profile TF if it's different
  const allTfs = Array.from(new Set([...tfs, preset.volumeProfileTf])) as Interval[];

  const [ticker, depth, trades, funding, oi, btcd, ...klineSets] = await Promise.all([
    fetchTicker24h(sym),
    fetchDepth(sym, 100),
    fetchAggTrades(sym, 500),
    fetchFundingRate(sym),
    fetchOpenInterest(sym),
    fetchBtcDominance(),
    ...allTfs.map((tf) => fetchKlines(sym, tf, 300)),
  ]);

  const tfData: Record<string, ReturnType<typeof Object> | (typeof klineSets)[number]> = {};
  allTfs.forEach((tf, i) => {
    (tfData as Record<string, (typeof klineSets)[number]>)[tf] = klineSets[i];
  });

  const multiTf = tfs.map((tf, i) => {
    const candles = (tfData as Record<string, (typeof klineSets)[number]>)[tf];
    const swings = findSwings(candles, 3);
    const lastSwingHigh = [...swings].reverse().find((s) => s.type === "high")?.price ?? null;
    const lastSwingLow = [...swings].reverse().find((s) => s.type === "low")?.price ?? null;
    const fvgs = findFVGs(candles).filter((f) => !f.filled).slice(-4);
    const obs = findOrderBlocks(candles).slice(-4);
    const liq = findLiquidityZones(swings).slice(-6);
    return {
      tf,
      role: ROLES[i],
      trend: classifyTrend(candles),
      lastSwingHigh,
      lastSwingLow,
      unfilledFVGs: fvgs.map((f) => ({ side: f.side, top: f.top, bottom: f.bottom })),
      orderBlocks: obs.map((o) => ({ side: o.side, top: o.top, bottom: o.bottom })),
      liquidity: liq,
    };
  });

  const vpCandles = (tfData as Record<string, (typeof klineSets)[number]>)[preset.volumeProfileTf];
  const vp = computeVolumeProfile(vpCandles, 40, 0.7);

  // MTF candles for chart visualization (last 250 bars)
  const mtfTf = preset.mtf;
  const mtfRaw = (tfData as Record<string, (typeof klineSets)[number]>)[mtfTf];
  const mtfChart = {
    tf: mtfTf,
    candles: mtfRaw.slice(-250).map((c) => ({
      time: Math.floor(c.openTime / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })),
  };
  const flow = summarizeFlow(trades);
  const depthSum = summarizeDepth(depth);
  const fundBias = classifyFunding(funding.rate);

  return {
    symbol: sym,
    generatedAt: new Date().toISOString(),
    style,
    styleLabel: preset.label,
    ticker: {
      last: ticker.lastPrice,
      change24hPct: ticker.priceChangePercent,
      high24h: ticker.highPrice,
      low24h: ticker.lowPrice,
      volume24h: ticker.volume,
    },
    multiTf,
    mtfChart,
    volumeProfile: { tf: preset.volumeProfileTf, poc: vp.poc, vah: vp.vah, val: vp.val },
    flow1m: {
      buyVolume: flow.buyVolume,
      sellVolume: flow.sellVolume,
      buyRatio: flow.buyRatio,
      largeBuys: flow.largeBuys,
      largeSells: flow.largeSells,
      largestTradeUsd: flow.largestTradeUsd,
    },
    depth: depthSum,
    funding: { rate: funding.rate, nextFundingTime: funding.nextFundingTime, bias: fundBias.label },
    openInterest: oi,
    macro: { btcDominance: btcd },
  };
}
