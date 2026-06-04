/**
 * 시나리오 몬테카를로 — 확률·리스크 정량화 (방향 예측 아님).
 *
 * 정직성 원칙:
 * - 과거 수익률 분포를 **부트스트랩**(무작위 재샘플)해 팻테일/변동성 군집을 반영.
 * - 드리프트(평균 수익률)는 **0으로 중심화** → 방향을 예측하지 않음.
 *   따라서 결과는 "이 코인이 오를까"가 아니라, 순수하게
 *   "진입/손절/목표의 거리 + 변동성"이 만드는 **확률 구조**다.
 * - 같은 봉에서 손절·목표 동시 터치 시 손절 우선(보수적, 백테스터와 동일 가정).
 *
 * 클라이언트에서 실행 (server-only 아님). Math.random 사용 — 결정론 불필요.
 */

export interface McResult {
  paths: number;
  pTarget: number; // 목표 먼저 도달 비율 0..1
  pStop: number; // 손절 먼저 비율
  pTimeout: number; // 기한 내 미도달 비율
  expR: number; // 기대 R
  p10: number;
  p50: number;
  p90: number;
  /** 경로별 최대 역행(진입 대비 %)의 중앙값. */
  medianDrawdownPct: number;
  insufficient?: boolean;
}

export interface McInput {
  entry: number;
  stop: number;
  target: number;
  direction: "long" | "short";
  /** 기준 TF의 종가 시계열 (수익률 분포 추출용). */
  closes: number[];
  /** 시뮬 기간 (기준 TF 봉 수). */
  horizonBars: number;
  paths?: number;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface RangeCone {
  /** 기한 후 가격 변동률(%)의 10퍼센타일 (하단). */
  lowPct: number;
  /** 90퍼센타일 (상단). */
  highPct: number;
  insufficient?: boolean;
}

/**
 * 예상 변동 범위 콘 — 기준 TF 종가 분포를 부트스트랩(드리프트 0)해
 * "다음 N봉 후 80% 확률로 들어올 변동폭"을 추정. 방향 예측 아님.
 */
export function simulateRange(closes: number[], horizonBars: number, paths = 2000): RangeCone {
  if (closes.length < 30 || horizonBars < 1) return { lowPct: 0, highPct: 0, insufficient: true };
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (rets.length < 20) return { lowPct: 0, highPct: 0, insufficient: true };
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const centered = rets.map((r) => r - mean);
  // Winsorize — 신규 상장 등 극단 수익률이 콘을 폭증시키지 않게 2.5~97.5%로 클램프.
  const sorted = [...centered].sort((a, b) => a - b);
  const lo = quantile(sorted, 0.025);
  const hi = quantile(sorted, 0.975);
  const pool = centered.map((r) => Math.max(lo, Math.min(hi, r)));
  const n = pool.length;

  const finals: number[] = new Array(paths);
  for (let p = 0; p < paths; p++) {
    let cum = 0;
    for (let s = 0; s < horizonBars; s++) cum += pool[(Math.random() * n) | 0];
    finals[p] = (Math.exp(cum) - 1) * 100;
  }
  finals.sort((a, b) => a - b);
  return { lowPct: quantile(finals, 0.1), highPct: quantile(finals, 0.9) };
}

export function simulateScenario(input: McInput): McResult {
  const { entry, stop, target, direction, closes, horizonBars } = input;
  const paths = input.paths ?? 4000;
  const isLong = direction === "long";
  const risk = Math.abs(entry - stop);

  // 유효성: 손절/목표가 방향에 맞아야 함.
  const stopValid = isLong ? stop < entry : stop > entry;
  const targetValid = isLong ? target > entry : target < entry;
  if (!(risk > 0) || !stopValid || !targetValid || closes.length < 30 || horizonBars < 1) {
    return {
      paths: 0,
      pTarget: 0,
      pStop: 0,
      pTimeout: 0,
      expR: 0,
      p10: 0,
      p50: 0,
      p90: 0,
      medianDrawdownPct: 0,
      insufficient: true,
    };
  }

  // 로그 수익률 → 평균 제거(드리프트 0).
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (rets.length < 20) {
    return {
      paths: 0,
      pTarget: 0,
      pStop: 0,
      pTimeout: 0,
      expR: 0,
      p10: 0,
      p50: 0,
      p90: 0,
      medianDrawdownPct: 0,
      insufficient: true,
    };
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const centered = rets.map((r) => r - mean);
  const n = centered.length;

  const targetR = Math.abs(target - entry) / risk;

  let nTarget = 0;
  let nStop = 0;
  let nTimeout = 0;
  const rSamples: number[] = [];
  const drawdowns: number[] = [];

  for (let p = 0; p < paths; p++) {
    let price = entry;
    let maxAdverse = 0; // 진입 대비 역행폭 (양수)
    let outcome: "target" | "stop" | "timeout" = "timeout";

    for (let step = 0; step < horizonBars; step++) {
      const r = centered[(Math.random() * n) | 0];
      price *= Math.exp(r);

      const adverse = isLong ? entry - price : price - entry;
      if (adverse > maxAdverse) maxAdverse = adverse;

      const hitStop = isLong ? price <= stop : price >= stop;
      const hitTarget = isLong ? price >= target : price <= target;

      if (hitStop) {
        outcome = "stop"; // 동시 터치 시도 손절 우선
        break;
      }
      if (hitTarget) {
        outcome = "target";
        break;
      }
    }

    if (outcome === "target") {
      nTarget++;
      rSamples.push(targetR);
    } else if (outcome === "stop") {
      nStop++;
      rSamples.push(-1);
    } else {
      nTimeout++;
      const signed = (isLong ? price - entry : entry - price) / risk;
      rSamples.push(signed);
    }
    drawdowns.push((maxAdverse / entry) * 100);
  }

  rSamples.sort((a, b) => a - b);
  drawdowns.sort((a, b) => a - b);
  const expR = rSamples.reduce((a, b) => a + b, 0) / rSamples.length;

  return {
    paths,
    pTarget: nTarget / paths,
    pStop: nStop / paths,
    pTimeout: nTimeout / paths,
    expR,
    p10: quantile(rSamples, 0.1),
    p50: quantile(rSamples, 0.5),
    p90: quantile(rSamples, 0.9),
    medianDrawdownPct: quantile(drawdowns, 0.5),
  };
}
