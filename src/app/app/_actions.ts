"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { dispatch } from "@/lib/notify-dispatch";
import { simulateTrade } from "@/lib/backtest/simulator";
import type { GradeResult, SizingResult, TradeInput } from "@/types/trade";

export async function saveTradeAction(args: {
  input: TradeInput;
  grade: GradeResult;
  sizing: SizingResult;
  leverage?: number;
  /** 'live'(기본) 또는 'backtest'. */
  mode?: "live" | "backtest";
  /** 백테스트 시 분석 기준 시각 (ISO). live는 null. */
  simulatedAt?: string | null;
}): Promise<{
  id?: string;
  error?: string;
  backtest?: {
    resultR: number;
    exitReason: "target" | "stop" | "time" | "no_entry";
    exitPrice: number;
    closedAt: string;
  };
}> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { input, grade, sizing, leverage, mode = "live", simulatedAt = null } = args;

  const isBacktest = mode === "backtest" && !!simulatedAt;

  const { data, error } = await supabase
    .from("trades")
    .insert({
      user_id: user.id,
      symbol: input.symbol,
      direction: input.direction,
      timeframe: input.timeframe,
      entry: input.entry,
      stop: input.stop,
      target: input.target,
      account_size: input.accountSize,
      allowed_loss_pct: input.allowedLossPct,
      position_quantity: sizing.quantity,
      market_checks: input.market,
      psych_checks: {}, // deprecated, kept for NOT NULL constraint
      context_flags: {
        leverage: leverage ?? 1,
        trigger: input.trigger,
        marketCtx: input.marketCtx,
      },
      pre_grade: grade.grade,
      pre_score: grade.score,
      pre_score_breakdown: grade.reasons,
      pre_actions: grade.actions,
      pre_rr: grade.rr,
      mode,
      simulated_at: isBacktest ? simulatedAt : null,
    })
    .select("id, pre_grade")
    .single();

  if (error || !data) return { error: error?.message ?? "저장 실패" };

  // 백테스트 모드 — walk-forward 시뮬 후 결과를 같은 행에 채워줌
  if (isBacktest) {
    try {
      // style 추론: timeframe 기반 매핑 (간단 휴리스틱)
      const style =
        input.timeframe === "15m"
          ? "scalp"
          : input.timeframe === "1h"
            ? "day"
            : input.timeframe === "4h"
              ? "swing"
              : "position"; // "1D" → position

      const sim = await simulateTrade({
        symbol: input.symbol,
        direction: input.direction,
        entry: input.entry,
        stop: input.stop,
        target: input.target,
        simulatedAt: simulatedAt!,
        style,
      });

      await supabase
        .from("trades")
        .update({
          exit_price: sim.exitPrice,
          result_r: sim.resultR,
          exit_reason:
            sim.exitReason === "target" || sim.exitReason === "stop"
              ? sim.exitReason
              : "manual",
          closed_at: sim.closedAt,
          simulation_meta: { ...sim.meta, exitReason: sim.exitReason },
        })
        .eq("id", data.id)
        .eq("user_id", user.id);

      revalidatePath("/app/journal");
      revalidatePath("/app/dashboard");
      revalidatePath("/app");

      return {
        id: data.id,
        backtest: {
          resultR: sim.resultR,
          exitReason: sim.exitReason,
          exitPrice: sim.exitPrice,
          closedAt: sim.closedAt,
        },
      };
    } catch (e) {
      // 시뮬 실패해도 거래는 저장됨 — 사용자에게 에러만 전달
      console.error("Backtest simulation failed:", e);
      revalidatePath("/app/journal");
      return {
        id: data.id,
        error: `백테스트 시뮬 실패: ${e instanceof Error ? e.message : "unknown"}`,
      };
    }
  }

  // Fire notifications (best-effort, no throw) — 백테스트는 알림 안 보냄
  if (grade.grade === "D") {
    await dispatch(user.id, "d_grade_warn", {
      title: "거래 금지 등급으로 저장됨",
      body: `${input.symbol} ${input.direction === "long" ? "롱" : "숏"} ${input.timeframe} · 점수 ${grade.score}\n${grade.actions.slice(0, 2).join("\n")}`,
      tradeId: data.id,
    });
  }
  revalidatePath("/app/journal");
  revalidatePath("/app/dashboard");
  return { id: data.id };
}

export async function updateOutcomeAction(args: {
  id: string;
  exitPrice: number;
  resultR: number;
  exitReason: "target" | "stop" | "manual";
  mistakeTags: string[];
  note: string;
}): Promise<{ error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("trades")
    .update({
      exit_price: args.exitPrice,
      result_r: args.resultR,
      exit_reason: args.exitReason,
      mistake_tags: args.mistakeTags,
      note: args.note,
      closed_at: new Date().toISOString(),
    })
    .eq("id", args.id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath(`/app/journal/${args.id}`);
  revalidatePath("/app/journal");
  revalidatePath("/app/dashboard");
  return {};
}
