import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";

export type ScenarioStats = {
  total: number;
  pending: number;
  triggered: number;
  target: number;
  stop: number;
  expired: number;
  winRate: number;        // target / (target + stop) — 결정된 시나리오 중 승률
  hitRate: number;        // (target + stop) / total - pending — 트리거된 비율
  avgR: number;           // 결정된 시나리오 평균 R
};

const empty: ScenarioStats = {
  total: 0,
  pending: 0,
  triggered: 0,
  target: 0,
  stop: 0,
  expired: 0,
  winRate: 0,
  hitRate: 0,
  avgR: 0,
};

/**
 * 특정 (symbol, strategy) 조합의 최근 N일 시나리오 적중률 집계.
 * 모든 유저의 시나리오 통계를 합산 (개인정보 아님, AI 시그널 품질 평가용).
 */
export async function fetchScenarioStats(args: {
  symbol: string;
  strategyPrimary?: string;
  days?: number;
}): Promise<ScenarioStats> {
  const { symbol, strategyPrimary, days = 30 } = args;
  const since = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();
  const supabase = getSupabaseService();

  let q = supabase
    .from("scenario_outcomes")
    .select("status, result_r")
    .eq("symbol", symbol)
    .gte("created_at", since);

  if (strategyPrimary) q = q.eq("strategy_primary", strategyPrimary);

  const { data, error } = await q.limit(5000);
  if (error || !data) return empty;

  const total = data.length;
  if (total === 0) return empty;

  const counts: Record<string, number> = {
    pending: 0,
    triggered: 0,
    target: 0,
    stop: 0,
    expired: 0,
  };
  let sumR = 0;
  let resolvedCount = 0;
  for (const row of data) {
    const s = row.status as keyof typeof counts;
    if (s in counts) counts[s]++;
    if ((s === "target" || s === "stop") && row.result_r !== null) {
      sumR += Number(row.result_r) || 0;
      resolvedCount++;
    }
  }

  const decided = counts.target + counts.stop;
  const triggered = counts.triggered + counts.target + counts.stop;
  const winRate = decided > 0 ? counts.target / decided : 0;
  const hitRate = total > 0 ? triggered / total : 0;
  const avgR = resolvedCount > 0 ? sumR / resolvedCount : 0;

  return {
    total,
    pending: counts.pending,
    triggered: counts.triggered,
    target: counts.target,
    stop: counts.stop,
    expired: counts.expired,
    winRate,
    hitRate,
    avgR,
  };
}
