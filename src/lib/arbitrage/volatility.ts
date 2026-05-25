import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";

export type KimchiVolatility = {
  symbol: string;
  samples: number;
  stdev: number;       // 표준편차 (%)
  range: number;       // max - min (%)
  min: number;
  max: number;
  avg: number;
  cyclesPerDay: number; // 시뮬레이션된 일 평균 사이클 수
  cyclesTotal: number;  // 측정 구간 전체 사이클 수
  spanHours: number;    // 측정 시간
  simProfit: number;    // 백테스트 누적 수익 ($1000 노출 기준)
  simProfitPerDay: number; // 일평균 환산
  simEffectiveCycles: number; // 백테스트 중 실제 인벤토리 이동 사이클 수
};

const DEFAULT_THRESHOLD = 0.5;
const DEFAULT_NOTIONAL = 1000;
const FRACTION = 0.25;
const FEE_RATE = 0.0004;
const SLIPPAGE_RATE = 0.0002;

/**
 * 임계값 threshold 가정 하의 단순 tick 카운트 (실제 cron 동작과 일치).
 * 인벤토리 고갈 무시. 사이클 발생 빈도 측정용.
 */
function simulateCycles(timeSeries: number[], threshold: number): number {
  let count = 0;
  for (const p of timeSeries) {
    if (p >= threshold || p <= -threshold) count++;
  }
  return count;
}

/**
 * 백테스트 시뮬레이션 — 실제 resolve 로직 그대로 시계열에 적용.
 * 인벤토리 25%씩 이동, 고갈되면 더 이상 사이클 안 됨.
 * 코인 가격 변동까지 PnL에 자동 반영 (인벤토리 가치 변동).
 *
 * 입력: 시간순 정렬된 (premium, upbitUsd, binanceUsd) 스냅샷
 * 출력: 누적 수익 ($), 실제 실행된 사이클 수
 */
function backtestProfit(
  series: Array<{ premium: number; upbitUsd: number; binanceUsd: number }>,
  threshold: number,
  notional: number,
): { profit: number; effectiveCycles: number } {
  if (series.length < 2) return { profit: 0, effectiveCycles: 0 };

  // 첫 스냅샷 가격으로 초기 인벤토리 셋업
  const first = series[0];
  if (first.upbitUsd <= 0 || first.binanceUsd <= 0)
    return { profit: 0, effectiveCycles: 0 };
  let coinUpbit = notional / 2 / first.upbitUsd;
  let coinBinance = notional / 2 / first.binanceUsd;
  let usdtUpbit = notional / 2;
  let usdtBinance = notional / 2;

  let cycleProfit = 0;
  let effectiveCycles = 0;

  for (const tick of series) {
    const { premium, upbitUsd, binanceUsd } = tick;
    if (upbitUsd <= 0 || binanceUsd <= 0) continue;

    if (premium >= threshold) {
      const maxFromUpbit = coinUpbit;
      const maxFromBinance = usdtBinance / binanceUsd;
      const coinMoved = Math.min(maxFromUpbit, maxFromBinance) * FRACTION;
      if (coinMoved <= 0) continue;

      coinUpbit -= coinMoved;
      usdtUpbit += coinMoved * upbitUsd;
      coinBinance += coinMoved;
      usdtBinance -= coinMoved * binanceUsd;

      const gross = coinMoved * (upbitUsd - binanceUsd);
      const tradeNotional = coinMoved * (upbitUsd + binanceUsd);
      cycleProfit += gross - tradeNotional * (FEE_RATE + SLIPPAGE_RATE);
      effectiveCycles++;
    } else if (premium <= -threshold) {
      const maxToUpbit = usdtUpbit / upbitUsd;
      const maxFromBinance = coinBinance;
      const coinMoved = Math.min(maxToUpbit, maxFromBinance) * FRACTION;
      if (coinMoved <= 0) continue;

      coinUpbit += coinMoved;
      usdtUpbit -= coinMoved * upbitUsd;
      coinBinance -= coinMoved;
      usdtBinance += coinMoved * binanceUsd;

      const gross = coinMoved * (binanceUsd - upbitUsd);
      const tradeNotional = coinMoved * (upbitUsd + binanceUsd);
      cycleProfit += gross - tradeNotional * (FEE_RATE + SLIPPAGE_RATE);
      effectiveCycles++;
    }
  }

  // 마지막 시점 인벤토리 시가 평가 → 코인 가격 변동 손익 포함
  const last = series[series.length - 1];
  const finalValue =
    coinUpbit * last.upbitUsd +
    coinBinance * last.binanceUsd +
    usdtUpbit +
    usdtBinance;
  const priceExposurePnl = finalValue - 2 * notional;

  // 총 수익 = 사이클 누적 + 코인 가격 변동 (이미 finalValue에 사이클 결과 포함되어 있음)
  // priceExposurePnl 이 cycleProfit + (coin price change) 를 모두 담고 있음
  return { profit: priceExposurePnl, effectiveCycles };
}

/**
 * 최근 days 일 김프 변동성 + 사이클 시뮬레이션 + 백테스트 수익 추정.
 * threshold(%): 김프가 ±threshold 도달 시 사이클 발동.
 * 정렬: 백테스트 수익 큰 순.
 */
export async function fetchKimchiVolatility(
  days = 7,
  threshold = DEFAULT_THRESHOLD,
): Promise<KimchiVolatility[]> {
  const supabase = getSupabaseService();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("kimchi_history")
    .select("symbol, premium_pct, upbit_krw, binance_usd, usd_krw_rate, recorded_at")
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: true })
    .limit(100000);

  if (error || !data || data.length === 0) return [];

  const bySymbol = new Map<
    string,
    {
      values: number[];
      times: number[];
      series: Array<{ premium: number; upbitUsd: number; binanceUsd: number }>;
    }
  >();
  for (const row of data) {
    const entry = bySymbol.get(row.symbol) ?? { values: [], times: [], series: [] };
    const premium = Number(row.premium_pct);
    const upbitKrw = Number(row.upbit_krw);
    const usdKrw = Number(row.usd_krw_rate);
    const upbitUsd = usdKrw > 0 ? upbitKrw / usdKrw : 0;
    const binanceUsd = Number(row.binance_usd);
    entry.values.push(premium);
    entry.times.push(new Date(row.recorded_at).getTime());
    entry.series.push({ premium, upbitUsd, binanceUsd });
    bySymbol.set(row.symbol, entry);
  }

  const result: KimchiVolatility[] = [];
  for (const [symbol, { values, times, series }] of bySymbol) {
    if (values.length === 0) continue;
    const n = values.length;
    const avg = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / n;
    const stdev = Math.sqrt(variance);
    const min = Math.min(...values);
    const max = Math.max(...values);

    const spanMs = times.length >= 2 ? times[times.length - 1] - times[0] : 0;
    const spanHours = spanMs / (60 * 60 * 1000);
    const cyclesTotal = simulateCycles(values, threshold);
    const cyclesPerDay = spanHours > 0 ? (cyclesTotal / spanHours) * 24 : 0;

    const { profit: simProfit, effectiveCycles: simEffectiveCycles } = backtestProfit(
      series,
      threshold,
      DEFAULT_NOTIONAL,
    );
    const simProfitPerDay = spanHours > 0 ? (simProfit / spanHours) * 24 : 0;

    result.push({
      symbol,
      samples: n,
      stdev,
      range: max - min,
      min,
      max,
      avg,
      cyclesPerDay,
      cyclesTotal,
      spanHours,
      simProfit,
      simProfitPerDay,
      simEffectiveCycles,
    });
  }

  // 백테스트 수익 큰 순 (실제 기대 수익률)
  result.sort((a, b) => b.simProfit - a.simProfit);
  return result;
}
