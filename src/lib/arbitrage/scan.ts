import "server-only";
import { fetchKimchiPremium } from "@/lib/market-widgets/kimchi";

export {
  KIMCHI_ENTRY_BAND_DEFAULT_PCT,
  KIMCHI_BAND_MIN_PCT,
  KIMCHI_BAND_MAX_PCT,
  KIMCHI_TARGET_OFFSET_PCT,
  KIMCHI_MAX_TARGET_PCT,
} from "./constants";

/**
 * 김치 프리미엄 차익거래 — 진입 후보.
 *
 * 전략:
 *   사용자가 슬라이더로 진입 밴드(|김프| 상한) 설정 → 그 안의 코인만 진입 후보.
 *   진입 시 청산 목표 김프 지정 (기본 = 진입 김프 + 1.5%p).
 *   방향은 항상 Upbit Long + Binance Short (perp).
 *
 * 수익 메커니즘:
 *   진입 김프 e, 청산 김프 t 일 때 PnL ≈ (t - e)/100 × notional.
 *   업비트(KRW) 가격 ↑ - 바이낸스(USD) 가격 ≈ 동일 → Upbit Long 이득, Binance Short 손실,
 *   순합이 김프 변화량만큼.
 */
export interface KimchiOpportunity {
  symbol: string;
  premiumPct: number; // signed (+ = Upbit 비쌈, - = Binance 비쌈)
  upbitKrw: number;
  binanceUsd: number;
  fairKrw: number;
  usdKrwRate: number;
  /** 항상 'upbit' */
  longExchange: "upbit";
  /** Upbit KRW 가격을 USD 환산 */
  longPrice: number;
  /** 항상 'binance' (perp 시뮬레이션) */
  shortExchange: "binance";
  shortPrice: number;
}

/** 전체 페어 김프 — 필터 없이 |값| 작은 순 정렬. 클라이언트가 슬라이더로 필터. */
export async function scanKimchi(): Promise<KimchiOpportunity[]> {
  const points = await fetchKimchiPremium();
  return points
    .map(
      (p): KimchiOpportunity => ({
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
      }),
    )
    .sort((a, b) => Math.abs(a.premiumPct) - Math.abs(b.premiumPct));
}

/**
 * 현재 김프 맵 — symbol → premiumPct. 활성 포지션의 진행률 계산에 사용.
 */
export async function fetchCurrentPremiums(): Promise<Map<string, number>> {
  const points = await fetchKimchiPremium();
  const m = new Map<string, number>();
  for (const p of points) m.set(p.symbol, p.premiumPct);
  return m;
}
