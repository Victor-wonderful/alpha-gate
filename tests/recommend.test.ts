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

  it("remainingRiskPct 미지정이면 기존 동작(예산 무관, 0.1~3% 밴드)", () => {
    const r = recommendTradeParams(baseArgs);
    expect(r.riskPct).toBeGreaterThanOrEqual(0.1);
    expect(r.riskPct).toBeLessThanOrEqual(3);
    expect(r.budgetLimited).toBeFalsy();
  });
});
