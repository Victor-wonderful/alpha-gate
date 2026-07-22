"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { fetchSpotKlines } from "@/lib/analysis/binance";
import { checkAssetGate } from "@/lib/dca/asset-gate";
import { classifyValueZone, type ValueZoneResult } from "@/lib/dca/value-zone";
import { placeVirtualOrderAction, closeVirtualPositionAction } from "@/app/app/virtual-trade/order-actions";
import { summarizePlan, scheduleDiscipline, type DcaPlan, type DcaPlanProgress } from "@/lib/dca/plan";

/** 밸류 존 + 자산 게이트를 한 번에 조회 (화면 상단 카드용). */
export async function loadDcaAssessmentAction(symbol: string): Promise<{
  ok: boolean;
  error?: string;
  allowed?: boolean;
  blockReason?: string;
  gateChecks?: ReturnType<typeof checkAssetGate>["checks"];
  valueZone?: ValueZoneResult;
}> {
  const sym = symbol.toUpperCase();
  if (!/^[A-Z0-9]{2,15}USDT$/.test(sym)) return { ok: false, error: "심볼이 유효하지 않습니다." };

  // 현물 일봉 — 상장 이력(개수)과 밸류 존 계산에 모두 쓴다.
  let candles;
  try {
    candles = await fetchSpotKlines(sym, "1d", 1000);
  } catch {
    // 현물 마켓이 없으면 Binance 가 400 을 준다 — 그 자체가 게이트 판정 근거.
    const gate = checkAssetGate({ symbol: sym, spotDailyCandles: 0 });
    return { ok: true, allowed: false, blockReason: gate.blockReason, gateChecks: gate.checks };
  }

  const gate = checkAssetGate({ symbol: sym, spotDailyCandles: candles.length });
  const valueZone = classifyValueZone(
    candles.map((c) => ({ high: c.high, low: c.low, close: c.close, volume: c.volume })),
  );

  return {
    ok: true,
    allowed: gate.allowed,
    blockReason: gate.blockReason,
    gateChecks: gate.checks,
    valueZone,
  };
}

export interface CreatePlanInput {
  symbol: string;
  totalBudget: number;
  tranches: number;
  mode: "periodic" | "ladder";
  periodDays?: number;
  ladderBasePrice?: number;
  ladderStepPct?: number;
  maxAllocationPct?: number;
}

export async function createDcaPlanAction(
  input: CreatePlanInput,
): Promise<{ ok: boolean; planId?: string; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const symbol = input.symbol.toUpperCase();
  if (!(input.totalBudget > 0)) return { ok: false, error: "총 예산을 입력하세요." };
  if (!Number.isInteger(input.tranches) || input.tranches < 1 || input.tranches > 200)
    return { ok: false, error: "분할 횟수는 1~200 사이여야 합니다." };
  if (input.mode === "periodic" && !(Number(input.periodDays) > 0))
    return { ok: false, error: "적립 주기(일)를 입력하세요." };
  if (input.mode === "ladder" && !(Number(input.ladderStepPct) > 0))
    return { ok: false, error: "사다리 간격(%)을 입력하세요." };

  // 중복 방지 — 같은 자산에 이미 진행 중(active/paused)인 플랜이 있으면 새로 못 만든다.
  // (완료된 플랜은 예외 — 다시 시작 가능.) 실수로 BTC 플랜이 여러 개 생기는 걸 막는다.
  const { data: existing } = await supabase
    .from("dca_plans")
    .select("id")
    .eq("user_id", user.id)
    .eq("symbol", symbol)
    .in("status", ["active", "paused"])
    .limit(1);
  if (existing && existing.length > 0) {
    return {
      ok: false,
      error: `이미 ${symbol} 적립 플랜이 진행 중입니다. 기존 플랜을 삭제하거나 수정한 뒤 다시 만드세요.`,
    };
  }

  // 자산 게이트는 서버에서 다시 판정한다 — 화면을 우회해 만들 수 없게.
  const assessment = await loadDcaAssessmentAction(symbol);
  if (!assessment.ok) return { ok: false, error: assessment.error };
  if (!assessment.allowed)
    return { ok: false, error: assessment.blockReason ?? "적립할 수 없는 자산입니다." };

  const { data, error } = await supabase
    .from("dca_plans")
    .insert({
      user_id: user.id,
      symbol,
      total_budget: input.totalBudget,
      tranches: input.tranches,
      mode: input.mode,
      period_days: input.mode === "periodic" ? Number(input.periodDays) : null,
      ladder_base_price: input.mode === "ladder" ? (input.ladderBasePrice ?? null) : null,
      ladder_step_pct: input.mode === "ladder" ? Number(input.ladderStepPct) : null,
      max_allocation_pct: input.maxAllocationPct ?? 10,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: `플랜 생성 실패: ${error?.message ?? "unknown"}` };
  revalidatePath("/app/dca");
  return { ok: true, planId: data.id as string };
}

export async function updateDcaPlanStatusAction(
  planId: string,
  status: "active" | "paused" | "completed",
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("dca_plans")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/dca");
  return { ok: true };
}

export async function deleteDcaPlanAction(planId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  // 이 플랜이 쌓아둔 적립 매수(포지션)를 먼저 시장가로 정리한다.
  // 안 하면 플랜만 사라지고 매수분은 거래상황에 "진행 중 포지션"으로 유령처럼 남는다.
  const { data: openTrades } = await supabase
    .from("trades")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_paper", true)
    .is("closed_at", null)
    .filter("context_flags->>dcaPlanId", "eq", planId);
  for (const tr of openTrades ?? []) {
    await closeVirtualPositionAction(tr.id as string);
  }

  const { error } = await supabase.from("dca_plans").delete().eq("id", planId).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/dca");
  revalidatePath("/app/virtual-trade");
  revalidatePath("/app");
  return { ok: true };
}

/**
 * 회차 실행 — 밸류 존 배수를 적용한 금액으로 가상 현물을 매수한다.
 *
 * 금액은 서버에서 다시 계산한다(화면 값을 믿지 않는다). 남은 예산을 넘지 않도록
 * 잘라내고, 남은 예산이 없으면 플랜을 completed 로 넘긴다.
 */
export async function executeDcaTrancheAction(
  planId: string,
): Promise<{ ok: boolean; error?: string; spent?: number; verdict?: string; multiplier?: number }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: plan, error: planErr } = await supabase
    .from("dca_plans")
    .select("*")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (planErr || !plan) return { ok: false, error: "플랜을 찾을 수 없습니다." };
  if (plan.status !== "active") return { ok: false, error: "진행 중인 플랜이 아닙니다." };

  const assessment = await loadDcaAssessmentAction(plan.symbol as string);
  if (!assessment.ok || !assessment.valueZone?.ok)
    return { ok: false, error: assessment.error ?? assessment.valueZone?.error ?? "밸류 존 판정 실패" };
  if (!assessment.allowed)
    return { ok: false, error: assessment.blockReason ?? "적립할 수 없는 자산입니다." };

  const progress = await loadPlanProgress(supabase, plan as unknown as DcaPlan);

  // 최소 간격 가드 — 마지막 매수(또는 건너뛰기) 후 주기가 안 지났으면 거부한다.
  // "주 1회"를 요일 고정이 아니라 최소 간격으로 강제해 겹치기 매수를 막는다.
  const disc = scheduleDiscipline(
    plan as unknown as DcaPlan,
    progress,
    new Date(),
    assessment.valueZone.price,
  );
  if (!disc.onSchedule) return { ok: false, error: disc.note };

  const summary = summarizePlan(plan as unknown as DcaPlan, progress, assessment.valueZone.verdict);
  if (summary.amountThisTranche <= 0)
    return { ok: false, error: "남은 예산이 없습니다. 플랜이 끝났습니다." };

  const price = assessment.valueZone.price;
  const quantity = Math.floor((summary.amountThisTranche / price) * 1e6) / 1e6;
  if (quantity <= 0) return { ok: false, error: "회차 금액이 너무 작아 수량이 0입니다." };

  const res = await placeVirtualOrderAction({
    symbol: plan.symbol as string,
    direction: "long",
    quantity,
    leverage: 1,
    marketType: "spot",
    dcaPlanId: planId,
  });
  if (!res.ok) return { ok: false, error: res.error };

  const spent = quantity * (res.fillPrice ?? price);
  const done = progress.spent + spent >= Number(plan.total_budget) - 1e-6;
  await supabase
    .from("dca_plans")
    .update({
      last_executed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(done ? { status: "completed" } : {}),
    })
    .eq("id", planId)
    .eq("user_id", user.id);

  revalidatePath("/app/dca");
  revalidatePath("/app/virtual-trade");
  revalidatePath("/app");
  return {
    ok: true,
    spent,
    verdict: assessment.valueZone.verdict,
    multiplier: assessment.valueZone.tiltMultiplier,
  };
}

/**
 * 이번 회차 건너뛰기 — 비싼 구간에서 매수하지 않고 예정일만 다음 주기로 넘긴다.
 *
 * 예산은 소진하지 않고 last_executed_at 만 갱신한다 → 다음 예정일이 지금+주기로 이동.
 * "안 사고 기다리는" 판단을 앱이 강제하는 게 아니라(검증 안 된 마켓 타이밍),
 * 비쌀 때 사용자가 직접 고를 수 있게 하는 선택지다.
 */
export async function skipDcaTrancheAction(
  planId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: plan, error: planErr } = await supabase
    .from("dca_plans")
    .select("status")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (planErr || !plan) return { ok: false, error: "플랜을 찾을 수 없습니다." };
  if (plan.status !== "active") return { ok: false, error: "진행 중인 플랜이 아닙니다." };

  const { error } = await supabase
    .from("dca_plans")
    .update({ last_executed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/dca");
  return { ok: true };
}

/** 플랜의 회차 실행 기록을 trades 에서 집계 (별도 테이블 없음). */
async function loadPlanProgress(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  plan: DcaPlan,
): Promise<DcaPlanProgress> {
  const { data } = await supabase
    .from("trades")
    .select("entry_actual, entry, position_quantity, created_at")
    .eq("user_id", plan.user_id)
    .eq("market_type", "spot")
    .contains("context_flags", { dcaPlanId: plan.id })
    .order("created_at", { ascending: true });

  let spent = 0;
  let quantity = 0;
  for (const t of data ?? []) {
    const px = Number(t.entry_actual ?? t.entry ?? 0);
    const qty = Number(t.position_quantity ?? 0);
    if (px > 0 && qty > 0) {
      spent += px * qty;
      quantity += qty;
    }
  }
  return {
    executions: data?.length ?? 0,
    spent,
    quantity,
    avgPrice: quantity > 0 ? spent / quantity : 0,
    lastExecutedAt: (data?.[data.length - 1]?.created_at as string | undefined) ?? null,
  };
}

/** 페이지 로드용 — 플랜 목록 + 각 진행률. */
export async function loadDcaPlansAction(): Promise<{
  plans: Array<DcaPlan & { progress: DcaPlanProgress }>;
}> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { plans: [] };

  const { data } = await supabase
    .from("dca_plans")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const plans: Array<DcaPlan & { progress: DcaPlanProgress }> = [];
  for (const p of data ?? []) {
    const plan = p as unknown as DcaPlan;
    plans.push({ ...plan, progress: await loadPlanProgress(supabase, plan) });
  }
  return { plans };
}
