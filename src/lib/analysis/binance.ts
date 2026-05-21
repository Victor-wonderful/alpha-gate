import "server-only";
import { unstable_cache } from "next/cache";

const FAPI = "https://fapi.binance.com"; // USDT-M Futures
const SPOT = "https://api.binance.com";

export type Candle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  buyVolume: number; // taker buy base
};

export type Interval = "1m" | "3m" | "5m" | "15m" | "1h" | "4h" | "1d";

async function jget<T>(url: string, timeoutMs = 8000): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function fetchKlines(
  symbol: string,
  interval: Interval,
  limit = 300,
  opts?: { startTime?: number; endTime?: number },
): Promise<Candle[]> {
  const params = new URLSearchParams({ symbol, interval, limit: String(limit) });
  if (opts?.startTime) params.set("startTime", String(opts.startTime));
  if (opts?.endTime) params.set("endTime", String(opts.endTime));
  const raw = await jget<unknown[][]>(`${FAPI}/fapi/v1/klines?${params.toString()}`);
  return raw.map((r) => ({
    openTime: Number(r[0]),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
    closeTime: Number(r[6]),
    buyVolume: Number(r[9]),
  }));
}

export type Depth = {
  bids: [number, number][];
  asks: [number, number][];
};

export async function fetchDepth(symbol: string, limit = 50): Promise<Depth> {
  const raw = await jget<{ bids: [string, string][]; asks: [string, string][] }>(
    `${FAPI}/fapi/v1/depth?symbol=${symbol}&limit=${limit}`,
  );
  return {
    bids: raw.bids.map(([p, q]) => [Number(p), Number(q)]),
    asks: raw.asks.map(([p, q]) => [Number(p), Number(q)]),
  };
}

export type AggTrade = { price: number; qty: number; isBuyerMaker: boolean; time: number };

export async function fetchAggTrades(symbol: string, limit = 500): Promise<AggTrade[]> {
  const raw = await jget<{ p: string; q: string; m: boolean; T: number }[]>(
    `${FAPI}/fapi/v1/aggTrades?symbol=${symbol}&limit=${limit}`,
  );
  return raw.map((t) => ({
    price: Number(t.p),
    qty: Number(t.q),
    isBuyerMaker: t.m,
    time: t.T,
  }));
}

export async function fetchFundingRate(symbol: string): Promise<{ rate: number; nextFundingTime: number; markPrice: number }> {
  const raw = await jget<{ lastFundingRate: string; nextFundingTime: number; markPrice: string }>(
    `${FAPI}/fapi/v1/premiumIndex?symbol=${symbol}`,
  );
  return {
    rate: Number(raw.lastFundingRate),
    nextFundingTime: raw.nextFundingTime,
    markPrice: Number(raw.markPrice),
  };
}

export async function fetchOpenInterest(symbol: string): Promise<number> {
  const raw = await jget<{ openInterest: string }>(`${FAPI}/fapi/v1/openInterest?symbol=${symbol}`);
  return Number(raw.openInterest);
}

export async function fetchTicker24h(symbol: string): Promise<{
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
}> {
  const raw = await jget<{
    lastPrice: string;
    priceChangePercent: string;
    highPrice: string;
    lowPrice: string;
    volume: string;
  }>(`${FAPI}/fapi/v1/ticker/24hr?symbol=${symbol}`);
  return {
    lastPrice: Number(raw.lastPrice),
    priceChangePercent: Number(raw.priceChangePercent),
    highPrice: Number(raw.highPrice),
    lowPrice: Number(raw.lowPrice),
    volume: Number(raw.volume),
  };
}

export interface MarketDominance {
  btc: number;
  eth: number;
  usdt: number;
  /** USDT + USDC + BUSD + DAI + others (sum of stablecoin %) */
  stablecoin: number;
  /** Total crypto market cap (USD) */
  totalMcapUsd: number;
  /** Total market cap 24h % change */
  totalMcap24hChangePct: number;
}

async function _fetchMarketDominanceUncached(): Promise<MarketDominance | null> {
  try {
    const raw = await jget<{
      data: {
        market_cap_percentage: Record<string, number>;
        total_market_cap: { usd: number };
        market_cap_change_percentage_24h_usd: number;
      };
    }>("https://api.coingecko.com/api/v3/global");
    const mcp = raw.data.market_cap_percentage;
    const stableKeys = ["usdt", "usdc", "busd", "dai", "tusd", "usdp", "frax", "lusd"];
    const stablecoinTotal = stableKeys.reduce((sum, k) => sum + (mcp[k] ?? 0), 0);
    return {
      btc: mcp.btc ?? 0,
      eth: mcp.eth ?? 0,
      usdt: mcp.usdt ?? 0,
      stablecoin: Number(stablecoinTotal.toFixed(2)),
      totalMcapUsd: raw.data.total_market_cap.usd ?? 0,
      totalMcap24hChangePct: raw.data.market_cap_change_percentage_24h_usd ?? 0,
    };
  } catch {
    return null;
  }
}

// 5-minute cache for CoinGecko /global — dominance/total mcap change slowly.
// Free tier is 10~30/min; caching makes us safely under that even with many users.
export const fetchMarketDominance = unstable_cache(
  _fetchMarketDominanceUncached,
  ["market-dominance-v1"],
  { revalidate: 300, tags: ["dominance"] },
);

/** Legacy single-field helper — delegates to the cached fetcher to avoid duplicate API calls. */
export async function fetchBtcDominance(): Promise<number | null> {
  const d = await fetchMarketDominance();
  return d?.btc ?? null;
}
