import "server-only";
import { fetchKimchiPremium } from "@/lib/market-widgets/kimchi";

/** 김치 프리미엄 차익 기회 — 김프 절대값이 0.3% 이상인 코인만. */
export interface KimchiOpportunity {
  symbol: string;
  premiumPct: number; // signed (+ = Upbit 비쌈, - = Binance 비쌈)
  upbitKrw: number;
  binanceUsd: number;
  fairKrw: number;
  usdKrwRate: number;
  /** 어느 쪽이 cheap = long leg */
  longExchange: "binance" | "upbit";
  longPrice: number;
  shortExchange: "binance" | "upbit";
  shortPrice: number;
}

export async function scanKimchi(): Promise<KimchiOpportunity[]> {
  const points = await fetchKimchiPremium();
  return points
    .filter((p) => Math.abs(p.premiumPct) >= 0.3)
    .map((p): KimchiOpportunity => {
      // 김프 > 0: Upbit 비쌈 → Upbit short, Binance long
      // 김프 < 0: Binance 비쌈 → Binance short, Upbit long
      if (p.premiumPct > 0) {
        return {
          symbol: p.symbol,
          premiumPct: p.premiumPct,
          upbitKrw: p.upbitKrw,
          binanceUsd: p.binanceUsd,
          fairKrw: p.fairKrw,
          usdKrwRate: p.usdKrwRate,
          longExchange: "binance",
          longPrice: p.binanceUsd,
          shortExchange: "upbit",
          shortPrice: p.upbitKrw / p.usdKrwRate, // USD 환산
        };
      } else {
        return {
          symbol: p.symbol,
          premiumPct: p.premiumPct,
          upbitKrw: p.upbitKrw,
          binanceUsd: p.binanceUsd,
          fairKrw: p.fairKrw,
          usdKrwRate: p.usdKrwRate,
          longExchange: "upbit",
          longPrice: p.upbitKrw / p.usdKrwRate,
          shortExchange: "binance",
          shortPrice: p.binanceUsd,
        };
      }
    })
    .sort((a, b) => Math.abs(b.premiumPct) - Math.abs(a.premiumPct));
}
