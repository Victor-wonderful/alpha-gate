"use server";

import { getSupabaseServer } from "@/lib/supabase/server";
import { buildSnapshot, type AnalysisSnapshot } from "@/lib/analysis/analyze";
import { synthesizeAnalysis, type AnalysisReport } from "@/lib/analysis/synthesize";
import { classifyStrategy, type StrategyResult } from "@/lib/analysis/strategy";
import { STYLE_PRESETS, type TradingStyle } from "@/lib/analysis/style";
import { saveAnalysis, loadAnalysis } from "@/lib/analysis/persist";
import { simulateTrade } from "@/lib/backtest/simulator";
import { revalidatePath } from "next/cache";

export interface RunAnalysisOptions {
  /** 백테스트 모드 — 이 시점까지의 데이터로만 분석. ISO 8601 문자열 (예: "2026-05-10T05:30:00.000Z"). */
  at?: string | null;
}

export async function runAnalysisAction(
  symbol: string,
  style: TradingStyle = "swing",
  options: RunAnalysisOptions = {},
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

  // 백테스트 시각 검증
  let atDate: Date | undefined;
  if (options.at) {
    atDate = new Date(options.at);
    if (Number.isNaN(atDate.getTime())) {
      return { error: "분석 시점이 올바르지 않은 날짜 형식입니다." };
    }
    const now = Date.now();
    if (atDate.getTime() >= now) {
      return { error: "백테스트 시점은 과거여야 합니다." };
    }
    // Binance 무료 API는 최근 6개월 정도 — 6개월 이전은 거부 (안내 + 안전성)
    const sixMonthsAgo = now - 1000 * 60 * 60 * 24 * 180;
    if (atDate.getTime() < sixMonthsAgo) {
      return { error: "백테스트는 최근 6개월 이내 시점만 지원합니다." };
    }
  }

  // Stage 1: Market Data (deterministic)
  let snapshot: AnalysisSnapshot;
  try {
    snapshot = await buildSnapshot(symbol, style, { at: atDate });
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

  // Stage 4 (백테스트 전용): 각 시나리오에 대해 walk-forward 시뮬레이션 실행
  // 사용자가 거래를 저장하지 않아도 시뮬 결과를 미리 볼 수 있게 함.
  if (atDate) {
    const sims = await Promise.allSettled(
      report.scenarios.map(async (s) => {
        const entry = (s.entryZone.low + s.entryZone.high) / 2;
        return simulateTrade({
          symbol,
          direction: s.direction,
          entry,
          stop: s.invalidation,
          target: s.target,
          simulatedAt: atDate,
          style,
        });
      }),
    );
    report = {
      ...report,
      scenarios: report.scenarios.map((s, i) => {
        const r = sims[i];
        if (r.status !== "fulfilled") return s;
        const sim = r.value;
        return {
          ...s,
          simulation: {
            entryFillPrice: sim.entryFillPrice,
            exitPrice: sim.exitPrice,
            resultR: sim.resultR,
            exitReason: sim.exitReason,
            barsHeld: sim.meta.barsHeld,
            barsToEntry: sim.meta.barsToEntry,
            mfePct: sim.meta.mfePct,
            maePct: sim.meta.maePct,
            interval: sim.meta.interval,
            entryAt: sim.meta.entryCandleTime,
            exitAt: sim.meta.exitCandleTime,
          },
        };
      }),
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
