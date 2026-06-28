import { describe, it, expect } from "vitest";
import {
  type Trade,
  winRate,
  avgRR,
  expectancyR,
  profitFactor,
  sharpe,
  maxDrawdown,
  dailyRCurve,
  informationCoefficient,
  netRFromGross,
  evaluateGate,
  DEFAULT_GATE,
  walkForwardGate,
  evaluateFullGate,
} from "@/lib/backtest/metrics";

function mk(rMultiple: number, entryTs = "2026-01-01", barsHeld = 1): Trade {
  return { rMultiple, retPct: rMultiple * 0.02, barsHeld, entryTs };
}

describe("metrics — 기본 지표", () => {
  it("winRate / expectancyR / avgRR", () => {
    const trades = [mk(2), mk(-1), mk(2), mk(-1)];
    expect(winRate(trades)).toBe(0.5);
    expect(expectancyR(trades)).toBeCloseTo(0.5, 10); // (2-1+2-1)/4
    expect(avgRR(trades)).toBeCloseTo(2, 10); // 평균이익2 / 평균손실1
  });

  it("profitFactor", () => {
    expect(profitFactor([mk(3), mk(-1), mk(-1)])).toBeCloseTo(1.5, 10); // 3 / 2
  });

  it("빈 배열은 null", () => {
    expect(winRate([])).toBeNull();
    expect(expectancyR([])).toBeNull();
  });

  it("sharpe — 변동 없으면 null, 양의 평균이면 양수", () => {
    expect(sharpe([0.01, 0.01, 0.01])).toBeNull(); // std 0
    expect(sharpe([0.02, -0.01, 0.03, 0.01])!).toBeGreaterThan(0);
  });

  it("maxDrawdown — 100→80 이면 0.2", () => {
    expect(maxDrawdown([100, 120, 96, 110])).toBeCloseTo(0.2, 10); // peak120 → 96
  });

  it("informationCoefficient — 완전 양의 단조면 +1", () => {
    expect(informationCoefficient([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 10);
    expect(informationCoefficient([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 10);
  });
});

describe("netRFromGross — 비용차감", () => {
  it("손절폭 2%, 왕복비용 0.075% → 비용 약 0.0375R 차감", () => {
    const net = netRFromGross(2, 2, 0); // gross 2R, stop 2%, 펀딩 0
    expect(net).toBeCloseTo(2 - 0.075 / 2, 10); // 2 - 0.0375
  });
  it("손절폭 0 이하는 gross 그대로(윈저라이즈가 처리)", () => {
    expect(netRFromGross(50, 0, 0)).toBe(50);
  });
});

describe("evaluateGate", () => {
  it("표본 부족이면 탈락", () => {
    const r = evaluateGate([mk(1), mk(1)]);
    expect(r.passed).toBe(false);
    expect(r.reasons.some((x) => x.includes("표본 부족"))).toBe(true);
  });

  it("기대값 우위 + 충분 표본이면 통과", () => {
    // 30거래, 날짜 분산(군집 MDD 회피), 기대값 +0.5R
    const trades = Array.from({ length: 30 }, (_, i) =>
      mk(i % 2 === 0 ? 2 : -1, `2026-01-${String((i % 28) + 1).padStart(2, "0")}`),
    );
    const r = evaluateGate(trades);
    expect(r.expectancyR!).toBeGreaterThan(DEFAULT_GATE.minExpectancyR);
    expect(r.passed).toBe(true);
  });

  it("윈저라이즈 — +53R 이상치가 기대값 부호를 못 뒤집음", () => {
    // 음의 분포 + 거대 이상치 1개. 클립 없으면 기대값 양수로 오판.
    const trades = [
      ...Array.from({ length: 29 }, (_, i) => mk(-0.5, `2026-02-${String((i % 28) + 1).padStart(2, "0")}`)),
      mk(53, "2026-03-01"),
    ];
    const r = evaluateGate(trades); // winsorR=10 → 53이 10으로 클립
    expect(r.expectancyR!).toBeLessThan(0); // 클립 후 음수 유지
    expect(r.passed).toBe(false);
  });
});

describe("walkForwardGate — 엣지 쇠퇴 차단", () => {
  // 시간순 정렬되도록 entryTs를 월별로 분산.
  function series(rs: number[]): Trade[] {
    return rs.map((r, i) => mk(r, `2026-${String((i % 12) + 1).padStart(2, "0")}-01`));
  }

  it("전 구간 꾸준히 양수면 통과", () => {
    const trades = series(Array.from({ length: 40 }, (_, i) => (i % 2 ? 2 : -1)));
    const r = walkForwardGate(trades);
    expect(r.passed).toBe(true);
    expect(r.positiveFraction).toBe(1);
  });

  it("초반에 벌고 최근 분할이 음수면 탈락 (최근 기대값 미달)", () => {
    // 앞 30건 양수 우위, 마지막 10건 전부 손실 → 최근 분할 음수
    const trades = [
      ...Array.from({ length: 30 }, (_, i) => mk(i % 2 ? 2 : -1, `2026-01-${String((i % 28) + 1).padStart(2, "0")}`)),
      ...Array.from({ length: 10 }, (_, i) => mk(-1, `2026-12-${String((i % 28) + 1).padStart(2, "0")}`)),
    ];
    const r = walkForwardGate(trades);
    expect(r.passed).toBe(false);
    expect(r.recentExpectancyR!).toBeLessThan(0);
    expect(r.reasons.some((x) => x.includes("최근"))).toBe(true);
  });

  it("표본이 분할 수보다 적으면 탈락", () => {
    const r = walkForwardGate([mk(1), mk(1)]); // 2 < 4분할
    expect(r.passed).toBe(false);
    expect(r.reasons[0]).toContain("표본 부족");
  });

  it("evaluateFullGate — 기본+워크포워드 둘 다 통과해야 passed", () => {
    const good = series(Array.from({ length: 40 }, (_, i) => (i % 2 ? 2 : -1)));
    expect(evaluateFullGate(good).passed).toBe(true);

    // 기대값은 양수지만 최근 죽음 → 워크포워드에서 탈락
    const decaying = [
      ...Array.from({ length: 30 }, (_, i) => mk(i % 2 ? 3 : -1, `2026-01-${String((i % 28) + 1).padStart(2, "0")}`)),
      ...Array.from({ length: 10 }, (_, i) => mk(-1, `2026-12-${String((i % 28) + 1).padStart(2, "0")}`)),
    ];
    const full = evaluateFullGate(decaying);
    expect(full.passed).toBe(false);
    expect(full.reasons.some((x) => x.includes("워크포워드"))).toBe(true);
  });
});

describe("dailyRCurve — 일별 군집", () => {
  it("같은 날 여러 트레이드는 평균으로 묶임", () => {
    const sameDay = [mk(2, "2026-01-01"), mk(-2, "2026-01-01")]; // 평균 0
    const curve = dailyRCurve(sameDay, 0.01);
    expect(curve).toHaveLength(2); // start + 1일
    expect(curve[1]).toBeCloseTo(1, 10); // 1 * (1 + 0.01*0)
  });
});
