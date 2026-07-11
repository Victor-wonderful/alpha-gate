import { describe, it, expect } from "vitest";
import { computeMarketAssessment } from "../src/lib/analysis/market-assessment";
import type { AnalysisSnapshot } from "../src/lib/analysis/analyze";

function snap(over: Record<string, unknown> = {}): AnalysisSnapshot {
  return {
    ticker: { last: 100 },
    volumeProfile: { poc: 100, vah: 110, val: 90 },
    trendMetrics: { classification: "up" },
    atr: [{ role: "MTF", pctOfPrice: 1 }],
    flow1m: { buyRatio: 0.5 },
    multiTf: [],
    macro: {},
    ...over,
  } as unknown as AnalysisSnapshot;
}

describe("computeMarketAssessment", () => {
  it("상승추세 + 롱 → higher_highs_lows true / 하락추세 + 숏도 true (구조 인정)", () => {
    expect(computeMarketAssessment(snap({ trendMetrics: { classification: "up" } }), "long", 100).higher_highs_lows).toBe(true);
    expect(computeMarketAssessment(snap({ trendMetrics: { classification: "down" } }), "short", 100).higher_highs_lows).toBe(true);
  });

  it("횡보/역방향 → higher_highs_lows false", () => {
    expect(computeMarketAssessment(snap({ trendMetrics: { classification: "range" } }), "long", 100).higher_highs_lows).toBe(false);
    expect(computeMarketAssessment(snap({ trendMetrics: { classification: "up" } }), "short", 100).higher_highs_lows).toBe(false);
  });

  it("VP 밸류영역 중앙 진입 → not_box_middle false, 가장자리는 true", () => {
    expect(computeMarketAssessment(snap(), "long", 100).not_box_middle).toBe(false); // POC=100 중앙
    expect(computeMarketAssessment(snap(), "long", 109).not_box_middle).toBe(true); // VAH 근처
  });

  it("핵심 레벨(POC) 근처면 near_key_level true", () => {
    expect(computeMarketAssessment(snap(), "long", 100.2).near_key_level).toBe(true); // POC=100, 0.2% 이내
    expect(computeMarketAssessment(snap(), "long", 103).near_key_level).toBe(false); // 레벨서 멀리
  });

  it("오더플로우가 방향 지지하면 volume_confirm true", () => {
    expect(computeMarketAssessment(snap({ flow1m: { buyRatio: 0.6 } }), "long", 100).volume_confirm).toBe(true);
    expect(computeMarketAssessment(snap({ flow1m: { buyRatio: 0.6 } }), "short", 100).volume_confirm).toBe(false);
  });

  it("도미넌스 정렬 — regime 유리/데이터없음 처리", () => {
    expect(computeMarketAssessment(snap({ macro: { dominanceRegime: { altLongFavorable: true, altShortFavorable: false } } }), "long", 100).aligned_with_btc).toBe(true);
    expect(computeMarketAssessment(snap({ macro: { dominanceRegime: { altLongFavorable: true, altShortFavorable: false } } }), "short", 100).aligned_with_btc).toBe(false);
    expect(computeMarketAssessment(snap({ macro: {} }), "long", 100).aligned_with_btc).toBe(true); // 데이터 없으면 불이익 없음
  });
});
