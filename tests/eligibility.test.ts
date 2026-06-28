import { describe, it, expect } from "vitest";
import {
  STRATEGY_STYLE_ELIGIBILITY,
  isStrategyEligible,
  regimeDefaultStrategy,
  routeStrategy,
  type SignalPresence,
} from "@/lib/analysis/eligibility";

const NO_SIGNALS: SignalPresence = {
  liquiditySweep: false,
  fundingSqueeze: false,
  sessionOpenDrive: false,
};

describe("스타일×전략 허용 테이블", () => {
  it("핵심 전략은 전 스타일 허용", () => {
    for (const s of ["trend_pullback", "breakout", "range_fade", "reversal", "wait"] as const) {
      for (const style of ["scalp", "day", "swing", "position"] as const) {
        expect(isStrategyEligible(s, style)).toBe(true);
      }
    }
  });

  it("session_open_drive 는 scalp/day 만", () => {
    expect(isStrategyEligible("session_open_drive", "scalp")).toBe(true);
    expect(isStrategyEligible("session_open_drive", "day")).toBe(true);
    expect(isStrategyEligible("session_open_drive", "swing")).toBe(false);
    expect(isStrategyEligible("session_open_drive", "position")).toBe(false);
  });

  it("funding_squeeze 는 scalp/day 만", () => {
    expect(isStrategyEligible("funding_squeeze", "day")).toBe(true);
    expect(isStrategyEligible("funding_squeeze", "swing")).toBe(false);
  });

  it("liquidity_grab 는 position 제외", () => {
    expect(isStrategyEligible("liquidity_grab", "swing")).toBe(true);
    expect(isStrategyEligible("liquidity_grab", "position")).toBe(false);
  });

  it("모든 전략 키가 테이블에 존재", () => {
    const keys = Object.keys(STRATEGY_STYLE_ELIGIBILITY);
    expect(keys).toContain("trend_pullback");
    expect(keys).toContain("session_open_drive");
    expect(keys.length).toBe(8);
  });
});

describe("레짐 기본 전략", () => {
  it("up → trend_pullback long", () => {
    expect(regimeDefaultStrategy("up")).toEqual({ primary: "trend_pullback", direction: "long" });
  });
  it("down → trend_pullback short", () => {
    expect(regimeDefaultStrategy("down")).toEqual({ primary: "trend_pullback", direction: "short" });
  });
  it("range → breakout null (페이드 손실 검증 → 돌파로)", () => {
    expect(regimeDefaultStrategy("range")).toEqual({ primary: "breakout", direction: null });
  });
  it("mixed/undefined → breakout (하드 wait 아님 + 페이드 아님 — 항상 거래 가능)", () => {
    expect(regimeDefaultStrategy("mixed")).toEqual({ primary: "breakout", direction: null });
    expect(regimeDefaultStrategy(undefined)).toEqual({ primary: "breakout", direction: null });
  });
});

describe("routeStrategy — 레짐/신호 라우팅 (시나리오 안 줄임)", () => {
  it("신호 있는 정상 선택은 통과(no-op)", () => {
    const d = routeStrategy("trend_pullback", "long", "up", NO_SIGNALS, false);
    expect(d.changed).toBe(false);
    expect(d.primary).toBe("trend_pullback");
  });

  it("sweep 없는 liquidity_grab → 레짐 기본으로 교체", () => {
    const d = routeStrategy("liquidity_grab", "long", "up", NO_SIGNALS, false);
    expect(d.changed).toBe(true);
    expect(d.reasonCode).toBe("missing_signal");
    expect(d.primary).toBe("trend_pullback"); // up → trend_pullback
    expect(d.original).toBe("liquidity_grab");
  });

  it("신호 있으면 특수전략 유지", () => {
    const d = routeStrategy("funding_squeeze", "short", "up", { ...NO_SIGNALS, fundingSqueeze: true }, false);
    expect(d.changed).toBe(false);
    expect(d.primary).toBe("funding_squeeze");
  });

  it("헛된 wait — 추세 명확하면 교체(시나리오 증가)", () => {
    const d = routeStrategy("wait", null, "down", NO_SIGNALS, false);
    expect(d.changed).toBe(true);
    expect(d.reasonCode).toBe("spurious_wait");
    expect(d.primary).toBe("trend_pullback");
    expect(d.direction).toBe("short");
  });

  it("정당한 wait — mixed + 비BTC면 보존", () => {
    const d = routeStrategy("wait", null, "mixed", NO_SIGNALS, false);
    expect(d.changed).toBe(false);
    expect(d.primary).toBe("wait");
  });

  it("BTC 기준자산은 mixed에서도 wait 금지 → breakout", () => {
    const d = routeStrategy("wait", null, "mixed", NO_SIGNALS, true);
    expect(d.changed).toBe(true);
    expect(d.primary).toBe("breakout");
  });
});
