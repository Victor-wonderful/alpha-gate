import "server-only";
import {
  fetchKlines,
  fetchDepth,
  fetchAggTrades,
  fetchFundingRate,
  fetchOpenInterest,
  fetchTicker24h,
  fetchMarketDominance,
  type MarketDominance,
  type Interval,
} from "./binance";
import {
  classifyTrend,
  detectLiquiditySweeps,
  findFVGs,
  findLiquidityZones,
  findOrderBlocks,
  findSwings,
  type LiquiditySweep,
} from "./smc";
import {
  detectFundingSqueeze,
  detectSessionOpenDrive,
  type FundingSqueezeSignal,
  type SessionOpenDriveSignal,
} from "./special-strategies";
import { classifyTrendComposite } from "./trend";
import { classifyDominanceRegime } from "./dominance";
import { computeVolumeProfile } from "./volume-profile";
import { classifyFunding, summarizeDepth, summarizeFlow } from "./order-flow";
import { STYLE_PRESETS, tfsForStyle, type TradingStyle } from "./style";
import {
  computeATR,
  computeSessionVWAP,
  detectSession,
  fetchDXY,
  fetchFearGreed,
  fetchFundingHistory,
  fetchOIDelta,
  fetchSpotPerpBasis,
  fetchTopTraderRatio,
} from "./enriched";

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
    /** All 3 timeframes for chart toggle (HTF/MTF/LTF). Optional for backward compat with older saved analyses. */
    byRole?: {
      HTF: { tf: Interval; candles: { time: number; open: number; high: number; low: number; close: number }[] };
      MTF: { tf: Interval; candles: { time: number; open: number; high: number; low: number; close: number }[] };
      LTF: { tf: Interval; candles: { time: number; open: number; high: number; low: number; close: number }[] };
    };
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
  fundingHistory?: {
    recent: Array<{ rate: number; time: number }>;
    avg24h: number;
    trend: "rising" | "falling" | "flat";
  } | null;
  openInterest: number;
  oiDelta?: {
    current: number;
    hourAgo: number | null;
    hourChangePct: number | null;
    fourHourChangePct: number | null;
  } | null;
  macro: {
    btcDominance: number | null;
    /** Full dominance breakdown (BTC/ETH/USDT/stablecoin) + total mcap + 24h change */
    dominance?: MarketDominance | null;
    /** Classified market regime (alt_season / btc_season / risk_off / ...) */
    dominanceRegime?: import("./dominance").DominanceVerdict | null;
    dxy?: { value: number; change24hPct: number } | null;
    fearGreed?: { value: number; label: string } | null;
  };
  /** ATR per visible TF (HTF/MTF/LTF) — % of price */
  atr?: Array<{ tf: Interval; role: "HTF" | "MTF" | "LTF"; pctOfPrice: number; value: number }>;
  /** Session VWAP based on MTF candles */
  vwap?: { value: number; distancePct: number } | null;
  /** Top trader (top 20% by margin) long/short ratio */
  topTraderRatio?: {
    longShortRatio: number;
    longAccountPct: number;
    shortAccountPct: number;
  } | null;
  /** Spot vs Perp basis */
  basis?: { spot: number; perp: number; premiumPct: number } | null;
  /** Current trading session (UTC-based) */
  session?: {
    current: "Asia" | "EU" | "US" | "Off";
    minutesIntoSession: number;
    minutesToNext: number;
    nextSession: "Asia" | "EU" | "US" | "Off";
  };
  /** Weekly volume profile for longer-term POC reference */
  weeklyVolumeProfile?: { poc: number; vah: number; val: number } | null;
  /** Recent liquidity sweeps on LTF (ICT/SMC) — fuel for liquidity_grab strategy. */
  liquiditySweeps?: LiquiditySweep[];
  /** Funding squeeze signal — fuel for funding_squeeze strategy. */
  fundingSqueeze?: FundingSqueezeSignal;
  /** US-session open drive signal — fuel for session_open_drive strategy. */
  sessionOpenDrive?: SessionOpenDriveSignal;
  /** Trend classification using established indicators (ADX/KER/Choppiness) on style-specific TF */
  trendMetrics?: {
    refTf: Interval;
    adx: { value: number; verdict: "trend" | "developing" | "range"; plusDI: number; minusDI: number } | null;
    ker: { value: number; verdict: "trend" | "mixed" | "range" } | null;
    choppiness: { value: number; verdict: "trend" | "mixed" | "range" } | null;
    classification: "up" | "down" | "range" | "mixed";
    strength: "strong" | "moderate" | "weak";
    trendVotes: number;
    rangeVotes: number;
  };
}

export async function buildSnapshot(symbol: string, style: TradingStyle = "swing"): Promise<AnalysisSnapshot> {
  const sym = symbol.toUpperCase();
  const preset = STYLE_PRESETS[style];
  const tfs = tfsForStyle(style); // HTF, MTF, LTF
  const ROLES: ("HTF" | "MTF" | "LTF")[] = ["HTF", "MTF", "LTF"];

  // Make sure we also fetch the volume-profile TF if it's different
  const allTfs = Array.from(new Set([...tfs, preset.volumeProfileTf])) as Interval[];

  const [
    ticker,
    depth,
    trades,
    funding,
    oi,
    dominance,
    topTraderRatio,
    fearGreed,
    dxy,
    oiDelta,
    fundingHistory,
    weeklyCandles,
    ...klineSets
  ] = await Promise.all([
    fetchTicker24h(sym),
    fetchDepth(sym, 100),
    fetchAggTrades(sym, 500),
    fetchFundingRate(sym),
    fetchOpenInterest(sym),
    fetchMarketDominance(),
    fetchTopTraderRatio(sym, "15m"),
    fetchFearGreed(),
    fetchDXY(),
    fetchOIDelta(sym),
    fetchFundingHistory(sym),
    fetchKlines(sym, "1d", 200), // for weekly volume profile (200 daily ≈ 28 weeks)
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

  // Chart candles for all 3 TFs (last 250 bars each). MTF is the default.
  const buildChartCandles = (tf: Interval) => {
    const raw = (tfData as Record<string, (typeof klineSets)[number]>)[tf];
    return raw.slice(-250).map((c) => ({
      time: Math.floor(c.openTime / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
  };
  const mtfTf = preset.mtf;
  const mtfChart = {
    tf: mtfTf,
    candles: buildChartCandles(mtfTf),
    byRole: {
      HTF: { tf: preset.htf, candles: buildChartCandles(preset.htf) },
      MTF: { tf: preset.mtf, candles: buildChartCandles(preset.mtf) },
      LTF: { tf: preset.ltf, candles: buildChartCandles(preset.ltf) },
    },
  };
  const flow = summarizeFlow(trades);
  const depthSum = summarizeDepth(depth);
  const fundBias = classifyFunding(funding.rate);

  // ATR per TF
  const atr = tfs.map((tf, i) => {
    const candles = (tfData as Record<string, (typeof klineSets)[number]>)[tf];
    const a = computeATR(candles, 14);
    return { tf, role: ROLES[i], pctOfPrice: a.pctOfPrice, value: a.value };
  });

  // Session VWAP based on MTF candles
  const mtfCandles = (tfData as Record<string, (typeof klineSets)[number]>)[preset.mtf];
  const vwap = computeSessionVWAP(mtfCandles);

  // Spot-Perp basis (depends on ticker.lastPrice)
  const basis = await fetchSpotPerpBasis(sym, ticker.lastPrice);

  // Trading session
  const session = detectSession();

  // Weekly volume profile (using daily candles, group by 7)
  const weeklyVp = weeklyCandles.length >= 14 ? computeVolumeProfile(weeklyCandles, 60, 0.7) : null;

  // Trend classification via ADX (Wilder) + KER (Kaufman) + Choppiness (Dreiss)
  const trendMetrics = computeTrendMetrics(style, tfData, tfs);

  // Special-strategy signals (ICT liquidity sweeps, funding squeeze, US open drive).
  const ltfCandles = (tfData as Record<string, (typeof klineSets)[number]>)[preset.ltf];
  const ltfSwings = findSwings(ltfCandles, 3);
  const liquiditySweeps = detectLiquiditySweeps(ltfCandles, ltfSwings).slice(0, 4);

  const fundingSqueeze = detectFundingSqueeze({
    fundingRate: funding.rate,
    fundingHistory: fundingHistory
      ? { avg24h: fundingHistory.avg24h, trend: fundingHistory.trend }
      : null,
    oiDelta: oiDelta
      ? {
          hourChangePct: oiDelta.hourChangePct,
          fourHourChangePct: oiDelta.fourHourChangePct,
        }
      : null,
  });

  const sessionOpenDrive = detectSessionOpenDrive({
    session,
    ltfCandles,
    style,
  });

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
    fundingHistory,
    openInterest: oi,
    oiDelta,
    macro: {
      btcDominance: dominance?.btc ?? null,
      dominance,
      dominanceRegime: dominance ? classifyDominanceRegime(dominance) : null,
      dxy,
      fearGreed,
    },
    atr,
    vwap,
    topTraderRatio,
    basis,
    session,
    weeklyVolumeProfile: weeklyVp ? { poc: weeklyVp.poc, vah: weeklyVp.vah, val: weeklyVp.val } : null,
    liquiditySweeps,
    fundingSqueeze,
    sessionOpenDrive,
    trendMetrics,
  };
}

// Per-style reference TF for trend classification.
// scalp/day/swing use MTF (15M/1H/4H), position uses HTF (1D).
const TREND_REF_ROLE: Record<TradingStyle, "MTF" | "HTF"> = {
  scalp: "MTF",
  day: "MTF",
  swing: "MTF",
  position: "HTF",
};

function computeTrendMetrics(
  style: TradingStyle,
  tfData: Record<string, Array<{ open: number; high: number; low: number; close: number; volume: number; openTime: number }>>,
  tfs: Interval[],
): NonNullable<AnalysisSnapshot["trendMetrics"]> | undefined {
  const refRole = TREND_REF_ROLE[style];
  const refIdx = refRole === "HTF" ? 0 : 1;
  const refTf = tfs[refIdx];
  const candles = tfData[refTf];
  if (!candles || candles.length < 30) return undefined;
  const v = classifyTrendComposite(candles);
  return {
    refTf,
    adx: v.adx,
    ker: v.ker,
    choppiness: v.choppiness,
    classification: v.composite.classification,
    strength: v.composite.strength,
    trendVotes: v.composite.trendVotes,
    rangeVotes: v.composite.rangeVotes,
  };
}
