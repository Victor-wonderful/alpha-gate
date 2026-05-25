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
  spanHours: number;    // 측정 시간 (시간 단위)
};

const DEFAULT_THRESHOLD = 0.5; // %

/**
 * 임계값 threshold(%) 가정 하에, 시계열 premium 을 훑으며 사이클 횟수를 시뮬레이션.
 *
 * 실제 resolve-arbitrage cron 로직과 동일:
 * - 5분마다 snapshot 확인
 * - premium >= +threshold 또는 premium <= -threshold → 매 tick 마다 +1 사이클
 * - 김프가 임계값 너머에 머물면 같은 방향 사이클이 누적됨 (실제 동작과 일치)
 */
function simulateCycles(timeSeries: number[], threshold: number): number {
  let count = 0;
  for (const p of timeSeries) {
    if (p >= threshold || p <= -threshold) count++;
  }
  return count;
}

/**
 * 최근 days일 김프 변동성 + 사이클 발생 시뮬레이션.
 * threshold(%): 김프가 ±threshold 도달 시 사이클 1회로 가정. 기본 0.5%.
 */
export async function fetchKimchiVolatility(
  days = 7,
  threshold = DEFAULT_THRESHOLD,
): Promise<KimchiVolatility[]> {
  const supabase = getSupabaseService();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("kimchi_history")
    .select("symbol, premium_pct, recorded_at")
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: true }) // 시간순으로 정렬 (시뮬레이션용)
    .limit(100000);

  if (error || !data || data.length === 0) return [];

  const bySymbol = new Map<string, { values: number[]; times: number[] }>();
  for (const row of data) {
    const entry = bySymbol.get(row.symbol) ?? { values: [], times: [] };
    entry.values.push(Number(row.premium_pct));
    entry.times.push(new Date(row.recorded_at).getTime());
    bySymbol.set(row.symbol, entry);
  }

  const result: KimchiVolatility[] = [];
  for (const [symbol, { values, times }] of bySymbol) {
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
    });
  }

  // 일평균 사이클 많은 순 (= 수익 기회 많음)
  result.sort((a, b) => b.cyclesPerDay - a.cyclesPerDay);
  return result;
}
