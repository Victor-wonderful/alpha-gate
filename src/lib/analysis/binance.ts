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

/** 현물(SPOT) 일봉. DCA는 현물 적립이라 선물이 아니라 현물 시세·상장 이력을 봐야 한다.
 *  현물 마켓이 없으면 Binance가 400을 주므로, 그 자체가 자산 게이트의 판정 근거가 된다.
 *  cf. docs/DCA-모드-설계.md G1 */
export async function fetchSpotKlines(
  symbol: string,
  interval: Interval = "1d",
  limit = 1000,
): Promise<Candle[]> {
  const params = new URLSearchParams({ symbol, interval, limit: String(limit) });
  const raw = await jget<unknown[][]>(`${SPOT}/api/v3/klines?${params.toString()}`);
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

/** Bulk 24h ticker for ALL symbols (no symbol param). Used by the candidate radar
 *  to rank the universe by quote volume in a single request. */
export type BulkTicker = {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  quoteVolume: number; // USD-ish notional traded in 24h
};

export async function fetchAllTickers24h(): Promise<BulkTicker[]> {
  const raw = await jget<
    {
      symbol: string;
      lastPrice: string;
      priceChangePercent: string;
      highPrice: string;
      lowPrice: string;
      quoteVolume: string;
    }[]
  >(`${FAPI}/fapi/v1/ticker/24hr`, 12000);
  return raw.map((t) => ({
    symbol: t.symbol,
    lastPrice: Number(t.lastPrice),
    priceChangePercent: Number(t.priceChangePercent),
    highPrice: Number(t.highPrice),
    lowPrice: Number(t.lowPrice),
    quoteVolume: Number(t.quoteVolume),
  }));
}

/** Set of tradeable CRYPTO USDT-perpetual symbols (underlyingType COIN).
 *  Excludes Binance's TradFi perps (gold/silver/equities = TRADIFI_PERPETUAL,
 *  underlyingType COMMODITY/EQUITY) and index products. Cached 1h — listings change rarely. */
async function _fetchCryptoPerpSymbolsUncached(): Promise<string[]> {
  const raw = await jget<{
    symbols: {
      symbol: string;
      contractType: string;
      underlyingType: string;
      status: string;
      quoteAsset: string;
    }[];
  }>(`${FAPI}/fapi/v1/exchangeInfo`, 15000);
  return raw.symbols
    .filter(
      (s) =>
        s.contractType === "PERPETUAL" &&
        s.underlyingType === "COIN" &&
        s.status === "TRADING" &&
        s.quoteAsset === "USDT",
    )
    .map((s) => s.symbol);
}

export const fetchCryptoPerpSymbols = unstable_cache(
  _fetchCryptoPerpSymbolsUncached,
  ["crypto-perp-symbols-v1"],
  { revalidate: 3600, tags: ["exchange-info"] },
);

/** Bulk funding/mark for ALL symbols (no symbol param). One request → map symbol→rate. */
export async function fetchAllFunding(): Promise<Record<string, number>> {
  const raw = await jget<{ symbol: string; lastFundingRate: string }[]>(
    `${FAPI}/fapi/v1/premiumIndex`,
    12000,
  );
  const out: Record<string, number> = {};
  for (const r of raw) out[r.symbol] = Number(r.lastFundingRate);
  return out;
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
