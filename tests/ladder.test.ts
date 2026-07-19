import { describe, expect, it } from "vitest";
import { buildLadder, weightedEntry, MAX_LADDER_TIERS } from "@/lib/ladder";

describe("weightedEntry", () => {
  it("computes weight-weighted average", () => {
    const w = weightedEntry([
      { price: 100, weight: 40 },
      { price: 97, weight: 35 },
      { price: 94, weight: 25 },
    ]);
    expect(w).toBeCloseTo(97.45, 6);
  });
  it("falls back to simple average when weights are 0", () => {
    expect(weightedEntry([{ price: 100, weight: 0 }, { price: 96, weight: 0 }])).toBe(98);
  });
});

describe("buildLadder", () => {
  const base = {
    direction: "long" as const,
    tiers: [
      { tier: 1, price: 100, weight: 40 },
      { tier: 2, price: 97, weight: 35 },
      { tier: 3, price: 94, weight: 25 },
    ],
    stop: 92,
    target: 115,
    accountSize: 10000,
    riskPct: 1,
    currentPrice: 100,
  };

  it("sizes a valid long ladder — risk taken once on weighted entry", () => {
    const r = buildLadder(base);
    expect(r.ok).toBe(true);
    expect(r.weightedEntry).toBeCloseTo(97.45, 4);
    // maxLoss 100 / riskPerUnit |97.45-92|=5.45 → ~18.3486
    expect(r.totalQuantity).toBeCloseTo(18.3486, 3);
    expect(r.tiers).toHaveLength(3);
    // 각 tier 수량 > 0, 합계 ≈ 총수량(내림 오차 이내)
    const sum = r.tiers.reduce((a, t) => a + t.quantity, 0);
    expect(sum).toBeGreaterThan(0);
    expect(sum).toBeLessThanOrEqual(r.totalQuantity + 1e-9);
    expect(r.totalQuantity - sum).toBeLessThan(0.001);
    // 1차 비중이 가장 큼
    expect(r.tiers[0].quantity).toBeGreaterThan(r.tiers[2].quantity);
  });

  it("총위험이 그룹당 1번만 — tier별 |price-stop|×qty 합이 maxLoss 이하", () => {
    const r = buildLadder(base);
    const totalRisk = r.tiers.reduce((a, t) => a + Math.abs(t.price - base.stop) * t.quantity, 0);
    // 가중평균 기준 maxLoss=100. 깊은 tier는 손절에 가까워 tier합 위험은 100 이하(보수적).
    expect(totalRisk).toBeLessThanOrEqual(100 + 1e-6);
  });

  it("short 대칭 — 되돌림은 현재가 위", () => {
    const r = buildLadder({
      direction: "short",
      tiers: [
        { tier: 1, price: 100, weight: 40 },
        { tier: 2, price: 103, weight: 35 },
        { tier: 3, price: 106, weight: 25 },
      ],
      stop: 110,
      target: 85,
      accountSize: 10000,
      riskPct: 1,
      currentPrice: 100,
    });
    expect(r.ok).toBe(true);
    expect(r.weightedEntry).toBeCloseTo(102.55, 4);
    expect(r.tiers).toHaveLength(3);
  });

  // ── "1차 즉시" 모드 (거래 폼에서 "지금 바로"를 고른 경우) ──────────────
  // 1차는 지금 시장가로 체결되므로 되돌림 검사에서 제외하고, 2차 이후만 되돌림이어야 한다.
  it("1차 즉시 모드 — 1차가 현재가 자리여도 통과", () => {
    const r = buildLadder({
      ...base,
      // 현재가 99에서 즉시 체결 → 1차 가격은 실제 체결가로 들어온다.
      tiers: [
        { tier: 1, price: 99, weight: 40 },
        { tier: 2, price: 97, weight: 35 },
        { tier: 3, price: 94, weight: 25 },
      ],
      currentPrice: 99,
      allowImmediateFirst: true,
    });
    expect(r.ok).toBe(true);
    expect(r.tiers).toHaveLength(3);
  });

  it("1차 즉시 모드라도 2차 이후가 현재가 위면 거부 (롱)", () => {
    const r = buildLadder({
      ...base,
      tiers: [
        { tier: 1, price: 99, weight: 40 },
        { tier: 2, price: 101, weight: 35 }, // 되돌림이 아님
      ],
      currentPrice: 99,
      allowImmediateFirst: true,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("2차 이후");
  });

  it("1차 즉시 모드 — 위험은 여전히 그룹당 1번", () => {
    const r = buildLadder({
      ...base,
      tiers: [
        { tier: 1, price: 99, weight: 40 },
        { tier: 2, price: 97, weight: 35 },
        { tier: 3, price: 94, weight: 25 },
      ],
      currentPrice: 99,
      allowImmediateFirst: true,
    });
    const totalRisk = r.tiers.reduce((a, t) => a + Math.abs(t.price - base.stop) * t.quantity, 0);
    expect(totalRisk).toBeLessThanOrEqual(100 + 1e-6);
  });

  it("1차만 체결되고 나머지가 미체결이어도 손실이 예산을 넘지 않는다", () => {
    // 부분 체결(1차만) 시 실제 손실 = qty1 × |1차가 − 손절|. 예산(100) 이하여야 한다.
    const r = buildLadder({
      ...base,
      tiers: [
        { tier: 1, price: 99, weight: 40 },
        { tier: 2, price: 97, weight: 35 },
        { tier: 3, price: 94, weight: 25 },
      ],
      currentPrice: 99,
      allowImmediateFirst: true,
    });
    const t1 = r.tiers[0];
    expect(Math.abs(t1.price - base.stop) * t1.quantity).toBeLessThanOrEqual(100 + 1e-6);
  });

  it("되돌림 쪽 위반 거부 — 롱 tier가 현재가 위", () => {
    const r = buildLadder({ ...base, tiers: [{ tier: 1, price: 101, weight: 100 }] });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/현재가 이하/);
  });

  it("손절 방향 오류 거부 — 롱 손절이 진입 위", () => {
    const r = buildLadder({ ...base, stop: 99 });
    expect(r.ok).toBe(false);
  });

  it("최대 tier 초과 거부", () => {
    const four = [1, 2, 3, 4].map((i) => ({ tier: i, price: 100 - i, weight: 25 }));
    const r = buildLadder({ ...base, tiers: four });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(new RegExp(`${MAX_LADDER_TIERS}단`));
  });

  it("단일 tier(weight 100)면 총수량 그대로", () => {
    const r = buildLadder({ ...base, tiers: [{ tier: 1, price: 96, weight: 100 }] });
    expect(r.ok).toBe(true);
    expect(r.tiers).toHaveLength(1);
    expect(r.tiers[0].quantity).toBeCloseTo(r.totalQuantity, 6);
  });

  it("계좌 0 거부", () => {
    expect(buildLadder({ ...base, accountSize: 0 }).ok).toBe(false);
  });
});
