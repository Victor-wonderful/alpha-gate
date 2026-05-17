import type { Interval } from "./binance";

export type TradingStyle = "scalp" | "day" | "swing" | "position";

export interface StylePreset {
  id: TradingStyle;
  label: string;
  description: string;
  // HTF/MTF/LTF — analysis bias / setup / trigger
  htf: Interval;
  mtf: Interval;
  ltf: Interval;
  // Which TF to use for Volume Profile (typically MTF or one step up)
  volumeProfileTf: Interval;
  // Hint for Claude in the prompt
  promptHint: string;
}

export const STYLE_PRESETS: Record<TradingStyle, StylePreset> = {
  scalp: {
    id: "scalp",
    label: "스캘핑 (수분~수시간)",
    description: "1H / 15M / 5M — 짧은 모멘텀 매매",
    htf: "1h",
    mtf: "15m",
    ltf: "5m",
    volumeProfileTf: "15m",
    promptHint:
      "사용자는 스캘퍼다. 진입~청산 시간은 수분에서 수시간. 진입 영역과 무효화는 LTF(5M~15M) 구조 기준으로 좁게 설정하고, 목표는 가까운 매물대까지만. 손익비 1:1~1:2 정도가 현실적. 펀딩비/체결 흐름이 중요.",
  },
  day: {
    id: "day",
    label: "데이 트레이딩 (수시간~하루)",
    description: "4H / 1H / 15M — 하루 안에 청산하는 매매",
    htf: "4h",
    mtf: "1h",
    ltf: "15m",
    volumeProfileTf: "1h",
    promptHint:
      "사용자는 데이 트레이더다. 4H 편향을 따라 1H에서 셋업을 잡고 15M에서 트리거. 보유 시간은 수시간~당일. 목표는 4H 직전 스윙 또는 핵심 매물대.",
  },
  swing: {
    id: "swing",
    label: "스윙 (며칠~수주)",
    description: "1D / 4H / 1H — 추세 추종 중심 (권장)",
    htf: "1d",
    mtf: "4h",
    ltf: "1h",
    volumeProfileTf: "4h",
    promptHint:
      "사용자는 스윙 트레이더다. 1D 추세를 따라 4H에서 셋업을 잡고 1H에서 트리거. 보유 시간은 며칠~수주. 무효화는 4H 구조적 레벨 종가 이탈로 충분히 넉넉히. 목표는 1D 직전 스윙 또는 큰 매물대까지.",
  },
  position: {
    id: "position",
    label: "포지션 (수주~수개월)",
    description: "1W는 fetch 불가하니 1D / 4H / 1H로 대체",
    htf: "1d",
    mtf: "4h",
    ltf: "1h",
    volumeProfileTf: "1d",
    promptHint:
      "사용자는 포지션 트레이더다. 1D 메이저 구조에 따라 며칠에 걸친 진입을 분할로 잡는다. 무효화는 1D 종가 이탈로 매우 넉넉하게. 목표는 사이클 수준의 큰 레벨.",
  },
};

export const ALL_INTERVALS_FOR_SNAPSHOT: Interval[] = ["1d", "4h", "1h", "15m"];

/** TFs to fetch for a given style. Always returns 3 TFs in HTF→LTF order. */
export function tfsForStyle(style: TradingStyle): Interval[] {
  const p = STYLE_PRESETS[style];
  // dedupe while preserving order
  return Array.from(new Set([p.htf, p.mtf, p.ltf])) as Interval[];
}
