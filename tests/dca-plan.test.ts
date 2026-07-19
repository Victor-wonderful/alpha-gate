import { describe, it, expect } from "vitest";
import {
  nextTrancheTrigger,
  scheduleDiscipline,
  summarizePlan,
  type DcaPlan,
  type DcaPlanProgress,
} from "@/lib/dca/plan";

/** 적립 플랜 계산 회귀 테스트. 회차 금액 = 기본금액 × 밸류존 배수, 남은 예산 상한. */

const basePlan: DcaPlan = {
  id: "p1",
  user_id: "u1",
  symbol: "BTCUSDT",
  total_budget: 8000,
  tranches: 8, // 회당 기본 1000
  mode: "periodic",
  period_days: 14,
  ladder_base_price: null,
  ladder_step_pct: null,
  max_allocation_pct: 40,
  status: "active",
  last_executed_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

const noProgress: DcaPlanProgress = {
  executions: 0,
  spent: 0,
  quantity: 0,
  avgPrice: 0,
  lastExecutedAt: null,
};

describe("회차 금액", () => {
  it("중립이면 기본 금액 그대로", () => {
    const s = summarizePlan(basePlan, noProgress, "neutral");
    expect(s.baseAmount).toBe(1000);
    expect(s.amountThisTranche).toBe(1000);
    expect(s.multiplier).toBe(1);
  });

  it("쌀 때는 2배, 비쌀 때는 절반", () => {
    expect(summarizePlan(basePlan, noProgress, "cheap").amountThisTranche).toBe(2000);
    expect(summarizePlan(basePlan, noProgress, "expensive").amountThisTranche).toBe(500);
  });

  it("남은 예산을 넘지 않는다", () => {
    const almostDone: DcaPlanProgress = { ...noProgress, spent: 7500, executions: 7 };
    // 쌀 때라 2000 을 쓰고 싶지만 남은 건 500.
    const s = summarizePlan(basePlan, almostDone, "cheap");
    expect(s.remainingBudget).toBe(500);
    expect(s.amountThisTranche).toBe(500);
  });

  it("예산을 다 쓰면 0", () => {
    const done: DcaPlanProgress = { ...noProgress, spent: 8000, executions: 8 };
    expect(summarizePlan(basePlan, done, "cheap").amountThisTranche).toBe(0);
    expect(summarizePlan(basePlan, done, "cheap").progressPct).toBe(1);
  });

  it("평단 대비 수익률", () => {
    const p: DcaPlanProgress = { ...noProgress, spent: 1000, quantity: 0.02, avgPrice: 50000 };
    expect(summarizePlan(basePlan, p, "neutral", 60000).pnlPct).toBeCloseTo(0.2, 6);
  });
});

describe("다음 회차 시점", () => {
  it("주기형 — 마지막 실행 + 주기", () => {
    const p: DcaPlanProgress = { ...noProgress, lastExecutedAt: "2026-03-01T00:00:00.000Z" };
    const t = nextTrancheTrigger(basePlan, p);
    expect(t?.kind).toBe("date");
    expect((t as { at: Date }).at.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("주기형 — 실행 이력이 없으면 생성일 기준", () => {
    const t = nextTrancheTrigger(basePlan, noProgress);
    expect((t as { at: Date }).at.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("사다리형 — 실행할수록 한 칸씩 아래", () => {
    const ladder: DcaPlan = {
      ...basePlan,
      mode: "ladder",
      period_days: null,
      ladder_base_price: 100,
      ladder_step_pct: 10,
    };
    expect((nextTrancheTrigger(ladder, noProgress) as { at: number }).at).toBeCloseTo(90, 6);
    const after2: DcaPlanProgress = { ...noProgress, executions: 2 };
    expect((nextTrancheTrigger(ladder, after2) as { at: number }).at).toBeCloseTo(72.9, 6);
  });
});

describe("스케줄 규율 (G4)", () => {
  it("예정일 전에 사면 계획 밖 매수", () => {
    const p: DcaPlanProgress = { ...noProgress, lastExecutedAt: "2026-03-01T00:00:00.000Z" };
    const r = scheduleDiscipline(basePlan, p, new Date("2026-03-05T00:00:00.000Z"));
    expect(r.onSchedule).toBe(false);
    expect(r.note).toContain("계획 밖");
  });

  it("예정일이 지나면 정상", () => {
    const p: DcaPlanProgress = { ...noProgress, lastExecutedAt: "2026-03-01T00:00:00.000Z" };
    const r = scheduleDiscipline(basePlan, p, new Date("2026-03-20T00:00:00.000Z"));
    expect(r.onSchedule).toBe(true);
  });

  it("사다리형 — 다음 칸에 도달해야 정상", () => {
    const ladder: DcaPlan = {
      ...basePlan,
      mode: "ladder",
      period_days: null,
      ladder_base_price: 100,
      ladder_step_pct: 10,
    };
    const now = new Date("2026-03-01T00:00:00.000Z");
    expect(scheduleDiscipline(ladder, noProgress, now, 95).onSchedule).toBe(false);
    expect(scheduleDiscipline(ladder, noProgress, now, 89).onSchedule).toBe(true);
  });
});
