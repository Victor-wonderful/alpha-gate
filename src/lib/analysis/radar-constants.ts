// 클라이언트/서버 공용 상수 — server-only 의존이 없어야 한다(클라이언트 번들 안전).
// 항상 후보 레이더에 고정 표시하는 기준 자산 (점수 컷오프 무관, 표시 순서도 이 순).
export const PINNED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "XRPUSDT", "BNBUSDT"];
