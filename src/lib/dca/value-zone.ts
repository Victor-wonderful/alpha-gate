/**
 * DCA G2 — 밸류 존 판정 ("지금 싼 구간인가").
 *
 * ⚠️ 이 파일의 계산은 백테스트 하니스(`scripts/backtest-dca-valuezone.mjs`)와
 * **정의가 완전히 같아야 한다.** 검증(BTC/ETH 7년 + SOL 4.7년, 3심볼 전부 평단 개선)을
 * 통과한 것은 그 정의이고, 다르게 구현하면 검증되지 않은 변형이 된다.
 * 특히 볼륨 프로파일은 기존 `analysis/volume-profile.ts` 와 분배 방식이 달라
 * (저 파일은 고저 범위에 분산, 여기는 중간값 바인) 재사용하지 않고 여기 별도로 둔다.
 *
 * cf. docs/DCA-모드-설계.md §G2 · §10
 */

export type ValueVerdict = "cheap" | "neutral" | "expensive";

export interface DailyCandle {
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ValueSignal {
  key: "drawdown" | "ma200" | "volumeProfile";
  /** 사용자에게 보일 짧은 이름. */
  label: string;
  verdict: ValueVerdict;
  /** 왜 그렇게 봤는지 한 줄 (숫자 포함). */
  detail: string;
}

export interface ValueZoneResult {
  ok: boolean;
  error?: string;
  verdict: ValueVerdict;
  cheapVotes: number;
  expensiveVotes: number;
  signals: ValueSignal[];
  price: number;
  /** 채택안 D(기울인 DCA)의 회차 금액 배수. */
  tiltMultiplier: number;
}

/** MA200 + 365D 볼륨 프로파일 + 낙폭 히스토리를 확보하기 위한 최소 일봉 수(하니스 WARMUP과 동일). */
export const MIN_HISTORY_DAYS = 400;

/** 채택안 D — 항상 사되 기울인다. cheap 2배 / 중립 1배 / 비쌈 0.5배.
 *  B(cheap 온리)는 평단이 가장 좋지만 최장 무매수 2.6년이라 규율 유지가 불가능했고,
 *  C(비쌈 0)는 상승장에 현금이 놀아 최종가치가 오히려 나빴다. cf. 설계서 §10 */
export const TILT_MULTIPLIER: Record<ValueVerdict, number> = {
  cheap: 2,
  neutral: 1,
  expensive: 0.5,
};

/** 하니스와 동일한 볼륨 프로파일 — 각 봉의 거래량 전부를 중간값이 속한 구간에 넣는다. */
export function dcaVolumeProfile(
  candles: DailyCandle[],
  binCount = 40,
  vaPct = 0.7,
): { val: number; vah: number } | null {
  if (!candles.length) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of candles) {
    if (c.low < lo) lo = c.low;
    if (c.high > hi) hi = c.high;
  }
  const size = (hi - lo) / binCount;
  if (!(size > 0)) return null;

  const bins = new Array<number>(binCount).fill(0);
  for (const c of candles) {
    const mid = (c.high + c.low) / 2;
    const i = Math.min(binCount - 1, Math.max(0, Math.floor((mid - lo) / size)));
    bins[i] += c.volume;
  }

  let poc = 0;
  for (let i = 1; i < binCount; i++) if (bins[i] > bins[poc]) poc = i;

  const total = bins.reduce((s, v) => s + v, 0);
  let acc = bins[poc];
  let a = poc;
  let b = poc;
  while (acc < total * vaPct && (a > 0 || b < binCount - 1)) {
    const left = a > 0 ? bins[a - 1] : -1;
    const right = b < binCount - 1 ? bins[b + 1] : -1;
    if (right >= left) {
      b++;
      acc += bins[b];
    } else {
      a--;
      acc += bins[a];
    }
  }
  return { val: lo + a * size, vah: lo + (b + 1) * size };
}

const fmtPct = (x: number) => `${(x * 100).toFixed(1)}%`;

/**
 * 일봉 히스토리(오름차순)로 오늘의 밸류 존을 판정한다.
 * 3지표 다수결 — 2표 이상이면 그 판정, 아니면 중립.
 *
 * 낙폭 백분위는 "지금까지의 역사 안에서 현재 낙폭이 얼마나 깊은 축인가"이므로
 * 넘겨준 히스토리 전체를 모집단으로 쓴다(하니스의 확장 방식과 동일한 결과).
 */
export function classifyValueZone(candles: DailyCandle[]): ValueZoneResult {
  const empty: ValueZoneResult = {
    ok: false,
    verdict: "neutral",
    cheapVotes: 0,
    expensiveVotes: 0,
    signals: [],
    price: 0,
    tiltMultiplier: TILT_MULTIPLIER.neutral,
  };

  if (!Array.isArray(candles) || candles.length < MIN_HISTORY_DAYS) {
    return {
      ...empty,
      error: `일봉이 ${MIN_HISTORY_DAYS}개는 있어야 판정할 수 있습니다 (현재 ${candles?.length ?? 0}개).`,
    };
  }

  const last = candles[candles.length - 1];
  const price = last.close;
  if (!(price > 0)) return { ...empty, error: "현재가를 읽을 수 없습니다." };

  const signals: ValueSignal[] = [];
  let cheapVotes = 0;
  let expensiveVotes = 0;
  const vote = (v: ValueVerdict) => {
    if (v === "cheap") cheapVotes++;
    else if (v === "expensive") expensiveVotes++;
  };

  // ① 고점 대비 낙폭 백분위 — 하위 30%(깊은 쪽) = 쌈, 상위 30%(고점권) = 비쌈.
  const ddHist: number[] = [];
  let ath = 0;
  for (const c of candles) {
    ath = Math.max(ath, c.high);
    ddHist.push(c.close / ath - 1); // ≤ 0
  }
  const dd = ddHist[ddHist.length - 1];
  const sorted = [...ddHist].sort((x, y) => x - y); // 깊은 순
  const rank = sorted.findIndex((v) => v >= dd) / sorted.length; // 0 = 가장 깊음
  const ddVerdict: ValueVerdict = rank <= 0.3 ? "cheap" : rank >= 0.7 ? "expensive" : "neutral";
  vote(ddVerdict);
  signals.push({
    key: "drawdown",
    label: "고점 대비 낙폭",
    verdict: ddVerdict,
    detail: `고점 대비 ${fmtPct(dd)} — 역사상 ${ddVerdict === "cheap" ? "깊은" : ddVerdict === "expensive" ? "얕은" : "보통"} 축 (하위 ${(rank * 100).toFixed(0)}%)`,
  });

  // ② 200일 이동평균 — 아래면 쌈, 30% 이상 위면 비쌈.
  let sum = 0;
  for (let k = candles.length - 200; k < candles.length; k++) sum += candles[k].close;
  const ma = sum / 200;
  const maVerdict: ValueVerdict = price < ma ? "cheap" : price > ma * 1.3 ? "expensive" : "neutral";
  vote(maVerdict);
  signals.push({
    key: "ma200",
    label: "200일 평균선",
    verdict: maVerdict,
    detail: `평균선 대비 ${fmtPct(price / ma - 1)} (${ma.toFixed(ma >= 100 ? 0 : 4)})`,
  });

  // ③ 365일 볼륨 프로파일 — 매물대 하단 이하면 쌈, 상단 이상이면 비쌈.
  const vp = dcaVolumeProfile(candles.slice(candles.length - 365));
  if (vp) {
    const vpVerdict: ValueVerdict = price <= vp.val ? "cheap" : price >= vp.vah ? "expensive" : "neutral";
    vote(vpVerdict);
    signals.push({
      key: "volumeProfile",
      label: "1년 매물대",
      verdict: vpVerdict,
      detail: `하단 ${vp.val.toFixed(vp.val >= 100 ? 0 : 4)} / 상단 ${vp.vah.toFixed(vp.vah >= 100 ? 0 : 4)} 사이에서 ${vpVerdict === "cheap" ? "하단 이하" : vpVerdict === "expensive" ? "상단 이상" : "중간"}`,
    });
  }

  const verdict: ValueVerdict = cheapVotes >= 2 ? "cheap" : expensiveVotes >= 2 ? "expensive" : "neutral";
  return {
    ok: true,
    verdict,
    cheapVotes,
    expensiveVotes,
    signals,
    price,
    tiltMultiplier: TILT_MULTIPLIER[verdict],
  };
}
