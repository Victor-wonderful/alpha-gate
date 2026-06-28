import { describe, it, expect } from "vitest";
import {
  detectVolSqueeze,
  detectSigma,
  computeConfluence,
  type DirectionalVote,
} from "@/lib/analysis/detectors";
import type { Candle } from "@/lib/analysis/binance";

function candle(close: number, high = close, low = close, volume = 100): Candle {
  return {
    openTime: 0,
    open: close,
    high,
    low,
    close,
    volume,
    closeTime: 0,
    buyVolume: volume / 2,
  };
}

describe("detectVolSqueeze", () => {
  it("봉 부족이면 비활성", () => {
    const r = detectVolSqueeze([candle(100), candle(101)]);
    expect(r.active).toBe(false);
  });

  it("변동성 수축(고변동→저변동) 후 거래량 동반 돌파 → 활성", () => {
    const c: Candle[] = [];
    // 앞 65봉: 고변동(±3 스윙) — 큰 ATR
    for (let i = 0; i < 65; i++) {
      const base = 100 + (i % 2 === 0 ? 3 : -3);
      c.push(candle(base, base + 3, base - 3, 100));
    }
    // 뒤 25봉: 저변동(±0.2)으로 수축 — recent ATR%가 window 하위 분위로 떨어짐
    for (let i = 0; i < 25; i++) {
      const base = 100 + (i % 2 === 0 ? 0.2 : -0.2);
      c.push(candle(base, base + 0.2, base - 0.2, 100));
    }
    // 돌파봉: 직전 20봉 최고가 확실히 위 + 거래량 3배
    c.push(candle(105, 105.5, 100.5, 300));
    const r = detectVolSqueeze(c);
    expect(r.active).toBe(true);
    expect(r.breakoutLevel).not.toBeNull();
    expect(r.squeezeRank!).toBeLessThanOrEqual(0.25);
  });

  it("수축 없이 일정 변동이면 비활성(recent가 저분위 아님)", () => {
    const c: Candle[] = [];
    for (let i = 0; i < 90; i++) {
      const base = 100 + (i % 2 === 0 ? 0.3 : -0.3);
      c.push(candle(base, base + 0.3, base - 0.3, 100));
    }
    c.push(candle(105, 105.5, 100.5, 300)); // 돌파지만 수축 아님
    expect(detectVolSqueeze(c).active).toBe(false);
  });
});

describe("detectSigma", () => {
  it("z <= -2 → long(과매도)", () => {
    const c: Candle[] = [];
    for (let i = 0; i < 20; i++) c.push(candle(100)); // 평탄 → sd 작음
    c[19] = candle(90); // 마지막만 급락 → 강한 음의 z
    const r = detectSigma(c, 20, 2);
    expect(r.active).toBe(true);
    expect(r.side).toBe("long");
    expect(r.z!).toBeLessThanOrEqual(-2);
  });

  it("정상 범위면 비활성", () => {
    const c: Candle[] = [];
    for (let i = 0; i < 20; i++) c.push(candle(100 + (i % 2 ? 1 : -1)));
    const r = detectSigma(c, 20, 2);
    expect(r.active).toBe(false);
  });
});

describe("computeConfluence", () => {
  it("같은 방향 2개+ → highConviction", () => {
    const votes: DirectionalVote[] = [
      { name: "추세", side: "long" },
      { name: "체결흐름", side: "long" },
    ];
    const r = computeConfluence(votes);
    expect(r.net).toBe("long");
    expect(r.highConviction).toBe(true);
    expect(r.longCount).toBe(2);
  });

  it("동수면 mixed + 고확신 아님", () => {
    const r = computeConfluence([
      { name: "a", side: "long" },
      { name: "b", side: "short" },
    ]);
    expect(r.net).toBe("mixed");
    expect(r.highConviction).toBe(false);
  });

  it("투표 없으면 none", () => {
    expect(computeConfluence([]).net).toBe("none");
  });
});
