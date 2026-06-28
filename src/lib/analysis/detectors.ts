/**
 * 코드 결정론 신호 detector — 가격/거래량만으로 계산되는 정량 신호.
 *
 * Stock-Alpha playbooks의 발상을 암호화폐에 맞춰 이식:
 *  - vol_squeeze: 변동성 수축(VCP) 후 거래량 동반 돌파 — 원본 detect_vol_squeeze 포팅
 *  - sigma: 종가 z-score 밴드 이탈(과매도/과매수) — 표준 평균회귀 신호
 *  - confluence(ensemble): 여러 방향 신호의 합의 — "2개+ 동의 = 고확신"
 *
 * 용도: buildSnapshot에 신호로 추가 → LLM이 시나리오 근거(컨플루언스)로 활용.
 * 휴리스틱 가중치가 아니라 **객관적 신호**라, 시나리오를 강제하지 않고 입력만 제공한다.
 */
import type { Candle } from "./binance";

// ─── 내부 헬퍼 ───────────────────────────────────────────────

function trueRange(c: Candle, prevClose: number): number {
  return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
}

/** 봉별 ATR%(close 대비) 시계열 — SMA(TR, period) / close. */
function atrPctSeries(candles: Candle[], period = 14): number[] {
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) tr.push(trueRange(candles[i], candles[i - 1].close));
  const out: number[] = [];
  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) {
      out.push(NaN);
      continue;
    }
    let sum = 0;
    for (let k = i - period + 1; k <= i; k++) sum += tr[k];
    const atr = sum / period;
    const close = candles[i + 1].close; // tr[i]는 candles[i+1] 기준
    out.push(close > 0 ? atr / close : NaN);
  }
  return out;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

// ─── 1. vol_squeeze (VCP) — Stock-Alpha detect_vol_squeeze 포팅 ───

export interface VolSqueezeSignal {
  active: boolean;
  /** 돌파 전 변동성이 최근 window에서 하위 몇 분위인지 (0~1, 낮을수록 강한 수축). */
  squeezeRank: number | null;
  /** 직전 20봉 고가(돌파 기준선). */
  breakoutLevel: number | null;
  strength: number;
}

export function detectVolSqueeze(
  candles: Candle[],
  window = 60,
  squeezePct = 0.25,
  volMult = 1.5,
): VolSqueezeSignal {
  const inactive: VolSqueezeSignal = { active: false, squeezeRank: null, breakoutLevel: null, strength: 0 };
  if (candles.length < window + 21) return inactive;

  const atrPct = atrPctSeries(candles, 14).filter((v) => !Number.isNaN(v));
  if (atrPct.length < window) return inactive;

  const recent = atrPct[atrPct.length - 2]; // 돌파 전일까지의 수축 상태
  const win = atrPct.slice(-window, -1);
  const rank = win.filter((v) => v <= recent).length / win.length;
  if (rank > squeezePct) return inactive; // 변동성이 하위 squeezePct 분위가 아님

  const highs = candles.map((c) => c.high);
  const vols = candles.map((c) => c.volume);
  const prior20 = Math.max(...highs.slice(-21, -1));
  const c = candles[candles.length - 1].close;
  if (c <= prior20) return inactive; // 돌파 아님

  const avgVol = mean(vols.slice(-21, -1));
  if (avgVol > 0 && vols[vols.length - 1] < avgVol * volMult) return inactive; // 거래량 미동반

  const strength = Math.min(1, 0.65 + (rank <= 0.1 ? 0.1 : 0));
  return { active: true, squeezeRank: rank, breakoutLevel: prior20, strength };
}

// ─── 2. sigma — 종가 z-score 밴드 (평균회귀) ───

export interface SigmaSignal {
  active: boolean;
  /** 종가의 z-score (이동평균 대비 표준편차 단위). */
  z: number | null;
  /** z<=-threshold → long(과매도 반등), z>=+threshold → short(과매수). */
  side: "long" | "short" | null;
}

export function detectSigma(candles: Candle[], period = 20, threshold = 2): SigmaSignal {
  const inactive: SigmaSignal = { active: false, z: null, side: null };
  if (candles.length < period) return inactive;
  const closes = candles.slice(-period).map((c) => c.close);
  const m = mean(closes);
  const sd = stdev(closes);
  if (sd === 0) return inactive;
  const z = (candles[candles.length - 1].close - m) / sd;
  if (z <= -threshold) return { active: true, z, side: "long" };
  if (z >= threshold) return { active: true, z, side: "short" };
  return { active: false, z, side: null };
}

// ─── 3. confluence (ensemble) — 방향 신호 합의 ───

export interface DirectionalVote {
  name: string;
  side: "long" | "short";
}

export interface ConfluenceSignal {
  longCount: number;
  shortCount: number;
  /** 다수 방향. long/short 동수이거나 둘 다 0이면 mixed/none. */
  net: "long" | "short" | "mixed" | "none";
  /** 고확신 여부 — 한 방향 2개 이상 + 반대 방향보다 우세. */
  highConviction: boolean;
  members: DirectionalVote[];
}

export function computeConfluence(votes: DirectionalVote[]): ConfluenceSignal {
  const longCount = votes.filter((v) => v.side === "long").length;
  const shortCount = votes.filter((v) => v.side === "short").length;
  let net: ConfluenceSignal["net"];
  if (longCount === 0 && shortCount === 0) net = "none";
  else if (longCount === shortCount) net = "mixed";
  else net = longCount > shortCount ? "long" : "short";
  const dominant = Math.max(longCount, shortCount);
  const highConviction = dominant >= 2 && longCount !== shortCount;
  return { longCount, shortCount, net, highConviction, members: votes };
}

// ─── 묶음 ───────────────────────────────────────────────────

export interface DetectorSignals {
  volSqueeze: VolSqueezeSignal;
  sigma: SigmaSignal;
  confluence: ConfluenceSignal;
}
