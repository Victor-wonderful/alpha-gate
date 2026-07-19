import { describe, it, expect } from "vitest";
import { buildCodeReport } from "@/lib/analysis/code-scenario";
import type { AnalysisSnapshot } from "@/lib/analysis/analyze";

/**
 * 코드 폴백(AI 미가용)이 분할 진입 차수를 만드는지 검증.
 *
 * 차수 규칙은 synthesize.ts 의 AI 프롬프트("다단 진입 규칙")와 같아야 한다:
 *  · 1차가 현재가에 가장 가깝고, 뒤로 갈수록 깊다
 *  · 비중 합 100, 1차 비중 최대
 *  · 1차~마지막 간격 ≤ 손절폭 절반
 *  · 공유 손절은 가장 깊은 차수 너머
 * cf. docs/분할진입-설계.md D6
 */

/** 구조 레벨을 원하는 위치에 심을 수 있는 최소 스냅샷. */
function snap(opts: {
  price: number;
  /** 지지(롱)/저항(숏)으로 쓰일 스윙 레벨들. */
  levels: number[];
  trend?: "up" | "down" | "range";
  atrPct?: number;
}): AnalysisSnapshot {
  const { price, levels, trend = "up", atrPct = 1.0 } = opts;
  return {
    symbol: "TESTUSDT",
    style: "day",
    styleLabel: "임펄스",
    ticker: { last: price, changePct: 0, high: price * 1.02, low: price * 0.98, volume: 1000 },
    trendMetrics: { classification: trend, strength: "moderate" },
    volumeProfile: { poc: price * 0.99, vah: price * 1.01, val: price * 0.98 },
    atr: [{ role: "MTF", value: price * (atrPct / 100), pctOfPrice: atrPct }],
    multiTf: [
      {
        // 롱이면 lastSwingLow 들이 지지 후보가 된다. 여러 레벨을 심기 위해 OB 로도 넣는다.
        lastSwingLow: levels[0],
        lastSwingHigh: levels[0],
        orderBlocks: levels.slice(1).map((l) => ({ side: trend === "down" ? "bearish" : "bullish", top: l, bottom: l })),
        liquidity: [],
        unfilledFVGs: [],
      },
    ],
  } as unknown as AnalysisSnapshot;
}

describe("코드 폴백 — 분할 진입 차수", () => {
  it("구조 레벨이 여러 개면 1~3차를 만든다", () => {
    const s = buildCodeReport(snap({ price: 100, levels: [99.7, 99.5, 99.2] })).report.scenarios[0];
    const es = s.entries ?? [];
    expect(es.length).toBeGreaterThanOrEqual(2);
    expect(es.length).toBeLessThanOrEqual(3);
    // 1차가 현재가에 가장 가깝고 뒤로 갈수록 깊다.
    for (let i = 1; i < es.length; i++) expect(es[i].price).toBeLessThan(es[i - 1].price);
  });

  it("비중 합이 100이고 1차가 가장 크다", () => {
    const es = buildCodeReport(snap({ price: 100, levels: [99.7, 99.5, 99.2] })).report.scenarios[0].entries ?? [];
    expect(es.reduce((a, e) => a + e.weight, 0)).toBe(100);
    expect(es[0].weight).toBeGreaterThanOrEqual(es[es.length - 1].weight);
  });

  it("1차~마지막 간격이 손절폭 절반을 넘지 않는다", () => {
    const sc = buildCodeReport(snap({ price: 100, levels: [99.7, 99.5, 99.2] })).report.scenarios[0];
    const es = sc.entries ?? [];
    const wSum = es.reduce((a, e) => a + e.weight, 0);
    const avg = es.reduce((a, e) => a + e.price * (e.weight / wSum), 0);
    const stopPct = (Math.abs(avg - sc.invalidation) / avg) * 100;
    const spread = (Math.abs(es[0].price - es[es.length - 1].price) / 100) * 100;
    expect(spread).toBeLessThanOrEqual(stopPct / 2 + 1e-9);
  });

  it("공유 손절은 가장 깊은 차수 너머에 놓인다", () => {
    const long = buildCodeReport(snap({ price: 100, levels: [99.7, 99.5, 99.2] })).report.scenarios[0];
    const le = long.entries ?? [];
    expect(long.invalidation).toBeLessThan(le[le.length - 1].price);

    const short = buildCodeReport(
      snap({ price: 100, levels: [100.3, 100.5, 100.8], trend: "down" }),
    ).report.scenarios[0];
    const se = short.entries ?? [];
    expect(short.invalidation).toBeGreaterThan(se[se.length - 1].price);
  });

  it("서로 너무 가까운 레벨은 한 차수로 병합한다", () => {
    // 99.70 / 99.699 / 99.698 은 사실상 같은 자리 — 차수를 나눌 이유가 없다.
    const es = buildCodeReport(snap({ price: 100, levels: [99.7, 99.699, 99.698] })).report.scenarios[0].entries;
    expect(es ?? []).toHaveLength(0); // 유효 레벨 1개 → 단일 진입(차수 없음)
  });

  it("구조 레벨이 하나뿐이면 단일 진입으로 남는다 (기존 동작 유지)", () => {
    const sc = buildCodeReport(snap({ price: 100, levels: [99.7] })).report.scenarios[0];
    expect(sc.entries ?? []).toHaveLength(0);
    expect(sc.entryZone.low).toBeGreaterThan(0);
  });

  it("차수가 있으면 표시 진입가(entryZone)가 1차~마지막을 감싼다", () => {
    const sc = buildCodeReport(snap({ price: 100, levels: [99.7, 99.5, 99.2] })).report.scenarios[0];
    const es = sc.entries ?? [];
    expect(sc.entryZone.low).toBeLessThanOrEqual(es[es.length - 1].price);
    expect(sc.entryZone.high).toBeGreaterThanOrEqual(es[0].price);
  });
});
