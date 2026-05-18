"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { coachTrade } from "@/lib/anthropic";
import { dispatch } from "@/lib/notify-dispatch";

export async function generateCoachAction(id: string): Promise<{ comment?: string; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data: trade, error } = await supabase
    .from("trades")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !trade) return { error: "거래를 찾을 수 없습니다." };
  if (!trade.closed_at) return { error: "결과를 먼저 입력하세요." };

  const snapshot = {
    symbol: trade.symbol,
    direction: trade.direction,
    timeframe: trade.timeframe,
    entry: Number(trade.entry),
    stop: Number(trade.stop),
    target: Number(trade.target),
    pre_grade: trade.pre_grade,
    pre_score: trade.pre_score,
    pre_rr: Number(trade.pre_rr),
    pre_score_breakdown: trade.pre_score_breakdown,
    market_checks: trade.market_checks,
    psych_checks: trade.psych_checks,
    context_flags: trade.context_flags,
    exit_price: Number(trade.exit_price),
    result_r: Number(trade.result_r),
    exit_reason: trade.exit_reason,
    mistake_tags: trade.mistake_tags,
    note: trade.note,
  };

  let comment: string;
  try {
    comment = await coachTrade(snapshot);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Claude 호출 실패" };
  }

  const { error: upErr } = await supabase
    .from("trades")
    .update({ ai_coach_comment: comment, ai_coach_generated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (upErr) return { error: upErr.message };

  await dispatch(user.id, "ai_coach_done", {
    title: "AI 복기 완료",
    body: comment.split("\n").slice(0, 2).join("\n"),
    tradeId: id,
  });

  revalidatePath(`/app/journal/${id}`);
  return { comment };
}

export async function deleteTradeAction(id: string): Promise<{ error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("trades")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/app/journal");
  revalidatePath("/app/dashboard");
  revalidatePath("/app");
  return {};
}
