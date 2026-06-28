/**
 * 백테스트 성과 지표 + 품질 게이트 — 순수 함수 모듈.
 *
 * Stock-Alpha(apps/engine/engine/backtest)의 metrics.py / gate.py / costs.py 를
 * Alpha Gate(암호화폐 선물)에 맞춰 TS로 포팅한 것. 의존성 없음(테스트 용이).
 *
 * 핵심 단위는 'R'(리스크 배수): 트레이드 손익 / (진입~손절 거리).
 * R>0=수익, R<0=손실. R 기반이면 코인·가격대 무관하게 합산 가능.
 *
 * 주식판과의 차이(암호화폐 적응):
 *  - 세금 없음. 비용 = 왕복 수수료(taker+maker) + (선택) 펀딩비.
 *  - 롱/숏 모두 지원(주식 롱온리와 달리 선물은 양방향).
 *  - 슬리피지는 체결가(entry_actual/exit_actual)에서 별도 처리하는 게 Alpha Gate
 *    관례라, 여기 비용모델은 기본적으로 수수료+펀딩만 R에서 차감(이중차감 방지).
 *
 * 사용 흐름: simulator.ts(워크포워드) → tradeFromSim() → evaluateGate().
 */
import { ROUND_TRIP_COST_PCT } from "@/lib/analysis/standards";
import type { BacktestSimResult } from "./simulator";

// ─────────────────────────────────────────────────────────────
// 1. Trade — 게이트 평가의 기본 단위
// ─────────────────────────────────────────────────────────────

export interface Trade {
  /** 순손익(비용차감) / 리스크 — 게이트가 보는 단위. */
  rMultiple: number;
  /** 손익률 (포지션 대비, 비용차감). 복리 자산곡선용. */
  retPct: number;
  barsHeld: number;
  /** 진입 시점(ISO). 다종목 합산 시 시간순 정렬 + 일별 군집 계산용.
   *  MDD는 순서 민감 → 비면 단일 일자로 묶인다. */
  entryTs?: string;
  /** 비용 미반영 R — 비용 영향 진단용(게이트엔 미사용). */
  rGross?: number;
}

// ─────────────────────────────────────────────────────────────
// 2. 비용 모델 (암호화폐 선물)
// ─────────────────────────────────────────────────────────────

export interface CryptoCostModel {
  /** 왕복 수수료 % (taker+maker 합). 기본 = standards.ROUND_TRIP_COST_PCT(0.075%). */
  roundTripPct: number;
  /** 펀딩 정산 1회당 비율 % (절댓값). 0이면 펀딩 무시. */
  fundingPctPerInterval: number;
  /** 펀딩 정산 1회에 해당하는 봉 수 (예: 8h 펀딩 + 1h봉 = 8). */
  barsPerFundingInterval: number;
}

export const DEFAULT_CRYPTO_COST: CryptoCostModel = {
  roundTripPct: ROUND_TRIP_COST_PCT,
  fundingPctPerInterval: 0, // 기본 무시 — 호출부가 실제 펀딩비를 넣으면 활성화
  barsPerFundingInterval: 8,
};

export const ZERO_COST: CryptoCostModel = {
  roundTripPct: 0,
  fundingPctPerInterval: 0,
  barsPerFundingInterval: 8,
};

/**
 * gross R(가격 기준 R)에서 비용을 차감해 net R 산출.
 *
 * 비용은 "가격 % "라 R로 변환하려면 손절폭(%)으로 나눈다.
 *   비용R = 비용% / 손절폭%
 *   net R = gross R − 비용R
 * (standards.ts의 realizedR 계산과 동일한 논리.)
 *
 * @param grossR     simulator의 resultR (비용 미반영)
 * @param stopPct    계획 손절폭 (진입가 대비 %, 예: 2 = 2%)
 * @param barsHeld   보유 봉 수 (펀딩 횟수 계산용)
 * @param direction  long이면 펀딩 양수 시 비용, short이면 음수 시 비용 — 보수적으로 항상 비용 처리
 */
export function netRFromGross(
  grossR: number,
  stopPct: number,
  barsHeld = 0,
  cost: CryptoCostModel = DEFAULT_CRYPTO_COST,
): number {
  if (stopPct <= 0) return grossR; // 비현실(손절폭 0) — 호출부 윈저라이즈가 처리
  const fundingIntervals =
    cost.barsPerFundingInterval > 0 ? Math.floor(barsHeld / cost.barsPerFundingInterval) : 0;
  // 펀딩은 방향 무관 보수적 비용으로 가산(최악 가정). 정밀 모델은 펀딩 부호×방향 필요.
  const costPct = cost.roundTripPct + fundingIntervals * Math.abs(cost.fundingPctPerInterval);
  return grossR - costPct / stopPct;
}

/** simulator.ts 결과 → Trade. stopPct(계획 손절폭 %)를 알아야 net R/retPct 산출 가능. */
export function tradeFromSim(
  sim: BacktestSimResult,
  stopPct: number,
  cost: CryptoCostModel = DEFAULT_CRYPTO_COST,
): Trade {
  const netR = netRFromGross(sim.resultR, stopPct, sim.meta.barsHeld, cost);
  // retPct(무레버리지 포지션 수익률 근사) = net R × 손절폭(소수). 복리 자산곡선용 보조값.
  const retPct = netR * (stopPct / 100);
  return {
    rMultiple: netR,
    retPct,
    barsHeld: sim.meta.barsHeld,
    entryTs: sim.meta.entryCandleTime ?? undefined,
    rGross: sim.resultR,
  };
}

// ─────────────────────────────────────────────────────────────
// 3. 성과 지표 (순수 함수)
// ─────────────────────────────────────────────────────────────

export function winRate(trades: Trade[]): number | null {
  if (!trades.length) return null;
  const wins = trades.filter((t) => t.rMultiple > 0).length;
  return wins / trades.length;
}

/** 평균 손익비 = 평균이익 / 평균손실(절댓값). */
export function avgRR(trades: Trade[]): number | null {
  const wins = trades.filter((t) => t.rMultiple > 0).map((t) => t.rMultiple);
  const losses = trades.filter((t) => t.rMultiple < 0).map((t) => -t.rMultiple);
  if (!wins.length || !losses.length) return null;
  const avgWin = wins.reduce((a, b) => a + b, 0) / wins.length;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
  return avgLoss > 0 ? avgWin / avgLoss : null;
}

/** 기대값(R) = 평균 R 멀티플. 양수면 기대수익 우위. */
export function expectancyR(trades: Trade[]): number | null {
  if (!trades.length) return null;
  return trades.reduce((a, t) => a + t.rMultiple, 0) / trades.length;
}

/**
 * 수익 계수 (Profit Factor) = 총이익 / 총손실(절댓값). 보고용.
 * 대시보드와 동일 개념.
 */
export function profitFactor(trades: Trade[]): number | null {
  const grossWin = trades.filter((t) => t.rMultiple > 0).reduce((a, t) => a + t.rMultiple, 0);
  const grossLoss = -trades.filter((t) => t.rMultiple < 0).reduce((a, t) => a + t.rMultiple, 0);
  if (grossLoss <= 0) return grossWin > 0 ? Infinity : null;
  return grossWin / grossLoss;
}

/** 수익률 시퀀스의 연율화 Sharpe (무위험수익률 0 가정). */
export function sharpe(returns: number[], periodsPerYear = 252): number | null {
  const n = returns.length;
  if (n < 2) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return null;
  return (mean / std) * Math.sqrt(periodsPerYear);
}

/** Sortino — 하방 변동만 분모로(손실의 표준편차). 추세전략 평가에 Sharpe보다 공정. */
export function sortino(returns: number[], periodsPerYear = 252): number | null {
  const n = returns.length;
  if (n < 2) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const downside = returns.filter((r) => r < 0);
  if (!downside.length) return mean > 0 ? Infinity : null;
  const dVar = downside.reduce((a, r) => a + r ** 2, 0) / n;
  const dStd = Math.sqrt(dVar);
  if (dStd === 0) return null;
  return (mean / dStd) * Math.sqrt(periodsPerYear);
}

/** 최대 낙폭(0~1, 양수). equityCurve는 누적 자산 시퀀스. */
export function maxDrawdown(equityCurve: number[]): number | null {
  if (!equityCurve.length) return null;
  let peak = equityCurve[0];
  let mdd = 0;
  for (const v of equityCurve) {
    peak = Math.max(peak, v);
    if (peak > 0) mdd = Math.max(mdd, (peak - v) / peak);
  }
  return mdd;
}

/** 트레이드 수익률을 복리로 누적한 자산 곡선. */
export function equityFromTrades(trades: Trade[], start = 1): number[] {
  const eq = [start];
  for (const t of trades) eq.push(eq[eq.length - 1] * (1 + t.retPct));
  return eq;
}

/**
 * R 기준 고정리스크 자산 곡선 — 트레이드당 자산의 riskFrac만 리스크.
 * ret_pct 전액 순차 복리는 표본↑ → MDD→1 왜곡. 고정 리스크면 MDD가
 * 전략 품질을 반영하고 코인·표본수와 무관하게 비교 가능.
 */
export function equityRCurve(trades: Trade[], riskFrac = 0.01, start = 1): number[] {
  const eq = [start];
  for (const t of trades) eq.push(eq[eq.length - 1] * (1 + riskFrac * t.rMultiple));
  return eq;
}

/**
 * 일별 리스크 예산 자산 곡선 — 하루 riskFrac을 그날 진입 트레이드에 균등 분할.
 * 트레이드당 순차 복리는 "모든 시그널 전부 집행" 가정이라 손실 군집일에
 * MDD가 폭발한다. 실제로는 하루 소수만 집행 → 하루 손익 = 그날 R 평균.
 * entryTs 없는 트레이드는 단일 일자로 묶인다.
 */
export function dailyRCurve(trades: Trade[], riskFrac = 0.01, start = 1): number[] {
  const byDay = new Map<string, number[]>();
  for (const t of trades) {
    const day = (t.entryTs ?? "").slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(t.rMultiple);
  }
  const eq = [start];
  for (const day of [...byDay.keys()].sort()) {
    const rs = byDay.get(day)!;
    const avg = rs.reduce((a, b) => a + b, 0) / rs.length;
    eq.push(eq[eq.length - 1] * (1 + riskFrac * avg));
  }
  return eq;
}

/** 점수 vs 미래수익률 스피어만 상관(IC) — 레이더 점수 검증용. */
export function informationCoefficient(scores: number[], fwdReturns: number[]): number | null {
  if (scores.length !== fwdReturns.length || scores.length < 3) return null;
  return pearson(rank(scores), rank(fwdReturns));
}

function rank(xs: number[]): number[] {
  const order = [...xs.keys()].sort((a, b) => xs[a] - xs[b]);
  const ranks = new Array(xs.length).fill(0);
  let i = 0;
  while (i < xs.length) {
    let j = i;
    while (j + 1 < xs.length && xs[order[j + 1]] === xs[order[i]]) j++;
    const avg = (i + j) / 2;
    for (let k = i; k <= j; k++) ranks[order[k]] = avg;
    i = j + 1;
  }
  return ranks;
}

function pearson(a: number[], b: number[]): number | null {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  va = Math.sqrt(va);
  vb = Math.sqrt(vb);
  if (va === 0 || vb === 0) return null;
  return cov / (va * vb);
}

// ─────────────────────────────────────────────────────────────
// 4. 품질 게이트 — 백테스트 통과 셋업만 발행 허용
// ─────────────────────────────────────────────────────────────

export interface GateThresholds {
  /** 표본 수 하한 (과적합·우연 방지). */
  minTrades: number;
  /** 트레이드당 기대값(R) 하한. 비용차감 net 위에 얹는 안전 마진. */
  minExpectancyR: number;
  /** 일별 리스크예산 곡선(dailyRCurve) 최대 낙폭 상한. */
  maxMdd: number;
  /** 하루 리스크 예산 비율. */
  riskFrac: number;
  /** R 멀티플 클립(±) — 손절폭≈0 비현실 트레이드의 기대값 왜곡 차단. */
  winsorR: number;
}

export const DEFAULT_GATE: GateThresholds = {
  minTrades: 20,
  minExpectancyR: 0.05,
  maxMdd: 0.4,
  riskFrac: 0.01,
  winsorR: 10,
};

export interface GateResult {
  passed: boolean;
  nTrades: number;
  winRate: number | null; // 보고용 (하한 아님)
  avgRR: number | null; // 보고용 (하한 아님)
  expectancyR: number | null;
  mdd: number | null; // R 기준
  reasons: string[];
}

export function evaluateGate(trades: Trade[], thr: GateThresholds = DEFAULT_GATE): GateResult {
  const n = trades.length;
  const w = thr.winsorR;
  const clipped: Trade[] = trades.map((t) => ({
    ...t,
    rMultiple: Math.max(-w, Math.min(w, t.rMultiple)),
  }));

  const wr = winRate(clipped); // 부호 보존 — 클립 영향 없음
  const rr = avgRR(clipped);
  const exp = expectancyR(clipped);
  const mdd = maxDrawdown(dailyRCurve(clipped, thr.riskFrac));

  const reasons: string[] = [];
  if (n < thr.minTrades) reasons.push(`표본 부족(${n}<${thr.minTrades})`);
  if (exp === null || exp < thr.minExpectancyR) reasons.push(`기대값 미달(${exp?.toFixed(4) ?? "null"})`);
  if (mdd !== null && mdd > thr.maxMdd) reasons.push(`R-MDD 초과(${mdd.toFixed(4)})`);

  return {
    passed: reasons.length === 0,
    nTrades: n,
    winRate: wr,
    avgRR: rr,
    expectancyR: exp,
    mdd,
    reasons,
  };
}

// ─────────────────────────────────────────────────────────────
// 5. 워크포워드 게이트 — 엣지 쇠퇴(과거엔 먹혔으나 최근 죽은 전략) 차단
// ─────────────────────────────────────────────────────────────

export interface WalkForwardThresholds {
  /** 시간순 분할 수. */
  splits: number;
  /** 기대값 양수인 분할 비율 하한 (0~1). */
  minPositiveFraction: number;
  /** 최근(마지막) 분할의 기대값 하한 — 최근에도 살아있어야 통과. */
  recentMinR: number;
  /** R 멀티플 클립(±) — evaluateGate와 동일. */
  winsorR: number;
}

export const DEFAULT_WALK_FORWARD: WalkForwardThresholds = {
  splits: 4,
  minPositiveFraction: 0.5,
  recentMinR: 0,
  winsorR: 10,
};

export interface WalkForwardResult {
  passed: boolean;
  splits: { nTrades: number; expectancyR: number | null }[];
  positiveFraction: number | null;
  recentExpectancyR: number | null;
  reasons: string[];
}

/**
 * 트레이드를 시간순(entryTs)으로 N등분(건수 기준)해, 분할별 기대값을 본다.
 * 통과 조건: ① 양수 분할 비율 ≥ minPositiveFraction, ② 최근 분할 기대값 ≥ recentMinR.
 * 전 구간 평균(evaluateGate)만 보면 "초반에 크게 벌고 최근 죽은" 전략을 못 거른다.
 */
export function walkForwardGate(
  trades: Trade[],
  thr: WalkForwardThresholds = DEFAULT_WALK_FORWARD,
): WalkForwardResult {
  const w = thr.winsorR;
  const clipR = (t: Trade) => Math.max(-w, Math.min(w, t.rMultiple));
  // 시간순 정렬(entryTs 없으면 입력 순서 유지 — 시뮬은 보통 시간순 산출).
  const sorted = [...trades].sort((a, b) => (a.entryTs ?? "").localeCompare(b.entryTs ?? ""));

  if (sorted.length < thr.splits) {
    return {
      passed: false,
      splits: [],
      positiveFraction: null,
      recentExpectancyR: null,
      reasons: [`표본 부족(${sorted.length}<${thr.splits}분할)`],
    };
  }

  const size = sorted.length / thr.splits;
  const splits: { nTrades: number; expectancyR: number | null }[] = [];
  for (let i = 0; i < thr.splits; i++) {
    const chunk = sorted.slice(Math.floor(i * size), Math.floor((i + 1) * size));
    const exp = chunk.length ? chunk.reduce((a, t) => a + clipR(t), 0) / chunk.length : null;
    splits.push({ nTrades: chunk.length, expectancyR: exp });
  }

  const valid = splits.filter((s) => s.expectancyR !== null);
  const positive = valid.filter((s) => (s.expectancyR as number) > 0).length;
  const positiveFraction = valid.length ? positive / valid.length : null;
  const recentExpectancyR = splits[splits.length - 1].expectancyR;

  const reasons: string[] = [];
  if (positiveFraction === null || positiveFraction < thr.minPositiveFraction) {
    reasons.push(`양수 분할 비율 미달(${positiveFraction?.toFixed(2) ?? "null"}<${thr.minPositiveFraction})`);
  }
  if (recentExpectancyR === null || recentExpectancyR < thr.recentMinR) {
    reasons.push(`최근 분할 기대값 미달(${recentExpectancyR?.toFixed(4) ?? "null"}<${thr.recentMinR})`);
  }

  return {
    passed: reasons.length === 0,
    splits,
    positiveFraction,
    recentExpectancyR,
    reasons,
  };
}

/**
 * 종합 게이트 — 기본 게이트(표본·기대값·MDD) AND 워크포워드(쇠퇴) 둘 다 통과해야 발행.
 * Stock-Alpha gate.py의 최종 발행 기준과 동일한 합성.
 */
export function evaluateFullGate(
  trades: Trade[],
  gateThr: GateThresholds = DEFAULT_GATE,
  wfThr: WalkForwardThresholds = DEFAULT_WALK_FORWARD,
): { passed: boolean; gate: GateResult; walkForward: WalkForwardResult; reasons: string[] } {
  const gate = evaluateGate(trades, gateThr);
  const walkForward = walkForwardGate(trades, wfThr);
  const reasons = [
    ...gate.reasons,
    ...walkForward.reasons.map((r) => `워크포워드: ${r}`),
  ];
  return { passed: gate.passed && walkForward.passed, gate, walkForward, reasons };
}
