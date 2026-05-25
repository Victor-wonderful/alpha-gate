/** 청산 목표 = 진입 김프 + 이 값 (기본 +1.5%p). */
export const KIMCHI_TARGET_OFFSET_PCT = 1.5;
/** 청산 목표 김프 최댓값 (%). */
export const KIMCHI_MAX_TARGET_PCT = 20;

/**
 * 김프 차익거래 — 진입 후보 (client + server 공통 타입).
 * 방향 고정: Upbit Long + Binance Short.
 * 김프 +방향으로 벌어지면 수익, -방향이면 손실.
 */
export interface KimchiOpportunity {
  symbol: string;
  premiumPct: number; // signed (+ = Upbit 비쌈, - = Binance 비쌈)
  upbitKrw: number;
  binanceUsd: number;
  fairKrw: number;
  usdKrwRate: number;
  longExchange: "upbit";
  longPrice: number; // USD (Upbit KRW 환산)
  shortExchange: "binance";
  shortPrice: number; // USD
}

/** 단방향 PnL (수수료 차감 전). 김프 +방향 변화 = 이득. */
export function arbitragePnl(
  notional: number,
  entryPct: number,
  currentPct: number,
): number {
  return ((currentPct - entryPct) / 100) * notional;
}

/** 단방향 목표 도달: current ≥ target. */
export function targetReached(targetPct: number, currentPct: number): boolean {
  return currentPct >= targetPct;
}
