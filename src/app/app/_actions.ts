"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { dispatch } from "@/lib/notify-dispatch";
import type { GradeResult, SizingResult, TradeInput } from "@/types/trade";

export async function saveTradeAction(args: {
  input: TradeInput;
  grade: GradeResult;
  sizing: SizingResult;
}): Promise<{ id?: string; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { input, grade, sizing } = args;
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
      psych_checks: input.psych,
      context_flags: input.flags,
      pre_grade: grade.grade,
      pre_score: grade.score,
      pre_score_breakdown: grade.reasons,
      pre_actions: grade.actions,
      pre_rr: grade.rr,
    })
    .select("id, pre_grade")
    .single();

  if (error || !data) return { error: error?.message ?? "저장 실패" };

  // Fire notifications (best-effort, no throw)
  if (grade.grade === "D") {
    await dispatch(user.id, "d_grade_warn", {
      title: "거래 금지 등급으로 저장됨",
      body: `${input.symbol} ${input.direction === "long" ? "롱" : "숏"} ${input.timeframe} · 점수 ${grade.score}\n${grade.actions.slice(0, 2).join("\n")}`,
      tradeId: data.id,
    });
  }
  if (input.flags.losingStreak) {
    await dispatch(user.id, "losing_streak", {
      title: "연속 손실 경고",
      body: `연속 손실 상태에서 ${grade.grade}급 거래를 저장했습니다. 오늘은 거래 중단을 권장합니다.`,
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
