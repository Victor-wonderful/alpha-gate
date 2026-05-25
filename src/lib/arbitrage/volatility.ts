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
};

/**
 * 최근 N일간 김프 변동성을 코인별로 집계.
 * 표본이 적으면 (예: 10개 미만) 신뢰도 낮음 → caller가 표시.
 */
export async function fetchKimchiVolatility(days = 7): Promise<KimchiVolatility[]> {
  const supabase = getSupabaseService();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("kimchi_history")
    .select("symbol, premium_pct")
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: false })
    .limit(50000);

  if (error || !data) return [];

  const bySymbol = new Map<string, number[]>();
  for (const row of data) {
    const arr = bySymbol.get(row.symbol) ?? [];
    arr.push(Number(row.premium_pct));
    bySymbol.set(row.symbol, arr);
  }

  const result: KimchiVolatility[] = [];
  for (const [symbol, values] of bySymbol) {
    if (values.length === 0) continue;
    const n = values.length;
    const avg = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / n;
    const stdev = Math.sqrt(variance);
    const min = Math.min(...values);
    const max = Math.max(...values);
    result.push({ symbol, samples: n, stdev, range: max - min, min, max, avg });
  }

  // stdev 큰 순
  result.sort((a, b) => b.stdev - a.stdev);
  return result;
}
