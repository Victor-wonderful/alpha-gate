export type Direction = "long" | "short";
export type Timeframe = "15m" | "1h" | "4h" | "1D";
export type Grade = "A" | "B" | "C" | "D";

export const MARKET_CHECK_KEYS = [
  "higher_highs_lows",
  "near_key_level",
  "not_box_middle",
  "volume_confirm",
  "aligned_with_btc",
] as const;
export type MarketCheckKey = (typeof MARKET_CHECK_KEYS)[number];

export const PSYCH_CHECK_KEYS = [
  "stop_predefined",
  "loss_affordable",
  "not_revenge",
  "not_fomo",
] as const;
export type PsychCheckKey = (typeof PSYCH_CHECK_KEYS)[number];

export const MARKET_CHECK_LABELS: Record<MarketCheckKey, string> = {
  higher_highs_lows: "고점과 저점이 높아지고 있다",
  near_key_level: "주요 지지/저항 근처다",
  not_box_middle: "박스권 중간이 아니다",
  volume_confirm: "거래량이 동반됐다",
  aligned_with_btc: "BTC 방향과 충돌하지 않는다",
};

export const PSYCH_CHECK_LABELS: Record<PsychCheckKey, string> = {
  stop_predefined: "손절가를 미리 정했다",
  loss_affordable: "손실을 감당할 수 있다",
  not_revenge: "복구 매매가 아니다",
  not_fomo: "FOMO 진입이 아니다",
};

export const MISTAKE_TAGS = [
  "fomo",
  "chase",
  "early_exit",
  "stop_ignored",
  "size_over",
  "late_entry",
  "wrong_direction",
  "no_plan",
] as const;
export type MistakeTag = (typeof MISTAKE_TAGS)[number];

export const MISTAKE_TAG_LABELS: Record<MistakeTag, string> = {
  fomo: "FOMO",
  chase: "추격 매수",
  early_exit: "빠른 익절",
  stop_ignored: "손절 미준수",
  size_over: "사이즈 초과",
  late_entry: "늦은 진입",
  wrong_direction: "방향 오판",
  no_plan: "계획 없음",
};

export type ChecklistAnswers<K extends string> = Record<K, boolean>;

export interface TradeInput {
  symbol: string;
  direction: Direction;
  timeframe: Timeframe;
  entry: number;
  stop: number;
  target: number;
  accountSize: number;
  allowedLossPct: number;
  market: ChecklistAnswers<MarketCheckKey>;
  psych: ChecklistAnswers<PsychCheckKey>;
  flags: { newsRecent: boolean; losingStreak: boolean };
}

export interface ScoreReason {
  code: string;
  label: string;
  points: number;
}

export interface GradeResult {
  grade: Grade;
  score: number;
  reasons: ScoreReason[];
  actions: string[];
  rr: number;
}

export interface SizingResult {
  maxLoss: number;
  riskPerUnit: number;
  quantity: number;
  positionSize: number;
  valid: boolean;
  reason?: string;
}
