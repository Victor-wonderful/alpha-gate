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
  /** 'live' = 실시간 분석, 'backtest' = 과거 시점 분석. 기존 저장본 호환을 위해 옵셔널. */
  mode?: "live" | "backtest";
  /** 백테스트 모드일 때 분석 기준 시각 (ISO). live는 null/undefined. */
  historicalAt?: string | null;
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
    /** 백테스트 모드에서 분석 ↔ forward 봉 경계 시각 (Unix 초). 차트에 수직선으로 표시. */
    boundaryTime?: number;
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
}

export interface BuildSnapshotOptions {
  /** 백테스트 모드 — 이 시점까지의 데이터로만 분석. 미지정 시 현재. */
  at?: Date;
}

export async function buildSnapshot(
  symbol: string,
  style: TradingStyle = "swing",
  options: BuildSnapshotOptions = {},
): Promise<AnalysisSnapshot> {
  const sym = symbol.toUpperCase();
  const preset = STYLE_PRESETS[style];
  const tfs = tfsForStyle(style); // HTF, MTF, LTF
  const ROLES: ("HTF" | "MTF" | "LTF")[] = ["HTF", "MTF", "LTF"];

  // Make sure we also fetch the volume-profile TF if it's different
  const allTfs = Array.from(new Set([...tfs, preset.volumeProfileTf])) as Interval[];

  const isBacktest = !!options.at;
  const endTime = options.at?.getTime();

  // 모든 kline fetch에 endTime 전달 (백테스트면 그 시점까지만)
  const klineRange = endTime ? { endTime } : undefined;

  // 백테스트 모드에서는 라이브 전용 데이터(depth/aggTrades/snapshot OI/F&G 등)는 스킵하고
  // 캔들/펀딩 history 등 historical-safe 데이터만 가져옴.
  const [
    ticker,
    depth,
    trades,
    funding,
    oi,
    btcd,
    topTraderRatio,
    fearGreed,
    dxy,
    oiDelta,
    fundingHistory,
    weeklyCandles,
    ...klineSets
  ] = await Promise.all([
    isBacktest
      ? Promise.resolve(null)
      : fetchTicker24h(sym),
    isBacktest
      ? Promise.resolve({ bids: [], asks: [] } as Awaited<ReturnType<typeof fetchDepth>>)
      : fetchDepth(sym, 100),
    isBacktest
      ? Promise.resolve([] as Awaited<ReturnType<typeof fetchAggTrades>>)
      : fetchAggTrades(sym, 500),
    isBacktest
      ? Promise.resolve({ rate: 0, nextFundingTime: 0 } as Awaited<ReturnType<typeof fetchFundingRate>>)
      : fetchFundingRate(sym),
    isBacktest
      ? Promise.resolve(0 as Awaited<ReturnType<typeof fetchOpenInterest>>)
      : fetchOpenInterest(sym),
    isBacktest
      ? Promise.resolve(null)
      : fetchBtcDominance(),
    isBacktest
      ? Promise.resolve(null)
      : fetchTopTraderRatio(sym, "15m"),
    isBacktest
      ? Promise.resolve(null)
      : fetchFearGreed(),
    isBacktest
      ? Promise.resolve(null)
      : fetchDXY(),
    isBacktest
      ? Promise.resolve(null)
      : fetchOIDelta(sym),
    isBacktest
      ? Promise.resolve(null as Awaited<ReturnType<typeof fetchFundingHistory>>)
      : fetchFundingHistory(sym),
    fetchKlines(sym, "1d", 200, klineRange), // for weekly volume profile
    ...allTfs.map((tf) => fetchKlines(sym, tf, 300, klineRange)),
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

  // 백테스트 모드: 분석 시점 이후 forward 봉도 추가로 가져와서 차트에 표시
  // 분석에는 사용되지 않음 (lookahead 방지) — 순수 시각화 + 시뮬 마커 매핑 용도
  let forwardCandlesByTf: Record<string, typeof klineSets[number]> | null = null;
  if (isBacktest && endTime) {
    const maxForwardMs = 24 * 30 * 60 * 60 * 1000; // 30일
    const forwardStart = endTime + 1;
    const forwardEnd = Math.min(forwardStart + maxForwardMs, Date.now());
    if (forwardEnd > forwardStart) {
      const sets = await Promise.all(
        allTfs.map((tf) =>
          fetchKlines(sym, tf, 500, { startTime: forwardStart, endTime: forwardEnd }).catch(() => []),
        ),
      );
      forwardCandlesByTf = {};
      allTfs.forEach((tf, i) => {
        forwardCandlesByTf![tf] = sets[i];
      });
    }
  }

  // Chart candles for all 3 TFs (last 250 bars each + forward bars in backtest mode). MTF is the default.
  const buildChartCandles = (tf: Interval) => {
    const raw = (tfData as Record<string, (typeof klineSets)[number]>)[tf];
    const base = raw.slice(-250).map((c) => ({
      time: Math.floor(c.openTime / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    // 백테스트면 forward 봉도 append
    const forward = forwardCandlesByTf?.[tf];
    if (forward && forward.length > 0) {
      const baseLastTime = base.length > 0 ? base[base.length - 1].time : 0;
      const forwardMapped = forward
        .map((c) => ({
          time: Math.floor(c.openTime / 1000),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
        .filter((c) => c.time > baseLastTime); // 중복 봉 제거 (lightweight-charts 요구사항)
      return [...base, ...forwardMapped];
    }
    return base;
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
    /** 백테스트 모드일 때 분석/forward 경계 시각 (Unix 초). 차트에 수직선으로 표시. */
    boundaryTime: isBacktest && endTime ? Math.floor(endTime / 1000) : undefined,
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

  // 백테스트 모드: ticker는 마지막 MTF 캔들에서 파생, basis/session도 그 시점 기준
  const lastMtfCandle = mtfCandles[mtfCandles.length - 1];
  const fallbackLast = lastMtfCandle?.close ?? 0;
  const tickerData = ticker ?? {
    lastPrice: fallbackLast,
    priceChangePercent: 0,
    highPrice: fallbackLast,
    lowPrice: fallbackLast,
    volume: 0,
  };

  // Spot-Perp basis — 백테스트에서는 historical spot 데이터 어려워 null 처리
  const basis = isBacktest ? null : await fetchSpotPerpBasis(sym, tickerData.lastPrice);

  // Trading session — 백테스트면 분석 시점 기준
  const session = detectSession(options.at ?? new Date());

  // Weekly volume profile (using daily candles, group by 7)
  const weeklyVp = weeklyCandles.length >= 14 ? computeVolumeProfile(weeklyCandles, 60, 0.7) : null;

  return {
    symbol: sym,
    generatedAt: (options.at ?? new Date()).toISOString(),
    style,
    styleLabel: preset.label,
    mode: isBacktest ? "backtest" : "live",
    historicalAt: options.at?.toISOString() ?? null,
    ticker: {
      last: tickerData.lastPrice,
      change24hPct: tickerData.priceChangePercent,
      high24h: tickerData.highPrice,
      low24h: tickerData.lowPrice,
      volume24h: tickerData.volume,
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
      btcDominance: btcd,
      dxy,
      fearGreed,
    },
    atr,
    vwap,
    topTraderRatio,
    basis,
    session,
    weeklyVolumeProfile: weeklyVp ? { poc: weeklyVp.poc, vah: weeklyVp.vah, val: weeklyVp.val } : null,
  };
}
