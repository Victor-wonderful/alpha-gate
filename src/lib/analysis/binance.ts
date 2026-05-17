import "server-only";

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

export type Interval = "5m" | "15m" | "1h" | "4h" | "1d";

async function jget<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function fetchKlines(symbol: string, interval: Interval, limit = 300): Promise<Candle[]> {
  const raw = await jget<unknown[][]>(
    `${FAPI}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
  );
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

export async function fetchBtcDominance(): Promise<number | null> {
  try {
    const raw = await jget<{ data: { market_cap_percentage: { btc: number } } }>(
      "https://api.coingecko.com/api/v3/global",
    );
    return raw.data.market_cap_percentage.btc;
  } catch {
    return null;
  }
}
