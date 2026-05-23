// Shared USD/KRW rate fetcher used by:
//  - Kimchi premium card (the reference rate)
//  - Technicals table (KRW price column)
//
// Source priority:
//  1. Upbit KRW-USDT trade_price  → market-actual rate Korean crypto
//     traders are arbitraging against (this is what defines the real
//     kimchi premium, not the interbank FX rate).
//  2. open.er-api.com USD→KRW     → interbank fallback if Upbit fails.
//  3. Static 1350                 → last-resort floor so KRW cells render.

type UpbitTicker = { market: string; trade_price: number }[];
type ErApi = { result?: string; rates?: { KRW?: number } };

async function fromUpbit(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.upbit.com/v1/ticker?markets=KRW-USDT",
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as UpbitTicker;
    const p = json[0]?.trade_price;
    return typeof p === "number" && p > 500 && p < 5000 ? p : null;
  } catch {
    return null;
  }
}

async function fromErApi(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://open.er-api.com/v6/latest/USD",
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as ErApi;
    const k = json.rates?.KRW;
    return typeof k === "number" && k > 500 && k < 5000 ? k : null;
  } catch {
    return null;
  }
}

export async function fetchUsdKrwRate(): Promise<number> {
  return (await fromUpbit()) ?? (await fromErApi()) ?? 1350;
}
