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

export const TRIGGER_CHECK_KEYS = [
  "trigger_confirmed",
  "within_entry_band",
  "candle_closed",
] as const;
export type TriggerCheckKey = (typeof TRIGGER_CHECK_KEYS)[number];

export const MARKET_CHECK_LABELS: Record<MarketCheckKey, string> = {
  higher_highs_lows: "고점과 저점이 높아지고 있다",
  near_key_level: "주요 지지/저항 근처다",
  not_box_middle: "박스권 중간이 아니다",
  volume_confirm: "거래량이 동반됐다",
  aligned_with_btc: "BTC 방향과 충돌하지 않는다",
};

export const TRIGGER_CHECK_LABELS: Record<TriggerCheckKey, string> = {
  trigger_confirmed: "시나리오의 트리거 조건이 캔들로 확인됐다",
  within_entry_band: "현재가가 계획 진입 구간 안에 있다 (추격 아님)",
  candle_closed: "신호 캔들이 종가까지 확정됐다 (미확정 봉 진입 아님)",
};

// 일일 손실 한도 (R 단위, 음수). 향후 profile 컬럼으로 전환 가능.
export const DAILY_LOSS_LIMIT_R = -2;
// 같은 방향 누적 노출 경고 임계 (계좌 대비 %)
export const SAME_DIRECTION_EXPOSURE_PCT = 80;
// 진입 구간 허용 슬리피지 (entry ± ENTRY_BAND_PCT %)
export const ENTRY_BAND_PCT = 0.3;

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

export interface MoneyContext {
  /** 오늘 마감된 거래의 누적 R (음수면 손실) */
  todayCumulativeR: number;
  /** 오늘 마감된 거래 수 */
  todayClosedCount: number;
  /** 진행 중(미마감) 포지션 */
  openPositions: Array<{
    id: string;
    symbol: string;
    direction: Direction;
    positionSize: number; // entry * quantity
  }>;
  /** 진행 중 포지션의 노출 총합 (계좌 대비 %) */
  openExposurePct: number;
}

export interface MarketContext {
  btcPrice: number | null;
  btc24hChangePct: number | null;
  /** 거래 심볼의 현재가 (Spot 기준) — 시장가 진입 시 사용 */
  symbolPrice: number | null;
  /** 현재 심볼의 펀딩비 (예: 0.0001 = 0.01%) */
  fundingRate: number | null;
  /** 다음 펀딩 정산까지 남은 분 */
  minutesToFunding: number | null;
}

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
  trigger: ChecklistAnswers<TriggerCheckKey>;
  money: MoneyContext;
  marketCtx: MarketContext;
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
