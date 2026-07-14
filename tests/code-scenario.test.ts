import { describe, it, expect } from "vitest";
import { buildCodeReport } from "../src/lib/analysis/code-scenario";
import type { AnalysisSnapshot } from "../src/lib/analysis/analyze";
import { STYLE_STANDARDS } from "../src/lib/analysis/standards";

// 최소 목 스냅샷 (buildCodeReport가 쓰는 필드만). 나머지는 캐스팅으로 생략.
function mockSnap(over: Record<string, unknown> = {}): AnalysisSnapshot {
  return {
    symbol: "BTCUSDT",
    style: "swing",
    styleLabel: "스윙",
    ticker: { last: 100_000 },
    volumeProfile: { poc: 99_000, vah: 101_000, val: 97_000 },
    trendMetrics: { classification: "up", strength: "strong" },
    atr: [{ role: "MTF", pctOfPrice: 3 }],
    ...over,
  } as unknown as AnalysisSnapshot;
}

const stopPctOf = (price: number, stop: number) => (Math.abs(price - stop) / price) * 100;
const entryOf = (s: { entryZone: { low: number; high: number } }) =>
  (s.entryZone.low + s.entryZone.high) / 2;

describe("buildCodeReport (AI 폴백)", () => {
  it("상승 추세 → 롱: 되돌림 지정가(진입<현재가), 손절은 진입 아래, RR=스타일 최소(진입 기준)", () => {
    const { strategy, report } = buildCodeReport(mockSnap({ style: "swing" }));
    const s = report.scenarios[0];
    expect(s.direction).toBe("long");
    expect(strategy.direction).toBe("long");
    // 시장가 추격이 아니라 되돌림 지정가여야 한다.
    expect(s.entryType).toBe("pending");
    expect(s.orderHint).toBe("limit");
    const entry = entryOf(s);
    expect(entry).toBeLessThan(100_000); // 롱 되돌림 진입은 현재가 아래
    expect(s.invalidation).toBeLessThan(entry); // 손절은 진입 아래
    expect(s.target).toBeGreaterThan(entry); // 목표는 진입 위
    const stopPct = stopPctOf(entry, s.invalidation);
    const tgtPct = stopPctOf(entry, s.target);
    expect(tgtPct / stopPct).toBeCloseTo(STYLE_STANDARDS.swing.rr.min, 1); // RR=2 (진입 기준)
  });

  it("하락 추세 → 숏: 되돌림 지정가(진입>현재가), 손절은 진입 위, 목표는 아래", () => {
    const { strategy, report } = buildCodeReport(
      mockSnap({ trendMetrics: { classification: "down", strength: "moderate" } }),
    );
    const s = report.scenarios[0];
    expect(s.direction).toBe("short");
    expect(strategy.direction).toBe("short");
    expect(s.orderHint).toBe("limit");
    const entry = entryOf(s);
    expect(entry).toBeGreaterThan(100_000); // 숏 되돌림 진입은 현재가 위
    expect(s.invalidation).toBeGreaterThan(entry);
    expect(s.target).toBeLessThan(entry);
  });

  it("횡보/혼조 → POC 대비 위치로 방향 추정 + 신뢰도 낮음(단, 방향은 시나리오와 일치)", () => {
    // price 100k >= poc 99k → long lean
    const { strategy, report } = buildCodeReport(
      mockSnap({ trendMetrics: { classification: "range", strength: "weak" } }),
    );
    const s = report.scenarios[0];
    expect(s.direction).toBe("long");
    // 방향은 시나리오와 일치(롱). 불확실성은 confidence(낮음)로 표현.
    expect(strategy.direction).toBe("long");
    expect(strategy.confidence).toBeLessThan(0.5);
    expect(s.qualityIssues && s.qualityIssues.length).toBeGreaterThan(0);
  });

  it("손절폭은 스타일 표준 밴드로 clamp — 과대 ATR (진입 기준)", () => {
    const { report } = buildCodeReport(
      mockSnap({ style: "swing", atr: [{ role: "MTF", pctOfPrice: 20 }] }),
    );
    const s = report.scenarios[0];
    const stopPct = stopPctOf(entryOf(s), s.invalidation);
    expect(stopPct).toBeLessThanOrEqual(STYLE_STANDARDS.swing.stopPct.max + 0.01); // ≤ 5%
  });

  it("ATR 없으면 밴드 최소값 (진입 기준)", () => {
    const { report } = buildCodeReport(mockSnap({ style: "day", atr: undefined }));
    const s = report.scenarios[0];
    const stopPct = stopPctOf(entryOf(s), s.invalidation);
    expect(stopPct).toBeCloseTo(STYLE_STANDARDS.day.stopPct.min, 1); // 0.7%
  });

  it("항상 최소 1개 시나리오 + AI 미가용 경고 포함", () => {
    const { report } = buildCodeReport(mockSnap());
    expect(report.scenarios.length).toBeGreaterThanOrEqual(1);
    expect(report.warnings.join()).toMatch(/AI/);
  });
});
