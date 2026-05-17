import { describe, expect, it } from "vitest";
import { gradeTrade, calcRR } from "@/lib/grading";
import type { TradeInput } from "@/types/trade";

const base: TradeInput = {
  symbol: "BTCUSDT",
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

  it("daily loss limit + wide stop drops to D", () => {
    const r = gradeTrade({
      ...base,
      entry: 100,
      stop: 95, // 5% wide
      target: 110,
      market: { ...base.market, aligned_with_btc: false, not_box_middle: false },
      money: { ...base.money, todayCumulativeR: -2.5, todayClosedCount: 3 },
    });
    expect(r.grade).toBe("D");
    expect(r.actions.some((a) => a.includes("멈"))).toBe(true);
  });

  it("invalid structure surfaces action", () => {
    const r = gradeTrade({ ...base, stop: 102 });
    expect(r.rr).toBe(0);
    expect(r.actions.some((a) => a.includes("어긋"))).toBe(true);
  });
});
