import { describe, it, expect } from "vitest";
import { checkAssetGate, dcaCandidateSymbols, MIN_LISTING_DAYS } from "@/lib/dca/asset-gate";
import {
  classifyValueZone,
  dcaVolumeProfile,
  MIN_HISTORY_DAYS,
  TILT_MULTIPLIER,
  type DailyCandle,
} from "@/lib/dca/value-zone";

/**
 * DCA 게이트 회귀 테스트.
 *
 * 밸류 존은 백테스트(BTC/ETH 7년 + SOL 4.7년)로 검증된 정의라, 판정 규칙이 바뀌면
 * 검증이 무효가 된다. 3지표의 임계값(낙폭 하위 30% / MA200 ±30% / VP 하단·상단)과
 * 다수결(2표), 그리고 채택안 D의 배수(2 / 1 / 0.5)를 고정한다.
 * cf. docs/DCA-모드-설계.md §G2 · §10
 */

/** 지정한 가격 곡선으로 일봉 시퀀스를 만든다. 거래량은 균일(=VP가 가격 분포만 반영). */
function series(prices: number[], volume = 100): DailyCandle[] {
  return prices.map((p) => ({ high: p, low: p, close: p, volume }));
}

/** 완만한 상승 후 지정한 최종 구간으로 끌고 가는 히스토리. */
function history(opts: { days?: number; start: number; peak: number; end: number }): DailyCandle[] {
  const days = opts.days ?? 500;
  const rise = Math.floor(days * 0.6);
  const prices: number[] = [];
  for (let i = 0; i < rise; i++) prices.push(opts.start + ((opts.peak - opts.start) * i) / (rise - 1));
  for (let i = 0; i < days - rise; i++)
    prices.push(opts.peak + ((opts.end - opts.peak) * i) / (days - rise - 1));
  return series(prices);
}

describe("DCA G1 — 자산 게이트", () => {
  it("대장주 + 충분한 이력이면 통과", () => {
    const r = checkAssetGate({ symbol: "BTCUSDT", spotDailyCandles: 2000 });
    expect(r.allowed).toBe(true);
    expect(r.blockReason).toBeUndefined();
  });

  it("유니버스 밖 자산은 하드 차단", () => {
    const r = checkAssetGate({ symbol: "PEPEUSDT", spotDailyCandles: 2000 });
    expect(r.allowed).toBe(false);
    expect(r.blockReason).toContain("물타기 금지");
  });

  it("상장 2년 미만이면 차단", () => {
    const r = checkAssetGate({ symbol: "SUIUSDT", spotDailyCandles: MIN_LISTING_DAYS - 1 });
    expect(r.allowed).toBe(false);
    expect(r.checks.find((c) => c.key === "listingAge")?.passed).toBe(false);
  });

  it("현물 시장이 없으면 차단", () => {
    const r = checkAssetGate({ symbol: "BTCUSDT", spotDailyCandles: 0 });
    expect(r.allowed).toBe(false);
    expect(r.checks.find((c) => c.key === "spotMarket")?.passed).toBe(false);
  });

  it("후보 목록에 스테이블은 없다", () => {
    expect(dcaCandidateSymbols().some((s) => s.startsWith("USDC"))).toBe(false);
    expect(dcaCandidateSymbols()).toContain("BTCUSDT");
  });
});

describe("DCA G2 — 밸류 존", () => {
  it("이력이 모자라면 판정하지 않는다", () => {
    const r = classifyValueZone(series(new Array(MIN_HISTORY_DAYS - 1).fill(100)));
    expect(r.ok).toBe(false);
    expect(r.error).toContain(String(MIN_HISTORY_DAYS));
  });

  it("고점에서 크게 빠진 자리는 cheap", () => {
    // 100 → 300 상승 후 120까지 하락: 낙폭 깊음 + MA200 아래 + 매물대 하단.
    const r = classifyValueZone(history({ start: 100, peak: 300, end: 120 }));
    expect(r.ok).toBe(true);
    expect(r.verdict).toBe("cheap");
    expect(r.cheapVotes).toBeGreaterThanOrEqual(2);
  });

  it("오래 눌려 있다 급등한 자리는 expensive", () => {
    // 400일 100 부근 횡보(매물대·MA200이 여기에 형성) → 마지막 100일 100→220 급등.
    // 신고가라 낙폭 얕고, MA200 대비 +30% 초과, 매물대 상단 위 → 3표 전부 비쌈.
    const base = new Array(400).fill(100);
    const rally = new Array(100).fill(0).map((_, i) => 100 + (120 * i) / 99);
    const r = classifyValueZone(series([...base, ...rally]));
    expect(r.ok).toBe(true);
    expect(r.verdict).toBe("expensive");
    expect(r.expensiveVotes).toBeGreaterThanOrEqual(2);
  });

  it("고점에서 오래 횡보하면 비싸다고 보지 않는다 (이동평균이 따라붙음)", () => {
    // 급등 직후가 아니라 그 가격에 오래 머문 상태 — 3지표 중 비쌈 표가 모이지 않는다.
    const r = classifyValueZone(history({ start: 100, peak: 300, end: 300 }));
    expect(r.ok).toBe(true);
    expect(r.expensiveVotes).toBeLessThan(2);
  });

  it("판정마다 채택안 D의 배수가 따라온다 (2 / 1 / 0.5)", () => {
    expect(TILT_MULTIPLIER.cheap).toBe(2);
    expect(TILT_MULTIPLIER.neutral).toBe(1);
    expect(TILT_MULTIPLIER.expensive).toBe(0.5);
    const cheap = classifyValueZone(history({ start: 100, peak: 300, end: 120 }));
    expect(cheap.tiltMultiplier).toBe(TILT_MULTIPLIER[cheap.verdict]);
  });

  it("3지표를 모두 근거로 남긴다", () => {
    const r = classifyValueZone(history({ start: 100, peak: 300, end: 150 }));
    expect(r.signals.map((s) => s.key)).toEqual(["drawdown", "ma200", "volumeProfile"]);
    for (const s of r.signals) expect(s.detail.length).toBeGreaterThan(0);
  });

  it("다수결 — 2표 미만이면 중립", () => {
    const r = classifyValueZone(history({ start: 100, peak: 300, end: 150 }));
    if (r.verdict === "neutral") {
      expect(r.cheapVotes).toBeLessThan(2);
      expect(r.expensiveVotes).toBeLessThan(2);
    }
  });
});

describe("DCA 볼륨 프로파일 — 하니스와 같은 정의", () => {
  it("거래량이 몰린 구간이 밸류 영역이 된다", () => {
    // 10 근처에 대부분의 거래량, 100 근처에 소량.
    const candles: DailyCandle[] = [
      ...new Array(90).fill(0).map(() => ({ high: 10, low: 10, close: 10, volume: 100 })),
      ...new Array(10).fill(0).map(() => ({ high: 100, low: 100, close: 100, volume: 1 })),
    ];
    const vp = dcaVolumeProfile(candles);
    expect(vp).not.toBeNull();
    expect(vp!.val).toBeLessThanOrEqual(10);
    expect(vp!.vah).toBeLessThan(100);
  });

  it("가격 폭이 0이면 null", () => {
    expect(dcaVolumeProfile(series(new Array(10).fill(50)))).toBeNull();
  });
});
