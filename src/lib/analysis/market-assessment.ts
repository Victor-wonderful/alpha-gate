import type { AnalysisSnapshot } from "./analyze";

/**
 * marketAssessment(등급 입력 5개 체크)를 스냅샷에서 결정론적으로 계산.
 *
 * 배경: 이 5개는 시장 "사실"(추세 구조·핵심 레벨·박스 위치·거래량·도미넌스 정렬)이지
 * AI 판단 대상이 아니다. 기존엔 AI가 채워(synthesize) 등급이 AI에 의존 → AI 미가용(폴백) 시
 * 등급이 붕괴. 코드가 사실로 채우면 등급이 AI 독립적이고 AI/폴백 경로가 일관된다.
 * (철학: 코드=측정/사실, AI=시나리오/서술.)
 */
export type MarketAssessment = {
  higher_highs_lows: boolean;
  near_key_level: boolean;
  not_box_middle: boolean;
  volume_confirm: boolean;
  aligned_with_btc: boolean;
};

export function computeMarketAssessment(
  snapshot: AnalysisSnapshot,
  direction: "long" | "short",
  entry: number,
): MarketAssessment {
  const price = entry > 0 ? entry : snapshot.ticker.last;
  const cls = snapshot.trendMetrics?.classification;

  // 1) 추세 구조가 방향을 지지 — 롱=상승추세 / 숏=하락추세 (명확한 추세일 때만).
  //    ※ 하락추세 숏도 구조적으로 명확 → 손절타당(+2)을 정당하게 받게 됨.
  const higher_highs_lows =
    (direction === "long" && cls === "up") || (direction === "short" && cls === "down");

  // 2) 진입가가 핵심 레벨 근처 — VP(POC/VAH/VAL)+주간VP+MTF 스윙과의 최소 거리.
  const levels: number[] = [];
  const vp = snapshot.volumeProfile;
  if (vp) levels.push(vp.poc, vp.vah, vp.val);
  const wvp = snapshot.weeklyVolumeProfile;
  if (wvp) levels.push(wvp.poc, wvp.vah, wvp.val);
  for (const tf of snapshot.multiTf ?? []) {
    if (tf.lastSwingHigh) levels.push(tf.lastSwingHigh);
    if (tf.lastSwingLow) levels.push(tf.lastSwingLow);
  }
  const atrPct =
    snapshot.atr?.find((a) => a.role === "MTF")?.pctOfPrice ??
    snapshot.atr?.find((a) => a.role === "LTF")?.pctOfPrice ??
    0.5;
  const nearThreshold = Math.max(0.2, atrPct * 0.6); // "근처" = 0.6×ATR 이내 (하한 0.2%)
  const near_key_level =
    price > 0 &&
    levels.some((lv) => lv > 0 && (Math.abs(price - lv) / price) * 100 <= nearThreshold);

  // 3) 박스 중간 회피 — VP 밸류영역(VAL~VAH) 중앙 1/3에 있으면 박스중간(false).
  let not_box_middle = true;
  if (vp && vp.vah > vp.val) {
    const pos = (price - vp.val) / (vp.vah - vp.val); // 0=VAL, 1=VAH
    if (pos >= 0.35 && pos <= 0.65) not_box_middle = false;
  }

  // 4) 거래량/오더플로우가 방향 지지 — 1분 체결 매수비율.
  const buyRatio = snapshot.flow1m?.buyRatio ?? 0.5;
  const volume_confirm =
    (direction === "long" && buyRatio >= 0.55) || (direction === "short" && buyRatio <= 0.45);

  // 5) 시장 국면(도미넌스) 정렬 — 알트만 의미(BTC페어는 grading에서 무시).
  //    도미넌스 데이터 없으면 정렬로 간주(불이익 없음 — 충돌 근거 부재).
  const dv = snapshot.macro?.dominanceRegime;
  const aligned_with_btc = dv
    ? direction === "long"
      ? dv.altLongFavorable
      : dv.altShortFavorable
    : true;

  return { higher_highs_lows, near_key_level, not_box_middle, volume_confirm, aligned_with_btc };
}
