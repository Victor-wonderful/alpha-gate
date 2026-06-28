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
import {
  detectVolSqueeze,
  detectSigma,
  computeConfluence,
  type DirectionalVote,
  type DetectorSignals,
} from "./detectors";
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
  /** 코드 결정론 신호 (변동성수축돌파/과매도과매수/컨플루언스) — LLM 시나리오 근거 입력 */
  detectors?: DetectorSignals;
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

export interface BuildSnapshotOptions {
  /** 백테스트 모드 — 이 시점까지의 데이터로만 분석. 미지정 시 현재(라이브). */
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
  // kline fetch 옵션 — 백테스트면 endTime으로 historical 캔들만
  const klineRange = endTime ? { endTime } : undefined;

  // 라이브 전용 데이터 — 백테스트 시 과거 시점 복원 불가하므로 fallback (null/zero).
  const liveOrNull = <T>(fn: () => Promise<T>): Promise<T | null> =>
    isBacktest ? Promise.resolve(null) : fn().catch(() => null);

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
    liveOrNull(() => fetchDepth(sym, 100)),
    liveOrNull(() => fetchAggTrades(sym, 500)),
    liveOrNull(() => fetchFundingRate(sym)),
    liveOrNull(() => fetchOpenInterest(sym)),
    liveOrNull(() => fetchMarketDominance()),
    liveOrNull(() => fetchTopTraderRatio(sym, "15m")),
    liveOrNull(() => fetchFearGreed()),
    liveOrNull(() => fetchDXY()),
    liveOrNull(() => fetchOIDelta(sym)),
    fetchFundingHistory(sym).catch(() => null), // 펀딩 히스토리는 과거값이라 백테스트도 사용 가능
    fetchKlines(sym, "1d", 200, klineRange), // for weekly volume profile (200 daily ≈ 28 weeks)
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
  // 백테스트 모드에선 분석 시점(historical) 경계를 차트에 표시 (수직선)
  const boundaryTime = endTime ? Math.floor(endTime / 1000) : undefined;
  const mtfChart = {
    tf: mtfTf,
    candles: buildChartCandles(mtfTf),
    byRole: {
      HTF: { tf: preset.htf, candles: buildChartCandles(preset.htf) },
      MTF: { tf: preset.mtf, candles: buildChartCandles(preset.mtf) },
      LTF: { tf: preset.ltf, candles: buildChartCandles(preset.ltf) },
    },
    ...(boundaryTime ? { boundaryTime } : {}),
  };
  // 백테스트 모드: live 전용 데이터 fallback
  const flow = trades ? summarizeFlow(trades) : {
    buyVolume: 0, sellVolume: 0, buyRatio: 0.5, largeBuys: 0, largeSells: 0, largestTradeUsd: 0,
  };
  const depthSum = depth ? summarizeDepth(depth) : {
    bestBid: 0, bestAsk: 0, spreadBps: 0, bidWalls: [], askWalls: [], imbalance: 0,
  };
  const fundBias = funding ? classifyFunding(funding.rate) : { label: "데이터 없음", direction: "neutral" as const };

  // ATR per TF
  const atr = tfs.map((tf, i) => {
    const candles = (tfData as Record<string, (typeof klineSets)[number]>)[tf];
    const a = computeATR(candles, 14);
    return { tf, role: ROLES[i], pctOfPrice: a.pctOfPrice, value: a.value };
  });

  // Session VWAP based on MTF candles
  const mtfCandles = (tfData as Record<string, (typeof klineSets)[number]>)[preset.mtf];
  const vwap = computeSessionVWAP(mtfCandles);

  // Spot-Perp basis (depends on ticker.lastPrice) — 백테스트에선 과거 spot-perp 비교 불가, 스킵
  const basis = isBacktest ? null : await fetchSpotPerpBasis(sym, ticker.lastPrice).catch(() => null);

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
    fundingRate: funding?.rate ?? 0,
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

  // 코드 결정론 신호 detector (MTF 기준) — LLM 컨플루언스 입력. 휴리스틱 아님, 객관 신호.
  const volSqueeze = detectVolSqueeze(mtfCandles);
  const sigma = detectSigma(mtfCandles);
  const confluenceVotes: DirectionalVote[] = [];
  if (trendMetrics?.classification === "up") confluenceVotes.push({ name: "추세", side: "long" });
  else if (trendMetrics?.classification === "down") confluenceVotes.push({ name: "추세", side: "short" });
  if (volSqueeze.active) confluenceVotes.push({ name: "변동성수축돌파", side: "long" });
  if (sigma.active && sigma.side) confluenceVotes.push({ name: "과매도과매수", side: sigma.side });
  if (flow.buyRatio >= 0.58) confluenceVotes.push({ name: "체결흐름", side: "long" });
  else if (flow.buyRatio <= 0.42) confluenceVotes.push({ name: "체결흐름", side: "short" });
  const detectors: DetectorSignals = { volSqueeze, sigma, confluence: computeConfluence(confluenceVotes) };

  // 백테스트 모드면 ticker를 historical 캔들에서 재구성 (live ticker는 현재값이라 부정확)
  let tickerSnap: AnalysisSnapshot["ticker"];
  if (isBacktest) {
    const mtfCandlesForTicker = (tfData as Record<string, (typeof klineSets)[number]>)[preset.mtf];
    const last = mtfCandlesForTicker[mtfCandlesForTicker.length - 1];
    const first = mtfCandlesForTicker[Math.max(0, mtfCandlesForTicker.length - 24)] ?? last;
    const change = first && last && first.close > 0 ? ((last.close - first.close) / first.close) * 100 : 0;
    const recent = mtfCandlesForTicker.slice(-24);
    tickerSnap = {
      last: last.close,
      change24hPct: change,
      high24h: recent.length ? Math.max(...recent.map((c) => c.high)) : last.high,
      low24h: recent.length ? Math.min(...recent.map((c) => c.low)) : last.low,
      volume24h: recent.reduce((a, c) => a + c.volume, 0),
    };
  } else {
    tickerSnap = {
      last: ticker.lastPrice,
      change24hPct: ticker.priceChangePercent,
      high24h: ticker.highPrice,
      low24h: ticker.lowPrice,
      volume24h: ticker.volume,
    };
  }

  return {
    symbol: sym,
    generatedAt: isBacktest && options.at ? options.at.toISOString() : new Date().toISOString(),
    style,
    styleLabel: preset.label,
    mode: isBacktest ? "backtest" : "live",
    historicalAt: isBacktest && options.at ? options.at.toISOString() : null,
    ticker: tickerSnap,
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
    funding: {
      rate: funding?.rate ?? 0,
      nextFundingTime: funding?.nextFundingTime ?? 0,
      bias: fundBias.label,
    },
    fundingHistory,
    openInterest: oi ?? 0,
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
    detectors,
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
