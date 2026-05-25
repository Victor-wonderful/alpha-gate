import "server-only";
import { fetchKimchiPremium } from "@/lib/market-widgets/kimchi";
import type { KimchiOpportunity } from "./constants";

export type { KimchiOpportunity } from "./constants";
export {
  KIMCHI_TARGET_OFFSET_PCT,
  KIMCHI_MAX_TARGET_PCT,
  arbitragePnl,
  targetReached,
} from "./constants";

/**
 * 김치 프리미엄 차익거래 — 단방향 (Upbit Long + Binance Short 고정).
 * |김프| 작은 순 정렬. 클라이언트가 필요시 필터링.
 */
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

/** 현재 김프 맵 — symbol → premiumPct. 활성 포지션 PnL 계산용. */
export async function fetchCurrentPremiums(): Promise<Map<string, number>> {
  const points = await fetchKimchiPremium();
  const m = new Map<string, number>();
  for (const p of points) m.set(p.symbol, p.premiumPct);
  return m;
}
