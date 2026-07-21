"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { runAutoTradeForUser, type AutoTradeConfig, type AutoTradeDecision } from "@/lib/auto-trade";

export interface AutoConfigView {
  enabled: boolean;
  style: "day" | "swing";
  min_grade: "A" | "B" | "C";
  direction_filter: "both" | "long" | "short";
  symbol_source: "radar" | "fixed";
  fixed_symbols: string[];
  max_concurrent: number;
  risk_pct: number;
  daily_loss_limit_r: number;
  leverage: number;
  last_run_at: string | null;
}

const DEFAULT_CONFIG: AutoConfigView = {
  enabled: false,
  style: "day",
  min_grade: "B",
  direction_filter: "both",
  symbol_source: "radar",
  fixed_symbols: [],
  max_concurrent: 3,
  risk_pct: 1,
  daily_loss_limit_r: -2,
  leverage: 3,
  last_run_at: null,
};

/** 봇 규칙 조회 (없으면 기본값). */
export async function getAutoConfig(): Promise<AutoConfigView> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_CONFIG;
  const { data } = await supabase.from("auto_trade_configs").select("*").eq("user_id", user.id).maybeSingle();
  if (!data) return DEFAULT_CONFIG;
  return {
    enabled: !!data.enabled,
    style: (data.style as "day" | "swing") ?? "day",
    min_grade: (data.min_grade as "A" | "B" | "C") ?? "B",
    direction_filter: (data.direction_filter as "both" | "long" | "short") ?? "both",
    symbol_source: (data.symbol_source as "radar" | "fixed") ?? "radar",
    fixed_symbols: (data.fixed_symbols as string[]) ?? [],
    max_concurrent: Number(data.max_concurrent) || 3,
    risk_pct: Number(data.risk_pct) || 1,
    daily_loss_limit_r: Number(data.daily_loss_limit_r) ?? -2,
    leverage: Number(data.leverage) || 3,
    last_run_at: (data.last_run_at as string | null) ?? null,
  };
}

/** 봇 규칙 저장(upsert). */
export async function saveAutoConfig(
  input: Omit<AutoConfigView, "last_run_at">,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  // 가드 (DB CHECK 와 일치).
  if (input.risk_pct <= 0 || input.risk_pct > 5) return { ok: false, error: "리스크는 0~5% 사이여야 합니다." };
  if (input.max_concurrent < 1 || input.max_concurrent > 10) return { ok: false, error: "동시 포지션은 1~10 사이여야 합니다." };
  if (input.leverage < 1 || input.leverage > 20) return { ok: false, error: "레버리지는 1~20 사이여야 합니다." };

  const { error } = await supabase.from("auto_trade_configs").upsert(
    {
      user_id: user.id,
      enabled: input.enabled,
      style: input.style,
      min_grade: input.min_grade,
      direction_filter: input.direction_filter,
      symbol_source: input.symbol_source,
      fixed_symbols: input.fixed_symbols,
      max_concurrent: input.max_concurrent,
      risk_pct: input.risk_pct,
      daily_loss_limit_r: input.daily_loss_limit_r,
      leverage: input.leverage,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/trade");
  return { ok: true };
}

/** 운영 자금(내 자금 = default_account_size) 저장 — 봇·AI 분석·수동이 공유하는 기준 자금. */
export async function saveBotCapitalAction(
  amount: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "운영 자금은 0보다 커야 합니다." };

  const { error } = await supabase.from("profiles").update({ default_account_size: amount }).eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/trade");
  revalidatePath("/app/analyze");
  revalidatePath("/app");
  return { ok: true };
}

/** 봇 현재 상태 — 진행 중 봇 포지션/예약 수. */
export async function getAutoStatus(): Promise<{ openCount: number; pendingCount: number }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { openCount: 0, pendingCount: 0 };
  const { data } = await supabase
    .from("trades")
    .select("order_status")
    .eq("user_id", user.id)
    .eq("is_paper", true)
    .is("closed_at", null)
    .filter("context_flags->>bot", "eq", "true");
  const rows = data ?? [];
  return {
    openCount: rows.filter((r) => r.order_status === "filled").length,
    pendingCount: rows.filter((r) => r.order_status === "pending").length,
  };
}

/** 지금 1회 실행 — dry-run(미발주 미리보기) 또는 실발주. 사용자가 버튼으로 트리거. */
export async function runAutoNowAction(
  dryRun: boolean,
): Promise<{ ok: boolean; error?: string; decisions?: AutoTradeDecision[]; placed?: number; note?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const cfg = await getAutoConfig();
  // "지금 실행"은 enabled 여부와 무관하게 규칙으로 평가 — 미리보기 목적.
  const config: AutoTradeConfig = { user_id: user.id, ...cfg, enabled: true };
  try {
    const r = await runAutoTradeForUser(config, { dryRun });
    if (!dryRun) {
      revalidatePath("/app/trade");
      revalidatePath("/app/virtual-trade");
      revalidatePath("/app");
    }
    return { ok: true, decisions: r.decisions, placed: r.placed, note: r.note };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
