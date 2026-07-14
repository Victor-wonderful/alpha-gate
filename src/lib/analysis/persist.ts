import "server-only";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { AnalysisSnapshot } from "./analyze";
import type { AnalysisReport } from "./synthesize";
import type { StrategyResult } from "./strategy";

// timeframe별 시나리오 만료 시간 (ms)
const SCENARIO_TIMEOUT_MS: Record<string, number> = {
  "5m": 12 * 60 * 60_000,       // 12시간
  "15m": 2 * 24 * 60 * 60_000,  // 2일 (스캘프)
  "1h": 3 * 24 * 60 * 60_000,   // 3일 (데이)
  "4h": 7 * 24 * 60 * 60_000,   // 7일 (스윙)
  "1D": 30 * 24 * 60 * 60_000,  // 30일 (포지션→DCA)
  "1d": 30 * 24 * 60 * 60_000,
};

/** 표시용 방향 — 전략 방향이 null이어도 시나리오가 단일 방향이면 그걸로. 혼합/없음은 null(양방향). */
function displayDirection(strategy: StrategyResult, report: AnalysisReport): "long" | "short" | null {
  if (strategy.direction) return strategy.direction;
  const dirs = new Set(report.scenarios.map((s) => s.direction));
  return dirs.size === 1 ? ([...dirs][0] as "long" | "short") : null;
}

function inferTimeframe(style: string): string {
  // 스타일별 기준 타임프레임 (entry trigger TF)
  if (style === "scalp") return "15m";
  if (style === "day") return "1h";
  if (style === "swing") return "4h";
  if (style === "position") return "1D";
  return "4h";
}

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

  const isBacktest = snapshot.mode === "backtest";
  const { data, error } = await supabase
    .from("analyses")
    .insert({
      user_id: user.id,
      symbol: snapshot.symbol,
      style: snapshot.style,
      primary_strategy: strategy.primary,
      strategy_direction: displayDirection(strategy, report),
      strategy_confidence: strategy.confidence,
      scenarios_count: report.scenarios.length,
      current_price: snapshot.ticker.last,
      mode: isBacktest ? "backtest" : "live",
      historical_at: snapshot.historicalAt ?? null,
      snapshot,
      strategy,
      report,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // 시나리오 자동 추적 등록 — wait 전략은 시나리오 0개라 skip
  // 백테스트는 과거 시점 시뮬이므로 라이브 가격 추적 대상이 아님 → skip
  if (!isBacktest && report.scenarios.length > 0 && strategy.primary !== "wait") {
    const timeframe = inferTimeframe(snapshot.style);
    const timeoutMs = SCENARIO_TIMEOUT_MS[timeframe] ?? 7 * 24 * 60 * 60_000;
    const expiresAt = new Date(Date.now() + timeoutMs).toISOString();

    const outcomeRows = report.scenarios
      .map((s, idx) => {
        // entryZone 중간값을 entry로 사용
        const entryPrice = (s.entryZone.low + s.entryZone.high) / 2;
        const stopPrice = s.invalidation;
        const targetPrice = s.target;
        // 유효성 검사 — 가격이 0이거나 NaN이면 skip
        if (
          !Number.isFinite(entryPrice) ||
          !Number.isFinite(stopPrice) ||
          !Number.isFinite(targetPrice) ||
          entryPrice <= 0 ||
          stopPrice <= 0 ||
          targetPrice <= 0
        )
          return null;
        return {
          analysis_id: data.id,
          user_id: user.id,
          scenario_index: idx,
          symbol: snapshot.symbol,
          timeframe,
          style: snapshot.style,
          strategy_primary: strategy.primary,
          direction: s.direction,
          entry_price: entryPrice,
          stop_price: stopPrice,
          target_price: targetPrice,
          status: "pending",
          expires_at: expiresAt,
          // 추세 강도/분류 기록 — "강한 추세 즉시진입"만 골라 사후 측정하기 위함 (migration 0039)
          trend_strength: snapshot.trendMetrics?.strength ?? null,
          trend_classification: snapshot.trendMetrics?.classification ?? null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (outcomeRows.length > 0) {
      const { error: outcomeErr } = await supabase
        .from("scenario_outcomes")
        .insert(outcomeRows);
      if (outcomeErr) {
        // 시나리오 추적 실패해도 분석 자체는 성공 처리 — 로그만
        console.error("[saveAnalysis] scenario_outcomes insert failed:", outcomeErr.message);
      }
    }
  }

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
