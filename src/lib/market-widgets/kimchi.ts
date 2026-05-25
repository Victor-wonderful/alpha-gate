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

/**
 * Upbit KRW 상장 + Binance USDT 현물 상장 모두 되는 메이저 코인.
 * 새 코인 추가 시 Upbit market 코드(`KRW-XXX`)와 Binance 심볼(`XXXUSDT`) 둘 다 존재 확인 필요.
 */
const PAIRS: { symbol: string; upbit: string; binance: string }[] = [
  { symbol: "BTC", upbit: "KRW-BTC", binance: "BTCUSDT" },
  { symbol: "ETH", upbit: "KRW-ETH", binance: "ETHUSDT" },
  { symbol: "XRP", upbit: "KRW-XRP", binance: "XRPUSDT" },
  { symbol: "SOL", upbit: "KRW-SOL", binance: "SOLUSDT" },
  { symbol: "DOGE", upbit: "KRW-DOGE", binance: "DOGEUSDT" },
  { symbol: "ADA", upbit: "KRW-ADA", binance: "ADAUSDT" },
  { symbol: "AVAX", upbit: "KRW-AVAX", binance: "AVAXUSDT" },
  { symbol: "LINK", upbit: "KRW-LINK", binance: "LINKUSDT" },
  { symbol: "DOT", upbit: "KRW-DOT", binance: "DOTUSDT" },
  { symbol: "TRX", upbit: "KRW-TRX", binance: "TRXUSDT" },
  { symbol: "BCH", upbit: "KRW-BCH", binance: "BCHUSDT" },
  { symbol: "NEAR", upbit: "KRW-NEAR", binance: "NEARUSDT" },
  { symbol: "ATOM", upbit: "KRW-ATOM", binance: "ATOMUSDT" },
  { symbol: "ETC", upbit: "KRW-ETC", binance: "ETCUSDT" },
  { symbol: "UNI", upbit: "KRW-UNI", binance: "UNIUSDT" },
  { symbol: "APT", upbit: "KRW-APT", binance: "APTUSDT" },
  { symbol: "SUI", upbit: "KRW-SUI", binance: "SUIUSDT" },
  { symbol: "ARB", upbit: "KRW-ARB", binance: "ARBUSDT" },
  { symbol: "SHIB", upbit: "KRW-SHIB", binance: "SHIBUSDT" },
  { symbol: "HBAR", upbit: "KRW-HBAR", binance: "HBARUSDT" },
  { symbol: "INJ", upbit: "KRW-INJ", binance: "INJUSDT" },
  { symbol: "SEI", upbit: "KRW-SEI", binance: "SEIUSDT" },
  { symbol: "TIA", upbit: "KRW-TIA", binance: "TIAUSDT" },
  { symbol: "STX", upbit: "KRW-STX", binance: "STXUSDT" },
  { symbol: "XLM", upbit: "KRW-XLM", binance: "XLMUSDT" },
  { symbol: "ALGO", upbit: "KRW-ALGO", binance: "ALGOUSDT" },
];

type UpbitTicker = { market: string; trade_price: number }[];
type BinanceTicker = { symbol: string; price: string };

/**
 * Upbit 마켓 화이트리스트 fetch + 상장된 페어만 필터.
 * 한 코인이라도 상장폐지되면 /v1/ticker 가 전체 404를 주는 문제 회피.
 */
async function getValidPairs(): Promise<typeof PAIRS> {
  try {
    const res = await fetch("https://api.upbit.com/v1/market/all", {
      next: { revalidate: 3600 }, // 1시간 캐시 — 상장은 자주 변하지 않음
    });
    if (!res.ok) return PAIRS;
    const all = (await res.json()) as { market: string }[];
    const krw = new Set(all.map((m) => m.market));
    return PAIRS.filter((p) => krw.has(p.upbit));
  } catch {
    return PAIRS;
  }
}

export async function fetchKimchiPremium(): Promise<KimchiPoint[]> {
  const pairs = await getValidPairs();
  if (pairs.length === 0) return [];
  const upbitMarkets = pairs.map((p) => p.upbit).join(",");
  const binanceSymbols = JSON.stringify(pairs.map((p) => p.binance));
  try {
    const [usdKrw, upbitRes, binanceRes] = await Promise.all([
      fetchUsdKrwRate(),
      fetch(`https://api.upbit.com/v1/ticker?markets=${upbitMarkets}`, {
        next: { revalidate: 60 },
      }),
      // Binance bulk price endpoint — 한 번에 여러 심볼 fetch
      fetch(
        `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(binanceSymbols)}`,
        { next: { revalidate: 60 } },
      ),
    ]);

    if (!upbitRes.ok) throw new Error("upbit");
    if (!binanceRes.ok) throw new Error("binance");

    const upbit = (await upbitRes.json()) as UpbitTicker;
    const upbitMap = new Map(upbit.map((u) => [u.market, u.trade_price]));

    const binance = (await binanceRes.json()) as BinanceTicker[];
    const binanceMap = new Map(binance.map((b) => [b.symbol, Number(b.price) || 0]));

    return pairs.map((pair) => {
      const upbitKrw = upbitMap.get(pair.upbit) ?? 0;
      const binanceUsd = binanceMap.get(pair.binance) ?? 0;
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
    }).filter((p) => p.upbitKrw > 0 && p.binanceUsd > 0);
  } catch {
    return [];
  }
}
