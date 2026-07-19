/**
 * 적립 플랜 계산 — 회차 금액·진행률·다음 예정 시점. 전부 순수 함수.
 *
 * 회차 금액은 "기본 금액 × 밸류 존 배수"다. 기본 금액은 총예산/분할횟수이고,
 * 배수는 채택안 D(cheap 2 / 중립 1 / 비쌈 0.5). 남은 예산을 넘지 않게 잘라낸다.
 * cf. docs/DCA-모드-설계.md §4 · §10
 */

import { TILT_MULTIPLIER, type ValueVerdict } from "./value-zone";

export interface DcaPlan {
  id: string;
  user_id: string;
  symbol: string;
  total_budget: number;
  tranches: number;
  mode: "periodic" | "ladder";
  period_days: number | null;
  ladder_base_price: number | null;
  ladder_step_pct: number | null;
  max_allocation_pct: number;
  status: "active" | "paused" | "completed";
  last_executed_at: string | null;
  created_at: string;
}

export interface DcaPlanProgress {
  /** 지금까지 실행한 회차 수. */
  executions: number;
  /** 지금까지 쓴 금액(USDT). */
  spent: number;
  /** 지금까지 모은 수량. */
  quantity: number;
  /** 평단. */
  avgPrice: number;
  lastExecutedAt: string | null;
}

export interface DcaPlanSummary {
  /** 회당 기본 금액 = 총예산 / 분할횟수. */
  baseAmount: number;
  /** 이번 회차에 실제로 쓸 금액 (배수 적용 + 남은 예산 상한). */
  amountThisTranche: number;
  multiplier: number;
  /** 남은 예산. */
  remainingBudget: number;
  /** 예산 소진율 0~1. */
  progressPct: number;
  /** 평단 대비 현재가 수익률(현재가를 줄 때만). */
  pnlPct?: number;
}

export function summarizePlan(
  plan: DcaPlan,
  progress: DcaPlanProgress,
  verdict: ValueVerdict,
  currentPrice?: number,
): DcaPlanSummary {
  const total = Number(plan.total_budget) || 0;
  const tranches = Math.max(1, Number(plan.tranches) || 1);
  const baseAmount = total / tranches;
  const multiplier = TILT_MULTIPLIER[verdict];
  const remainingBudget = Math.max(0, total - progress.spent);
  // 배수를 곱하되 남은 예산을 넘길 수 없다.
  const amountThisTranche = Math.min(baseAmount * multiplier, remainingBudget);

  return {
    baseAmount,
    amountThisTranche,
    multiplier,
    remainingBudget,
    progressPct: total > 0 ? Math.min(1, progress.spent / total) : 0,
    pnlPct:
      currentPrice != null && progress.avgPrice > 0
        ? currentPrice / progress.avgPrice - 1
        : undefined,
  };
}

/**
 * 다음 회차가 언제/얼마에 도래하는지 (규율 판정용 G4의 기초).
 * periodic: 마지막 실행 + 주기. ladder: 기준가에서 step% 씩 내린 다음 칸.
 */
export function nextTrancheTrigger(
  plan: DcaPlan,
  progress: DcaPlanProgress,
): { kind: "date"; at: Date } | { kind: "price"; at: number } | null {
  if (plan.mode === "periodic") {
    const days = Number(plan.period_days);
    if (!(days > 0)) return null;
    const last = progress.lastExecutedAt ?? plan.last_executed_at ?? plan.created_at;
    const base = new Date(last).getTime();
    if (!Number.isFinite(base)) return null;
    return { kind: "date", at: new Date(base + days * 86_400_000) };
  }
  const step = Number(plan.ladder_step_pct);
  const basePrice = Number(plan.ladder_base_price);
  if (!(step > 0) || !(basePrice > 0)) return null;
  // 이미 n회 실행했으면 다음은 n+1칸 아래.
  const n = progress.executions + 1;
  return { kind: "price", at: basePrice * Math.pow(1 - step / 100, n) };
}

/** 규율 판정(G4) — 예정 시점보다 이른 실행은 "계획이 아니라 충동"이다. */
export function scheduleDiscipline(
  plan: DcaPlan,
  progress: DcaPlanProgress,
  now: Date,
  currentPrice?: number,
): { onSchedule: boolean; note: string } {
  const trigger = nextTrancheTrigger(plan, progress);
  if (!trigger) return { onSchedule: true, note: "예정 시점을 계산할 수 없습니다." };

  if (trigger.kind === "date") {
    const due = trigger.at.getTime() <= now.getTime();
    const daysLeft = Math.ceil((trigger.at.getTime() - now.getTime()) / 86_400_000);
    return due
      ? { onSchedule: true, note: "예정된 적립 시점입니다." }
      : { onSchedule: false, note: `다음 예정일까지 ${daysLeft}일 남았습니다 — 지금 사면 계획 밖 매수입니다.` };
  }

  if (currentPrice == null) return { onSchedule: true, note: "현재가를 확인할 수 없습니다." };
  const due = currentPrice <= trigger.at;
  return due
    ? { onSchedule: true, note: "사다리 다음 칸에 도달했습니다." }
    : {
        onSchedule: false,
        note: `다음 칸은 ${trigger.at.toFixed(trigger.at >= 100 ? 0 : 4)} — 아직 도달하지 않았습니다.`,
      };
}
