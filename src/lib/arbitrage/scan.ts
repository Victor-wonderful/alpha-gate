import "server-only";
import { fetchKimchiPremium, type KimchiPoint } from "@/lib/market-widgets/kimchi";

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

/** 펀딩비 차익 기회 — |펀딩비| 가 0.01% 이상인 상위 코인. */
export interface FundingOpportunity {
  symbol: string;
  fundingPct: number; // per 8h, % (예: 0.05 = 0.05%)
  annualPct: number; // funding × 3 × 365
  markPrice: number; // perp
  indexPrice: number; // spot index
  basisPct: number; // (mark - index) / index × 100
  nextFundingMinutes: number;
  /** 펀딩 > 0: Spot long + Perp short → 펀딩 수취
   *  펀딩 < 0: Spot short + Perp long → 역방향 수취 */
  longExchange: "binance_spot" | "binance_perp";
  longPrice: number;
  shortExchange: "binance_spot" | "binance_perp";
  shortPrice: number;
}

interface PremiumIndexRow {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
  time: number;
}

export async function scanFunding(topN = 12): Promise<FundingOpportunity[]> {
  try {
    const res = await fetch("https://fapi.binance.com/fapi/v1/premiumIndex", {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const all = (await res.json()) as PremiumIndexRow[];

    const rows = all
      .filter((r) => r.symbol.endsWith("USDT"))
      .map((r) => ({
        symbol: r.symbol.replace(/USDT$/, ""),
        fundingPct: Number(r.lastFundingRate) * 100, // → %
        markPrice: Number(r.markPrice),
        indexPrice: Number(r.indexPrice),
        nextFundingMs: Number(r.nextFundingTime),
      }))
      .filter((r) => Math.abs(r.fundingPct) >= 0.01 && r.indexPrice > 0)
      .sort((a, b) => Math.abs(b.fundingPct) - Math.abs(a.fundingPct))
      .slice(0, topN);

    return rows.map((r): FundingOpportunity => {
      const basisPct =
        r.indexPrice > 0 ? ((r.markPrice - r.indexPrice) / r.indexPrice) * 100 : 0;
      const annualPct = r.fundingPct * 3 * 365;
      const nextFundingMinutes = Math.max(
        0,
        Math.round((r.nextFundingMs - Date.now()) / 60_000),
      );
      const positiveFunding = r.fundingPct > 0;
      return {
        symbol: r.symbol,
        fundingPct: r.fundingPct,
        annualPct,
        markPrice: r.markPrice,
        indexPrice: r.indexPrice,
        basisPct,
        nextFundingMinutes,
        // 양수 펀딩: spot long + perp short → spot 비쌈/저렴 무관, 펀딩 수취가 목적
        longExchange: positiveFunding ? "binance_spot" : "binance_perp",
        longPrice: positiveFunding ? r.indexPrice : r.markPrice,
        shortExchange: positiveFunding ? "binance_perp" : "binance_spot",
        shortPrice: positiveFunding ? r.markPrice : r.indexPrice,
      };
    });
  } catch {
    return [];
  }
}
