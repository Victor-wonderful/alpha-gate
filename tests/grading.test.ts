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

// 회귀: 손절/목표 현실성 판정이 스타일 표준(standards.ts)을 따르는지.
// 예전엔 3%/15% 고정이라 모멘텀(swing) 정상 손절(2~5%)이 부당 감점됐다.
describe("gradeTrade — 스타일별 손절/목표 상한", () => {
  // 손절 4% (진입 100 → 손절 96), 목표 12% (→ 112)
  const wideStop = { ...base, entry: 100, stop: 96, target: 112 };

  it("모멘텀(swing): 손절 4%는 표준(2~5%) 안이라 감점 없음", () => {
    const r = gradeTrade(wideStop, "swing");
    expect(r.reasons.some((x) => x.code === "stop_too_wide")).toBe(false);
    expect(r.reasons.some((x) => x.code === "target_unrealistic")).toBe(false);
  });

  it("임펄스(day): 손절 4%는 표준(0.7~1.5%) 초과라 감점", () => {
    const r = gradeTrade(wideStop, "day");
    expect(r.reasons.some((x) => x.code === "stop_too_wide")).toBe(true);
  });

  it("임펄스(day): 목표 12%는 표준(1.5~3%) 초과라 감점", () => {
    const r = gradeTrade(wideStop, "day");
    expect(r.reasons.some((x) => x.code === "target_unrealistic")).toBe(true);
  });

  it("기본 스타일 미지정 시 swing으로 간주 (하위호환)", () => {
    const r = gradeTrade(wideStop);
    expect(r.reasons.some((x) => x.code === "stop_too_wide")).toBe(false);
  });

  it("RR>4라도 목표가 스타일 표준 안이면 target_unrealistic 아님 (구 rr>4 오탐 제거)", () => {
    // 손절 1% (→99), 목표 5% (→105), RR 5 — swing 목표 상한 15% 안.
    const r = gradeTrade({ ...base, entry: 100, stop: 99, target: 105 }, "swing");
    expect(r.rr).toBeGreaterThan(4);
    expect(r.reasons.some((x) => x.code === "target_unrealistic")).toBe(false);
  });
});

// 회귀: R:R 채점이 전략별 rrMin(standards.ts 예외)에 앵커되는지.
describe("gradeTrade — 전략별 rrMin 반영", () => {
  const rrCode = (r: ReturnType<typeof gradeTrade>) =>
    r.reasons.find((x) => x.code.startsWith("rr_"))?.code;

  it("liquidity_grab(rrMin 2.5): rr 2.3은 표준 미달이라 rr_fair (rr_good 아님)", () => {
    // 손절 1%(→99), 목표 2.3%(→102.3), rr≈2.3.
    const setup = { ...base, entry: 100, stop: 99, target: 102.3 };
    expect(rrCode(gradeTrade(setup, "swing", "liquidity_grab"))).toBe("rr_fair");
    // 전략 미지정(스윙 기본 rrMin 2)이면 같은 rr 2.3이 rr_good.
    expect(rrCode(gradeTrade(setup, "swing"))).toBe("rr_good");
  });

  it("스윙 기본(rrMin 2): rr 3은 여전히 rr_great — 하위 동작 불변", () => {
    // base(rr 3) — 예전 상수 ladder와 동일하게 rr_great.
    expect(rrCode(gradeTrade(base, "swing"))).toBe("rr_great");
  });

  it("임펄스(day, rrMin 1.5): rr 2.7은 rr_great (표준 낮아 기준 하향)", () => {
    // 손절 1%(→99), 목표 2.7%(→102.7, day 목표 상한 3% 안), rr≈2.7.
    const setup = { ...base, entry: 100, stop: 99, target: 102.7 };
    expect(rrCode(gradeTrade(setup, "day"))).toBe("rr_great");
  });
});
