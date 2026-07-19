/**
 * DCA G1 — 자산 게이트 ("모아도 되는 자산인가").
 *
 * DCA는 내릴수록 더 사는 전략이라, 죽을 수 있는 자산에 걸면 물타기가 된다.
 * 그래서 이 게이트는 점수가 아니라 **하드 차단**이다.
 *
 * 데이터 근거: 밸류존 백테스트에서 SOL 2022 폭락 구간(260→9)은 어떤 변형도
 * 순수 DCA보다 나빴다(+8~15%). 대장주(BTC/ETH)에서는 완화됐다.
 * → "유니버스를 대장주로 좁히는 것"이 전략의 전제. cf. docs/DCA-모드-설계.md §10
 */

import { MEGA_CAP_UNIVERSE } from "@/lib/analysis/radar-constants";

/** 상장 2년 미만은 사이클을 한 번도 못 겪은 자산 — 적립 대상에서 제외. */
export const MIN_LISTING_DAYS = 730;

/** 스테이블코인은 적립 대상이 아니다(가격이 안 움직이므로 밸류 존 개념 자체가 없음). */
const STABLES = new Set(["USDT", "USDC", "BUSD", "TUSD", "FDUSD", "DAI", "USDE", "PYUSD"]);

export interface AssetGateCheck {
  key: "universe" | "listingAge" | "spotMarket" | "notStable";
  label: string;
  passed: boolean;
  detail: string;
}

export interface AssetGateResult {
  /** 하나라도 실패하면 false — 적립 자체를 막는다. */
  allowed: boolean;
  symbol: string;
  checks: AssetGateCheck[];
  /** 차단 시 사용자에게 보여줄 한 줄. */
  blockReason?: string;
}

/** 심볼에서 기준 자산 추출 (BTCUSDT → BTC). */
export function baseAsset(symbol: string): string {
  return symbol.toUpperCase().replace(/USDT$/, "");
}

/**
 * 자산 게이트 판정 — 순수 함수. 네트워크 조회 결과를 받아서 판정만 한다.
 *
 * @param spotDailyCandles 현물 일봉 개수. 0이면 현물 마켓이 없다고 본다.
 */
export function checkAssetGate(args: {
  symbol: string;
  spotDailyCandles: number;
}): AssetGateResult {
  const symbol = args.symbol.toUpperCase();
  const base = baseAsset(symbol);
  const days = Number.isFinite(args.spotDailyCandles) ? args.spotDailyCandles : 0;

  const inUniverse = MEGA_CAP_UNIVERSE.includes(symbol);
  const hasSpot = days > 0;
  const oldEnough = days >= MIN_LISTING_DAYS;
  const notStable = !STABLES.has(base);

  const checks: AssetGateCheck[] = [
    {
      key: "universe",
      label: "시총 상위 대장주",
      passed: inUniverse,
      detail: inUniverse
        ? `${base}는 적립 허용 목록(시총 상위 15)에 있습니다.`
        : `${base}는 적립 허용 목록에 없습니다. 내려갈 때 더 사는 전략은 살아남을 자산에만 씁니다.`,
    },
    {
      key: "spotMarket",
      label: "현물 시장 존재",
      passed: hasSpot,
      detail: hasSpot ? "바이낸스 현물 시장이 있습니다." : "바이낸스에 현물 시장이 없습니다.",
    },
    {
      key: "listingAge",
      label: "상장 2년 이상",
      passed: oldEnough,
      detail: hasSpot
        ? `현물 일봉 ${days}일치 — 약 ${(days / 365).toFixed(1)}년`
        : "이력을 확인할 수 없습니다.",
    },
    {
      key: "notStable",
      label: "스테이블 아님",
      passed: notStable,
      detail: notStable ? `${base}는 스테이블코인이 아닙니다.` : `${base}는 스테이블코인입니다.`,
    },
  ];

  const failed = checks.find((c) => !c.passed);
  return {
    allowed: !failed,
    symbol,
    checks,
    blockReason: failed
      ? failed.key === "universe"
        ? `${base}는 적립 대상이 아닙니다 — 죽을 수 있는 자산은 물타기 금지입니다.`
        : failed.key === "listingAge"
          ? `${base}는 상장 이력이 2년 미만입니다 — 아직 한 사이클도 겪지 않은 자산입니다.`
          : failed.key === "spotMarket"
            ? `${base}는 바이낸스 현물 시장이 없습니다.`
            : `${base}는 스테이블코인이라 적립 대상이 아닙니다.`
      : undefined,
  };
}

/** 적립 가능한 자산 목록 (UI 셀렉트용). 상장 연차는 실제 조회로 확정되므로 여기선 유니버스만. */
export function dcaCandidateSymbols(): string[] {
  return MEGA_CAP_UNIVERSE.filter((s) => !STABLES.has(baseAsset(s)));
}
