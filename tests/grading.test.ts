import { describe, expect, it } from "vitest";
import { gradeTrade, calcRR } from "@/lib/grading";
import type { TradeInput } from "@/types/trade";

// BTCUSDT는 isBtcPair 분기로 btc_aligned 보너스 +1을 못 받아 max +7 → A 불가능.
// A 그레이드 테스트를 위해 알트(ETHUSDT) 기준 base로.
const base: TradeInput = {
  symbol: "ETHUSDT",
  direction: "long",
  timeframe: "1h",
  entry: 100,
  stop: 98,
  target: 106,
  accountSize: 10000,
  allowedLossPct: 1,
  market: {
    higher_highs_lows: true,
    near_key_level: true,
    not_box_middle: true,
    volume_confirm: true,
    aligned_with_btc: true,
  },
  trigger: {
    trigger_confirmed: true,
    within_entry_band: true,
    candle_closed: true,
  },
  money: {
    todayCumulativeR: 0,
    todayClosedCount: 0,
    openPositions: [],
    openExposurePct: 0,
  },
  marketCtx: {
    btcPrice: null,
    btc24hChangePct: null,
    symbolPrice: null,
    fundingRate: null,
    minutesToFunding: null,
  },
};

describe("calcRR", () => {
  it("computes long R:R correctly", () => {
    expect(calcRR(100, 98, 106, "long")).toBe(3);
  });
  it("returns 0 when direction is wrong", () => {
    expect(calcRR(100, 102, 106, "long")).toBe(0);
    expect(calcRR(100, 98, 95, "short")).toBe(0);
  });
  it("computes short R:R", () => {
    expect(calcRR(100, 102, 94, "short")).toBe(3);
  });
});

describe("gradeTrade", () => {
  it("clean setup gets A grade", () => {
    const r = gradeTrade(base);
    expect(r.grade).toBe("A");
    expect(r.score).toBeGreaterThanOrEqual(8);
  });

  it("BTC conflict + box middle drops grade", () => {
    const r = gradeTrade({
      ...base,
      market: { ...base.market, aligned_with_btc: false, not_box_middle: false },
    });
    expect(["C", "D"]).toContain(r.grade);
  });

  it("missing triggers + bad market drops to C/D", () => {
    const r = gradeTrade({
      ...base,
      entry: 100,
      stop: 95, // 5% wide
      target: 110,
      market: { ...base.market, aligned_with_btc: false, not_box_middle: false },
      trigger: { trigger_confirmed: false, within_entry_band: false, candle_closed: false },
    });
    expect(["C", "D"]).toContain(r.grade);
  });

  it("invalid structure surfaces action", () => {
    const r = gradeTrade({ ...base, stop: 102 });
    expect(r.rr).toBe(0);
    expect(r.actions.some((a) => a.includes("어긋"))).toBe(true);
  });

  it("위험 예산 소진: 오픈+예약이 예산(6%)을 다 썼으면 감점 + 경고", () => {
    const r = gradeTrade({
      ...base,
      money: { ...base.money, usedRiskPct: 6.5, riskBudgetPct: 6, remainingRiskPct: 0 },
    });
    expect(r.reasons.some((x) => x.code === "risk_budget_exhausted")).toBe(true);
  });

  it("위험 예산 근접(75%+): 경고 -1점", () => {
    const r = gradeTrade({
      ...base,
      money: { ...base.money, usedRiskPct: 5, riskBudgetPct: 6, remainingRiskPct: 1 },
    });
    expect(r.reasons.some((x) => x.code === "risk_budget_near")).toBe(true);
    expect(r.reasons.some((x) => x.code === "risk_budget_exhausted")).toBe(false);
  });

  it("위험 예산 여유: 예산 경고 안 뜸", () => {
    const r = gradeTrade({
      ...base,
      money: { ...base.money, usedRiskPct: 1, riskBudgetPct: 6, remainingRiskPct: 5 },
    });
    expect(r.reasons.some((x) => x.code?.startsWith("risk_budget"))).toBe(false);
  });
});
