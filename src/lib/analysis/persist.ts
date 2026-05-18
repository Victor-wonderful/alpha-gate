import "server-only";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { AnalysisSnapshot } from "./analyze";
import type { AnalysisReport } from "./synthesize";
import type { StrategyResult } from "./strategy";

export async function saveAnalysis(args: {
  snapshot: AnalysisSnapshot;
  strategy: StrategyResult;
  report: AnalysisReport;
}): Promise<{ id?: string; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated" };

  const { snapshot, strategy, report } = args;

  const { data, error } = await supabase
    .from("analyses")
    .insert({
      user_id: user.id,
      symbol: snapshot.symbol,
      style: snapshot.style,
      primary_strategy: strategy.primary,
      strategy_direction: strategy.direction,
      strategy_confidence: strategy.confidence,
      scenarios_count: report.scenarios.length,
      current_price: snapshot.ticker.last,
      mode: snapshot.mode ?? "live",
      historical_at: snapshot.historicalAt ?? null,
      snapshot,
      strategy,
      report,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: data.id };
}

export async function loadAnalysis(id: string): Promise<
  | { snapshot: AnalysisSnapshot; strategy: StrategyResult; report: AnalysisReport }
  | { error: string }
> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data, error } = await supabase
    .from("analyses")
    .select("snapshot, strategy, report")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) return { error: error?.message ?? "분석을 찾을 수 없습니다." };

  return {
    snapshot: data.snapshot as AnalysisSnapshot,
    strategy: data.strategy as StrategyResult,
    report: data.report as AnalysisReport,
  };
}
