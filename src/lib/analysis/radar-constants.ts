// 클라이언트/서버 공용 상수 — server-only 의존이 없어야 한다(클라이언트 번들 안전).
// 항상 후보 레이더에 고정 표시하는 기준 자산 (게이트·랭킹 무관, 맨 앞 고정).
// 2026-07: BTC 단독 고정으로 축소 — 시장 레짐을 정하는 기준 자산만 고정하고,
// 나머지 슬롯(4칸)은 시총 상위 15 유니버스가 게이트+랭킹으로 경쟁 (radar.ts 참조).
export const PINNED_SYMBOLS = ["BTCUSDT"];

/** 시총 상위 15 대장주 (스테이블·랩드 제외, Binance USDT 존재분) — 2026-07 큐레이션.
 *  시총 데이터는 Binance API에 없어 상수로 관리. 분기 1회 순위 확인·갱신 권장.
 *  (근접 후순위 교체 후보: DOT, TON, SHIB)
 *
 *  레이더 유니버스이자 DCA 자산 게이트(G1)의 허용 목록 — "죽지 않는 자산에만 물타기"를
 *  코드로 강제하는 근거다. cf. docs/DCA-모드-설계.md G1 */
export const MEGA_CAP_UNIVERSE = [
  "BTCUSDT", "ETHUSDT", "XRPUSDT", "BNBUSDT", "SOLUSDT",
  "DOGEUSDT", "ADAUSDT", "TRXUSDT", "LINKUSDT", "AVAXUSDT",
  "XLMUSDT", "SUIUSDT", "BCHUSDT", "HBARUSDT", "LTCUSDT",
];
