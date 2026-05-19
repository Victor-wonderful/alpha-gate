import "server-only";
import { unstable_cache } from "next/cache";
import type { Candle } from "./binance";

const FAPI = "https://fapi.binance.com";
const SPOT = "https://api.binance.com";
const FNG_URL = "https://api.alternative.me/fng/?limit=1";
const YAHOO_DXY = "https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?range=1d&interval=1d";

// ─── ATR (Average True Range) ─────────────────────────────────
/** Wilder's ATR over `period` bars. Returns absolute value + % of last close. */
export function computeATR(candles: Candle[], period = 14): { value: number; pctOfPrice: number } {
  if (candles.length < period + 1) return { value: 0, pctOfPrice: 0 };
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    trs.push(tr);
  }
  // Wilder's smoothing
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  const lastClose = candles[candles.length - 1].close;
  return {
    value: atr,
    pctOfPrice: lastClose > 0 ? (atr / lastClose) * 100 : 0,
  };
}

// ─── VWAP (since session start UTC midnight) ──────────────────
/** Session VWAP based on candles since UTC midnight. */
export function computeSessionVWAP(candles: Candle[]): { value: number; distancePct: number } {
  if (candles.length === 0) return { value: 0, distancePct: 0 };
  const todayUtcStart = new Date();
  todayUtcStart.setUTCHours(0, 0, 0, 0);
  const startMs = todayUtcStart.getTime();
  const today = candles.filter((c) => c.openTime >= startMs);
  const useSet = today.length >= 3 ? today : candles.slice(-24); // fallback: last 24 bars
  let pvSum = 0;
  let vSum = 0;
  for (const c of useSet) {
    const typical = (c.high + c.low + c.close) / 3;
    pvSum += typical * c.volume;
    vSum += c.volume;
  }
  const vwap = vSum > 0 ? pvSum / vSum : 0;
  const lastClose = candles[candles.length - 1].close;
  const distancePct = vwap > 0 ? ((lastClose - vwap) / vwap) * 100 : 0;
  return { value: vwap, distancePct };
}

// ─── Top Trader Long/Short Ratio ──────────────────────────────
async function jget<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

export type TopTraderRatio = {
  /** longShortRatio = long accounts / short accounts (top 20% by margin) */
  longShortRatio: number;
  longAccountPct: number;
  shortAccountPct: number;
};

export async function fetchTopTraderRatio(symbol: string, period: "5m" | "15m" | "1h" = "15m"): Promise<TopTraderRatio | null> {
  try {
    const data = await jget<Array<{ longShortRatio: string; longAccount: string; shortAccount: string }>>(
      `${FAPI}/futures/data/topLongShortPositionRatio?symbol=${symbol}&period=${period}&limit=1`,
    );
    if (!data.length) return null;
    const row = data[0];
    return {
      longShortRatio: Number(row.longShortRatio),
      longAccountPct: Number(row.longAccount) * 100,
      shortAccountPct: Number(row.shortAccount) * 100,
    };
  } catch {
    return null;
  }
}

// ─── Spot-Perp Basis ──────────────────────────────────────────
export type SpotPerpBasis = {
  spot: number;
  perp: number;
  premiumPct: number; // (perp - spot) / spot * 100
};

export async function fetchSpotPerpBasis(symbol: string, perpLast: number): Promise<SpotPerpBasis | null> {
  try {
    const data = await jget<{ price: string }>(`${SPOT}/api/v3/ticker/price?symbol=${symbol}`);
    const spot = Number(data.price);
    if (!Number.isFinite(spot) || spot === 0) return null;
    return {
      spot,
      perp: perpLast,
      premiumPct: ((perpLast - spot) / spot) * 100,
    };
  } catch {
    return null;
  }
}

// ─── Fear & Greed Index ───────────────────────────────────────
export type FearGreed = {
  value: number; // 0~100
  label: string; // "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed"
};

async function _fetchFearGreedUncached(): Promise<FearGreed | null> {
  try {
    const data = await jget<{ data: Array<{ value: string; value_classification: string }> }>(FNG_URL);
    if (!data.data?.length) return null;
    return {
      value: Number(data.data[0].value),
      label: data.data[0].value_classification,
    };
  } catch {
    return null;
  }
}

// F&G updates once per day — cache for 1 hour to be safe.
export const fetchFearGreed = unstable_cache(
  _fetchFearGreedUncached,
  ["fear-greed-v1"],
  { revalidate: 3600, tags: ["fng"] },
);

// ─── DXY (Dollar Index, Yahoo Finance) ────────────────────────
export type DXY = {
  value: number;
  change24hPct: number;
};

async function _fetchDXYUncached(): Promise<DXY | null> {
  try {
    const data = await jget<{
      chart: {
        result: Array<{
          meta: { regularMarketPrice: number; previousClose: number; chartPreviousClose: number };
        }>;
      };
    }>(YAHOO_DXY);
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const value = meta.regularMarketPrice;
    const prev = meta.previousClose ?? meta.chartPreviousClose;
    const change24hPct = prev > 0 ? ((value - prev) / prev) * 100 : 0;
    return { value, change24hPct };
  } catch {
    return null;
  }
}

// DXY moves slowly; refresh every 10 minutes.
export const fetchDXY = unstable_cache(
  _fetchDXYUncached,
  ["dxy-v1"],
  { revalidate: 600, tags: ["dxy"] },
);

// ─── Trading Session (Asia / EU / US / Off) ───────────────────
export type Session = {
  current: "Asia" | "EU" | "US" | "Off";
  minutesIntoSession: number;
  minutesToNext: number;
  nextSession: "Asia" | "EU" | "US" | "Off";
};

/** UTC time-based: Asia 00-07, EU 07-13, US 13-21, Off 21-24 (loose, but useful) */
export function detectSession(now = new Date()): Session {
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  const minutesUtc = h * 60 + m;
  type Window = { name: Session["current"]; startMin: number; endMin: number };
  const windows: Window[] = [
    { name: "Asia", startMin: 0, endMin: 7 * 60 },
    { name: "EU", startMin: 7 * 60, endMin: 13 * 60 },
    { name: "US", startMin: 13 * 60, endMin: 21 * 60 },
    { name: "Off", startMin: 21 * 60, endMin: 24 * 60 },
  ];
  const idx = windows.findIndex((w) => minutesUtc >= w.startMin && minutesUtc < w.endMin);
  const cur = windows[idx];
  const next = windows[(idx + 1) % windows.length];
  return {
    current: cur.name,
    minutesIntoSession: minutesUtc - cur.startMin,
    minutesToNext: cur.endMin - minutesUtc,
    nextSession: next.name,
  };
}

// ─── OI History (delta over time) ─────────────────────────────
export type OIDelta = {
  current: number;
  hourAgo: number | null;
  hourChangePct: number | null;
  fourHourChangePct: number | null;
};

export async function fetchOIDelta(symbol: string): Promise<OIDelta | null> {
  try {
    // 5m * 48 = last 4 hours
    const data = await jget<Array<{ sumOpenInterest: string; timestamp: number }>>(
      `${FAPI}/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=48`,
    );
    if (data.length < 2) return null;
    const current = Number(data[data.length - 1].sumOpenInterest);
    const hourIdx = Math.max(0, data.length - 13); // -12 => 60min ago
    const fourHourIdx = 0;
    const hourAgo = Number(data[hourIdx].sumOpenInterest);
    const fourHourAgo = Number(data[fourHourIdx].sumOpenInterest);
    return {
      current,
      hourAgo,
      hourChangePct: hourAgo > 0 ? ((current - hourAgo) / hourAgo) * 100 : null,
      fourHourChangePct: fourHourAgo > 0 ? ((current - fourHourAgo) / fourHourAgo) * 100 : null,
    };
  } catch {
    return null;
  }
}

// ─── Funding Rate History (last 3 = ~24h) ─────────────────────
export type FundingHistory = {
  /** Last 3 settled funding rates, oldest first */
  recent: Array<{ rate: number; time: number }>;
  /** Average over last 3 */
  avg24h: number;
  /** Current trajectory: 'rising' | 'falling' | 'flat' */
  trend: "rising" | "falling" | "flat";
};

export async function fetchFundingHistory(symbol: string): Promise<FundingHistory | null> {
  try {
    const data = await jget<Array<{ fundingRate: string; fundingTime: number }>>(
      `${FAPI}/fapi/v1/fundingRate?symbol=${symbol}&limit=3`,
    );
    if (!data.length) return null;
    const recent = data.map((d) => ({ rate: Number(d.fundingRate), time: d.fundingTime }));
    const avg = recent.reduce((s, r) => s + r.rate, 0) / recent.length;
    let trend: FundingHistory["trend"] = "flat";
    if (recent.length >= 2) {
      const diff = recent[recent.length - 1].rate - recent[0].rate;
      if (Math.abs(diff) > 0.00005) trend = diff > 0 ? "rising" : "falling";
    }
    return { recent, avg24h: avg, trend };
  } catch {
    return null;
  }
}

// ─── Multi-TF Volume Profile (Weekly POC) ─────────────────────
// reuses existing volume-profile.ts for computation
