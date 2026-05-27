"use server";

import { getSupabaseServer } from "@/lib/supabase/server";
import { buildSnapshot, type AnalysisSnapshot } from "@/lib/analysis/analyze";
import { synthesizeAnalysis, type AnalysisReport } from "@/lib/analysis/synthesize";
import { classifyStrategy, type StrategyResult } from "@/lib/analysis/strategy";
import { STYLE_PRESETS, type TradingStyle } from "@/lib/analysis/style";
import { saveAnalysis, loadAnalysis } from "@/lib/analysis/persist";
import { fetchScenarioStats, type ScenarioStats } from "@/lib/analysis/scenario-stats";
import { simulateTrade } from "@/lib/backtest/simulator";
import { revalidatePath } from "next/cache";
import { getAiCredits, spendAiCredit } from "@/lib/paper-wallet";

export async function runAnalysisAction(
  symbol: string,
  style: TradingStyle = "swing",
  /** 백테스트 모드 — ISO 문자열. undefined면 라이브. */
  atIso?: string,
): Promise<{
  snapshot?: AnalysisSnapshot;
  strategy?: StrategyResult;
  report?: AnalysisReport;
  analysisId?: string;
  error?: string;
}> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  if (!/^[A-Z0-9]{2,15}USDT$/i.test(symbol))
    return { error: "심볼 형식이 올바르지 않습니다. 예: BTCUSDT" };

  if (!STYLE_PRESETS[style]) return { error: "지원하지 않는 트레이딩 스타일입니다." };

  // AI 크레딧 확인 (분석 시작 전 선행 검사)
  try {
    const credits = await getAiCredits(user.id);
    if (credits <= 0) {
      return { error: "AI 크레딧이 없습니다. 우측 상단 [설정 → AI 크레딧]에서 패키지를 구매하세요." };
    }
  } catch {
    // 크레딧 조회 실패 시 분석은 계속 진행 (best-effort)
  }

  // Backtest 시점 파싱 & 가드
  let atDate: Date | undefined;
  if (atIso) {
    atDate = new Date(atIso);
    if (isNaN(atDate.getTime())) return { error: "백테스트 시점 형식이 올바르지 않습니다." };
    if (atDate.getTime() > Date.now() - 60 * 60 * 1000) {
      return { error: "백테스트 시점은 최소 1시간 전이어야 합니다." };
    }
    if (atDate.getTime() < Date.now() - 200 * 24 * 60 * 60 * 1000) {
      return { error: "백테스트 시점은 최근 6개월 이내여야 합니다 (Binance 데이터 한계)." };
    }
  }
  const isBacktest = !!atDate;

  // Stage 1: Market Data (deterministic)
  let snapshot: AnalysisSnapshot;
  try {
    snapshot = await buildSnapshot(symbol, style, atDate ? { at: atDate } : undefined);
  } catch (e) {
    return { error: `시장 데이터 수집 실패: ${e instanceof Error ? e.message : "unknown"}` };
  }

  if (!process.env.ANTHROPIC_API_KEY)
    return { snapshot, error: "ANTHROPIC_API_KEY가 설정되지 않았습니다. 데이터 스냅샷만 표시합니다." };

  // Stage 2: Strategy Agent (LLM, focused classification)
  let strategy: StrategyResult;
  try {
    strategy = await classifyStrategy(snapshot);
  } catch (e) {
    return {
      snapshot,
      error: `Strategy Agent 실패: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }

  // Stage 3: Scenario Synthesis (LLM, constrained by strategy)
  let report: AnalysisReport;
  try {
    report = await synthesizeAnalysis(snapshot, strategy);
  } catch (e) {
    return {
      snapshot,
      strategy,
      error: `시나리오 생성 실패: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }

  // range_fade 양방향 전략 — Stage 2의 direction은 null (강제). Stage 3 시나리오의 majority로 결정.
  // 시나리오 long/short 카운트가 같으면 null로 유지 ("양방향" 배지 표시용).
  if (strategy.primary === "range_fade" && report.scenarios.length > 0) {
    const longs = report.scenarios.filter((s) => s.direction === "long").length;
    const shorts = report.scenarios.filter((s) => s.direction === "short").length;
    if (longs > shorts) strategy = { ...strategy, direction: "long" };
    else if (shorts > longs) strategy = { ...strategy, direction: "short" };
    else strategy = { ...strategy, direction: null }; // 동률 = 양방향 유지
  }

  // Stage 4: 백테스트 모드면 시나리오마다 walk-forward 시뮬 자동 실행
  if (isBacktest && atDate && report.scenarios.length > 0) {
    const sims = await Promise.allSettled(
      report.scenarios.map((s) => {
        const entryPrice = s.entries && s.entries.length > 0
          ? (() => {
              const wSum = s.entries.reduce((a, e) => a + (e.weight || 0), 0);
              return wSum > 0
                ? s.entries.reduce((a, e) => a + e.price * (e.weight / wSum), 0)
                : s.entries.reduce((a, e) => a + e.price, 0) / s.entries.length;
            })()
          : (s.entryZone.low + s.entryZone.high) / 2;
        return simulateTrade({
          symbol,
          direction: s.direction,
          entry: entryPrice,
          stop: s.invalidation,
          target: s.target,
          simulatedAt: atDate,
          style,
        });
      }),
    );
    report.scenarios = report.scenarios.map((s, i) => {
      const r = sims[i];
      if (r.status === "fulfilled") {
        return { ...s, simulation: r.value };
      }
      return s;
    });
  }

  // Persist (best-effort — do not fail analysis if this fails)
  let analysisId: string | undefined;
  try {
    const saved = await saveAnalysis({ snapshot, strategy, report });
    analysisId = saved.id;
    revalidatePath("/app/dashboard");
    revalidatePath("/app");
  } catch (e) {
    console.error("Failed to persist analysis:", e);
  }

  // AI 크레딧 차감 (분석 성공 시에만 — best-effort)
  try {
    await spendAiCredit(user.id);
  } catch (e) {
    console.error("AI 크레딧 차감 실패 (분석은 완료됨):", e);
  }

  return { snapshot, strategy, report, analysisId };
}

export async function loadAnalysisAction(id: string): Promise<
  | { snapshot: AnalysisSnapshot; strategy: StrategyResult; report: AnalysisReport }
  | { error: string }
> {
  return await loadAnalysis(id);
}

export async function deleteAnalysisAction(id: string): Promise<{ error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("analyses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/app/analyze");
  revalidatePath("/app/analyze/history");
  return {};
}

/**
 * 분석 결과의 시나리오 알림 등록 상태 조회.
 * scenario_outcomes 테이블에서 (analysis_id, scenario_index) → watch 값을 맵으로 반환.
 */
export async function loadScenarioWatchStatesAction(
  analysisId: string,
): Promise<{ states?: Record<number, { id: string; watch: boolean; status: string }>; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data, error } = await supabase
    .from("scenario_outcomes")
    .select("id, scenario_index, watch, status")
    .eq("analysis_id", analysisId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  const states: Record<number, { id: string; watch: boolean; status: string }> = {};
  for (const row of data ?? []) {
    states[row.scenario_index] = {
      id: row.id,
      watch: Boolean(row.watch),
      status: row.status,
    };
  }
  return { states };
}

/**
 * 시나리오 알림 등록 토글.
 */
export async function toggleScenarioWatchAction(args: {
  scenarioId: string;
  watch: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("scenario_outcomes")
    .update({ watch: args.watch })
    .eq("id", args.scenarioId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * 특정 (symbol, strategy)의 시나리오 적중률 통계.
 * 분석 결과 페이지에서 "이 전략의 과거 성과" 표시용.
 */
export async function loadScenarioStatsAction(args: {
  symbol: string;
  strategyPrimary: string;
  days?: number;
}): Promise<{ stats?: ScenarioStats; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  try {
    const stats = await fetchScenarioStats(args);
    return { stats };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "통계 조회 실패" };
  }
}
