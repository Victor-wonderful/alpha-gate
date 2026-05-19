"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { dispatch } from "@/lib/notify-dispatch";
import { fetchKlines } from "@/lib/analysis/binance";
import type { GradeResult, SizingResult, TradeInput } from "@/types/trade";

export async function saveTradeAction(args: {
  input: TradeInput;
  grade: GradeResult;
  sizing: SizingResult;
  leverage?: number;
  forecast?: unknown; // Monte Carlo result snapshot at save time (live mode)
}): Promise<{ id?: string; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { input, grade, sizing, leverage, forecast } = args;
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
      simulation_meta: forecast ? { kind: "monte_carlo_forecast", at: new Date().toISOString(), ...(typeof forecast === "object" && forecast !== null ? forecast : {}) } : null,
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

type TF = "15m" | "1h" | "4h" | "1D";
const INTERVAL_MAP: Record<TF, "15m" | "1h" | "4h" | "1d"> = {
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1D": "1d",
};
const TIMEOUT_MS: Record<TF, number> = {
  "15m": 2 * 24 * 60 * 60_000,
  "1h": 7 * 24 * 60 * 60_000,
  "4h": 14 * 24 * 60 * 60_000,
  "1D": 30 * 24 * 60 * 60_000,
};

/**
 * Manually trigger auto-resolution for the current user's open live trades.
 * Same logic as the cron endpoint but scoped to the requesting user only.
 */
export async function resolveMyTradesAction(): Promise<{
  checked: number;
  resolved: number;
  stale: number;
  pending: number;
  error?: string;
}> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { checked: 0, resolved: 0, stale: 0, pending: 0, error: "로그인이 필요합니다." };

  const { data: openTrades, error } = await supabase
    .from("trades")
    .select("id, symbol, direction, timeframe, entry, stop, target, created_at, mode")
    .eq("user_id", user.id)
    .is("closed_at", null)
    .neq("mode", "backtest")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) return { checked: 0, resolved: 0, stale: 0, pending: 0, error: error.message };
  if (!openTrades || openTrades.length === 0) return { checked: 0, resolved: 0, stale: 0, pending: 0 };

  let resolved = 0;
  let stale = 0;
  let pending = 0;

  for (const t of openTrades) {
    const tf = t.timeframe as TF;
    if (!INTERVAL_MAP[tf]) continue;
    const createdMs = new Date(t.created_at).getTime();
    if (Date.now() - createdMs > TIMEOUT_MS[tf]) {
      stale++;
      continue;
    }
    try {
      const candles = await fetchKlines(t.symbol, INTERVAL_MAP[tf], 1000, {
        startTime: createdMs - 60_000,
      });
      if (!candles || candles.length === 0) {
        pending++;
        continue;
      }
      const entry = Number(t.entry);
      const stop = Number(t.stop);
      const target = Number(t.target);
      const stopDist = Math.abs(entry - stop);
      if (stopDist === 0) {
        pending++;
        continue;
      }
      let hit: { exitPrice: number; resultR: number; exitReason: "target" | "stop"; closedAt: string } | null = null;
      for (const c of candles) {
        if (t.direction === "long") {
          if (c.low <= stop) {
            hit = { exitPrice: stop, resultR: -1, exitReason: "stop", closedAt: new Date(c.closeTime).toISOString() };
            break;
          }
          if (c.high >= target) {
            hit = { exitPrice: target, resultR: (target - entry) / stopDist, exitReason: "target", closedAt: new Date(c.closeTime).toISOString() };
            break;
          }
        } else {
          if (c.high >= stop) {
            hit = { exitPrice: stop, resultR: -1, exitReason: "stop", closedAt: new Date(c.closeTime).toISOString() };
            break;
          }
          if (c.low <= target) {
            hit = { exitPrice: target, resultR: (entry - target) / stopDist, exitReason: "target", closedAt: new Date(c.closeTime).toISOString() };
            break;
          }
        }
      }
      if (!hit) {
        pending++;
        continue;
      }
      const { error: upErr } = await supabase
        .from("trades")
        .update({
          exit_price: hit.exitPrice,
          result_r: hit.resultR,
          exit_reason: hit.exitReason,
          closed_at: hit.closedAt,
          note: `자동 정산: ${hit.exitReason === "target" ? "목표 도달" : "손절 적중"}`,
        })
        .eq("id", t.id)
        .eq("user_id", user.id)
        .is("closed_at", null);
      if (!upErr) resolved++;
    } catch {
      pending++;
    }
  }

  revalidatePath("/app/journal");
  revalidatePath("/app/dashboard");

  return { checked: openTrades.length, resolved, stale, pending };
}
