import type { MarketDominance } from "./binance";

// Market regime based on dominance shifts + total market cap direction.
// Crypto practitioner standard — not a formal academic indicator but well-established
// among traders. References: BTC.D and TOTAL/TOTAL2/TOTAL3 charts on TradingView.

export type DominanceRegime =
  | "alt_season" // alt outperforming: total mcap up + BTC.D low/falling
  | "btc_season" // BTC leading: total mcap up + BTC.D high/rising
  | "risk_on" // capital flowing in (USDT.D low/falling)
  | "risk_off" // capital flowing to stables (USDT.D high/rising)
  | "alt_panic" // total mcap down + BTC.D low (alts hit harder than BTC)
  | "btc_flight" // total mcap down + BTC.D high (flight to BTC quality)
  | "neutral";

export interface DominanceVerdict {
  regime: DominanceRegime;
  label: string;
  /** Short Korean note for UI / LLM */
  note: string;
  /** Whether trading the given side (long/short) in this regime is favorable */
  altLongFavorable: boolean;
  altShortFavorable: boolean;
  btcLongFavorable: boolean;
  btcShortFavorable: boolean;
}

// Threshold reference (industry rules of thumb):
//   BTC.D high  ≥ 55%  /  low ≤ 50%
//   USDT.D high ≥ 7%   /  low ≤ 4%
//   Total mcap 24h:  up ≥ +2% / down ≤ -2% (rest = neutral)
const BTC_D_HIGH = 55;
const BTC_D_LOW = 50;
const USDT_D_HIGH = 7;
const USDT_D_LOW = 4;
const MCAP_UP = 2;
const MCAP_DOWN = -2;

export function classifyDominanceRegime(d: MarketDominance): DominanceVerdict {
  const { btc, usdt, totalMcap24hChangePct: mcapDelta } = d;

  const mcapUp = mcapDelta >= MCAP_UP;
  const mcapDown = mcapDelta <= MCAP_DOWN;
  const btcHigh = btc >= BTC_D_HIGH;
  const btcLow = btc <= BTC_D_LOW;
  const usdtHigh = usdt >= USDT_D_HIGH;
  const usdtLow = usdt <= USDT_D_LOW;

  let regime: DominanceRegime = "neutral";

  if (mcapUp && btcLow && !usdtHigh) regime = "alt_season";
  else if (mcapUp && btcHigh) regime = "btc_season";
  else if (mcapDown && btcLow) regime = "alt_panic";
  else if (mcapDown && btcHigh) regime = "btc_flight";
  else if (usdtHigh) regime = "risk_off";
  else if (usdtLow && mcapUp) regime = "risk_on";

  const labelMap: Record<DominanceRegime, string> = {
    alt_season: "알트 시즌",
    btc_season: "BTC 시즌",
    risk_on: "Risk-on",
    risk_off: "Risk-off",
    alt_panic: "알트 패닉",
    btc_flight: "BTC 방어",
    neutral: "혼조",
  };

  const noteMap: Record<DominanceRegime, string> = {
    alt_season: `BTC.D ${btc.toFixed(1)}%(낮음) · 총시총 +${mcapDelta.toFixed(1)}% — 자금이 알트로 유입`,
    btc_season: `BTC.D ${btc.toFixed(1)}%(높음) · 총시총 +${mcapDelta.toFixed(1)}% — BTC가 주도, 알트 약세`,
    alt_panic: `BTC.D ${btc.toFixed(1)}%(낮음) · 총시총 ${mcapDelta.toFixed(1)}% — 알트가 BTC보다 더 큰 폭 하락`,
    btc_flight: `BTC.D ${btc.toFixed(1)}%(높음) · 총시총 ${mcapDelta.toFixed(1)}% — BTC로 자금 도피, 알트 위험`,
    risk_on: `USDT.D ${usdt.toFixed(1)}%(낮음) · 총시총 +${mcapDelta.toFixed(1)}% — 스테이블에서 코인으로 자금 유입`,
    risk_off: `USDT.D ${usdt.toFixed(1)}%(높음) · 매도 압력 우세`,
    neutral: `BTC.D ${btc.toFixed(1)}% / USDT.D ${usdt.toFixed(1)}% / 총시총 ${mcapDelta.toFixed(1)}% — 명확한 방향 없음`,
  };

  // Trade favorability by regime
  let altLongFavorable = false;
  let altShortFavorable = false;
  let btcLongFavorable = false;
  let btcShortFavorable = false;

  switch (regime) {
    case "alt_season":
      altLongFavorable = true;
      btcLongFavorable = true; // 총시총 상승이라 BTC도 동반 상승
      break;
    case "btc_season":
      btcLongFavorable = true;
      altShortFavorable = true; // 알트는 약세
      break;
    case "alt_panic":
      altShortFavorable = true;
      break;
    case "btc_flight":
      btcLongFavorable = true; // 상대 강세
      altShortFavorable = true;
      break;
    case "risk_on":
      altLongFavorable = true;
      btcLongFavorable = true;
      break;
    case "risk_off":
      altShortFavorable = true;
      btcShortFavorable = true;
      break;
    case "neutral":
      // 양방향 모두 OK — 추세 다른 신호로 결정
      altLongFavorable = true;
      altShortFavorable = true;
      btcLongFavorable = true;
      btcShortFavorable = true;
      break;
  }

  return {
    regime,
    label: labelMap[regime],
    note: noteMap[regime],
    altLongFavorable,
    altShortFavorable,
    btcLongFavorable,
    btcShortFavorable,
  };
}

/** True if going `direction` on `symbol` is favorable given regime. */
export function isDirectionFavorable(
  verdict: DominanceVerdict,
  symbol: string,
  direction: "long" | "short",
): boolean {
  const isBtc = symbol.toUpperCase().startsWith("BTC");
  if (isBtc) {
    return direction === "long" ? verdict.btcLongFavorable : verdict.btcShortFavorable;
  }
  return direction === "long" ? verdict.altLongFavorable : verdict.altShortFavorable;
}
