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

/**
 * 봇에 맡길 자금(bot_alloc_amount) 저장 — 봉투 모델. 전체 자금 중 봇 몫만 떼어준다.
 * 수동(분석 후 거래) 자금 = 전체 − 봇 배정 (자동으로 남는 것). 0 = 봇 미배정(발주 안 함).
 */
export async function saveBotAllocAction(
  amount: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "봇 배정 금액은 0 이상이어야 합니다." };

  const { error } = await supabase.from("profiles").update({ bot_alloc_amount: amount }).eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/trade");
  revalidatePath("/app/analyze");
  revalidatePath("/app");
  return { ok: true };
}

/** 봇이 넣은 개별 예약/포지션 한 줄. */
export interface BotPosition {
  id: string;
  symbol: string;
  direction: "long" | "short";
  status: "filled" | "pending";
  grade: string | null;
  /** 예약 대기 = 예약가(limit), 진행 중 = 체결가. */
  price: number | null;
  stop: number | null;
  target: number | null;
  createdAt: string;
}

export interface AutoStatus {
  open: BotPosition[];
  pending: BotPosition[];
  openCount: number;
  pendingCount: number;
}

/** 봇 현재 상태 — 진행 중 포지션/예약을 목록까지 반환(숫자만으론 뭐가 걸렸는지 알 수 없음). */
export async function getAutoStatus(): Promise<AutoStatus> {
  const empty: AutoStatus = { open: [], pending: [], openCount: 0, pendingCount: 0 };
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;
  const { data } = await supabase
    .from("trades")
    .select("id, symbol, direction, order_status, pre_grade, entry, entry_actual, limit_price, stop, target, created_at")
    .eq("user_id", user.id)
    .eq("is_paper", true)
    .is("closed_at", null)
    .filter("context_flags->>bot", "eq", "true")
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  const map = (r: (typeof rows)[number]): BotPosition => {
    const filled = r.order_status === "filled";
    return {
      id: r.id as string,
      symbol: r.symbol as string,
      direction: (r.direction as "long" | "short") ?? "long",
      status: filled ? "filled" : "pending",
      grade: (r.pre_grade as string | null) ?? null,
      price: filled
        ? Number(r.entry_actual ?? r.entry) || null
        : Number(r.limit_price ?? r.entry) || null,
      stop: r.stop != null ? Number(r.stop) : null,
      target: r.target != null ? Number(r.target) : null,
      createdAt: r.created_at as string,
    };
  };
  const open = rows.filter((r) => r.order_status === "filled").map(map);
  const pending = rows.filter((r) => r.order_status === "pending").map(map);
  return { open, pending, openCount: open.length, pendingCount: pending.length };
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
