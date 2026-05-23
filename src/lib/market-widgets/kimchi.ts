// Kimchi Premium fetcher — Upbit KRW price vs Binance USD price × USD/KRW rate.
// All endpoints free, no auth.

import { fetchUsdKrwRate } from "./fx";

export type KimchiPoint = {
  symbol: string;
  upbitKrw: number;
  binanceUsd: number;
  usdKrwRate: number;
  fairKrw: number; // binanceUsd × usdKrwRate
  premiumPct: number; // (upbitKrw - fairKrw) / fairKrw × 100
  premiumKrw: number;
};

const PAIRS: { symbol: string; upbit: string; binance: string }[] = [
  { symbol: "BTC", upbit: "KRW-BTC", binance: "BTCUSDT" },
  { symbol: "ETH", upbit: "KRW-ETH", binance: "ETHUSDT" },
  { symbol: "XRP", upbit: "KRW-XRP", binance: "XRPUSDT" },
];


type UpbitTicker = { market: string; trade_price: number }[];
type BinanceTicker = { symbol: string; price: string };

export async function fetchKimchiPremium(): Promise<KimchiPoint[]> {
  const upbitMarkets = PAIRS.map((p) => p.upbit).join(",");
  try {
    const [usdKrw, upbitRes, ...binanceResList] = await Promise.all([
      fetchUsdKrwRate(),
      fetch(`https://api.upbit.com/v1/ticker?markets=${upbitMarkets}`, {
        next: { revalidate: 60 },
      }),
      ...PAIRS.map((p) =>
        fetch(
          `https://api.binance.com/api/v3/ticker/price?symbol=${p.binance}`,
          { next: { revalidate: 60 } },
        ),
      ),
    ]);

    if (!upbitRes.ok) throw new Error("upbit");
    const upbit = (await upbitRes.json()) as UpbitTicker;
    const upbitMap = new Map(upbit.map((u) => [u.market, u.trade_price]));

    const binancePrices = await Promise.all(
      binanceResList.map(async (r) => {
        if (!r.ok) return 0;
        const j = (await r.json()) as BinanceTicker;
        return Number(j.price) || 0;
      }),
    );

    return PAIRS.map((pair, i) => {
      const upbitKrw = upbitMap.get(pair.upbit) ?? 0;
      const binanceUsd = binancePrices[i] ?? 0;
      const fairKrw = binanceUsd * usdKrw;
      const premiumKrw = upbitKrw - fairKrw;
      const premiumPct = fairKrw > 0 ? (premiumKrw / fairKrw) * 100 : 0;
      return {
        symbol: pair.symbol,
        upbitKrw,
        binanceUsd,
        usdKrwRate: usdKrw,
        fairKrw,
        premiumPct,
        premiumKrw,
      };
    });
  } catch {
    return [];
  }
}
