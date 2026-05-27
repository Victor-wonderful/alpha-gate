/**
 * 차익거래 사이클의 슬리피지 차등화.
 *
 * Binance USDT-M Futures + Upbit KRW 시장 동시 체결 가정. 코인별 호가창 두께가
 * 천차만별이라 BTC/ETH는 적게, 마이너 알트는 크게 잡아야 현실적.
 *
 * tier 결정 기준: Binance 24h 거래량 (대략).
 * - tier 1 (BTC, ETH): 0.02% — 호가 두꺼움, 마켓 메이커 다수
 * - tier 2 (top 10 알트): 0.04% — XRP/SOL/DOGE/ADA/AVAX 등
 * - tier 3 (그 외): 0.06% — 호가 얇음, 슬리피지 큼
 */

const TIER1 = new Set(["BTC", "ETH"]);
const TIER2 = new Set([
  "XRP",
  "SOL",
  "DOGE",
  "ADA",
  "AVAX",
  "LINK",
  "DOT",
  "TRX",
  "BCH",
  "LTC",
  "MATIC",
  "UNI",
  "ATOM",
  "ETC",
]);

const TIER_RATE = {
  1: 0.0002, // 0.02%
  2: 0.0004, // 0.04%
  3: 0.0006, // 0.06%
} as const;

/**
 * 코인 슬리피지 비율 반환 (소수). 예: 0.0002 = 0.02%
 * @param symbol 코인 심볼 (BTC, BTCUSDT 등 어느 포맷이든)
 */
export function slippageRateFor(symbol: string): number {
  const base = symbol.toUpperCase().replace(/USDT$/, "").replace(/-USD$/, "");
  if (TIER1.has(base)) return TIER_RATE[1];
  if (TIER2.has(base)) return TIER_RATE[2];
  return TIER_RATE[3];
}

/** 디버그/UI용 — 슬리피지 티어 (1/2/3) */
export function slippageTierOf(symbol: string): 1 | 2 | 3 {
  const base = symbol.toUpperCase().replace(/USDT$/, "").replace(/-USD$/, "");
  if (TIER1.has(base)) return 1;
  if (TIER2.has(base)) return 2;
  return 3;
}
