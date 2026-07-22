import { describe, expect, it } from "vitest";
import { recommendTradeParams } from "@/lib/recommend";

const baseArgs = {
  style: "swing" as const,
  grade: "A" as const,
  confidence: 0.6,
  stopPct: 3,
  userPreferredRiskPct: 2,
};

describe("recommendTradeParams — 위험 예산 상한", () => {
  it("남은 예산이 이상적 리스크보다 작으면 예산으로 축소 + budgetLimited", () => {
    const r = recommendTradeParams({ ...baseArgs, remainingRiskPct: 0.5 });
    expect(r.riskPct).toBeLessThanOrEqual(0.5);
    expect(r.budgetLimited).toBe(true);
  });

  it("남은 예산이 충분하면 축소 안 함", () => {
    const r = recommendTradeParams({ ...baseArgs, remainingRiskPct: 5 });
    expect(r.budgetLimited).toBeFalsy();
    expect(r.riskPct).toBeGreaterThan(0.5);
  });

  it("예산 바닥(≈0)이면 리스크 0으로 → 보류 신호 (0.1% floor 미적용)", () => {
    const r = recommendTradeParams({ ...baseArgs, remainingRiskPct: 0 });
    expect(r.riskPct).toBe(0);
  });

  it("remainingRiskPct 미지정이면 예산 무관, 0.1~1% 밴드", () => {
    const r = recommendTradeParams(baseArgs);
    expect(r.riskPct).toBeGreaterThanOrEqual(0.1);
    expect(r.riskPct).toBeLessThanOrEqual(1);
    expect(r.budgetLimited).toBeFalsy();
  });
});

describe("recommendTradeParams — 등급 기반 동적 리스크 (최대 1% × 등급배수)", () => {
  const args = { style: "day" as const, confidence: 0.6, stopPct: 1, userPreferredRiskPct: 1 };
  it("A = 1% × 1.0 = 1.0%", () => {
    expect(recommendTradeParams({ ...args, grade: "A" }).riskPct).toBeCloseTo(1.0, 5);
  });
  it("B = 1% × 0.5 = 0.5%", () => {
    expect(recommendTradeParams({ ...args, grade: "B" }).riskPct).toBeCloseTo(0.5, 5);
  });
  it("C = 1% × 0.25 = 0.25%", () => {
    expect(recommendTradeParams({ ...args, grade: "C" }).riskPct).toBeCloseTo(0.25, 5);
  });
  it("사용자/강도 상한이 낮으면 그 안에서 (userPref 0.5 → A도 0.5%)", () => {
    expect(recommendTradeParams({ ...args, grade: "A", userPreferredRiskPct: 0.5 }).riskPct).toBeCloseTo(0.5, 5);
  });
  it("1% 하드캡 — userPref가 커도 A는 1% 초과 못 함", () => {
    expect(recommendTradeParams({ ...args, grade: "A", userPreferredRiskPct: 5 }).riskPct).toBeCloseTo(1.0, 5);
  });
});
