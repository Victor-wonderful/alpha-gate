"use server";

import { getSupabaseServer } from "@/lib/supabase/server";
import { buildSnapshot, type AnalysisSnapshot } from "@/lib/analysis/analyze";
import { synthesizeAnalysis, type AnalysisReport } from "@/lib/analysis/synthesize";
import { classifyStrategy, type StrategyResult } from "@/lib/analysis/strategy";
import { STYLE_PRESETS, type TradingStyle } from "@/lib/analysis/style";
import { saveAnalysis, loadAnalysis } from "@/lib/analysis/persist";
import { revalidatePath } from "next/cache";
import { getAiCredits, spendAiCredit } from "@/lib/paper-wallet";

export async function runAnalysisAction(
  symbol: string,
  style: TradingStyle = "swing",
): Promise<{
  snapshot?: AnalysisSnapshot;
  strategy?: StrategyResult;
  report?: AnalysisReport;
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
      return { error: "AI 크레딧이 없습니다. 크레딧을 충전하거나 관리자에게 문의하세요." };
    }
  } catch {
    // 크레딧 조회 실패 시 분석은 계속 진행 (best-effort)
  }

  // Stage 1: Market Data (deterministic)
  let snapshot: AnalysisSnapshot;
  try {
    snapshot = await buildSnapshot(symbol, style);
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

  // Persist (best-effort — do not fail analysis if this fails)
  try {
    await saveAnalysis({ snapshot, strategy, report });
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

  return { snapshot, strategy, report };
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
