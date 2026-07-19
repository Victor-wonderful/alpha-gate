import { sizePosition } from "@/lib/sizing";

/**
 * 분할 진입(래더) 사이징 — 순수 함수.
 *
 * 시나리오의 tier(가격·비중)들을 "한 포지션"으로 묶어, 가중평균 진입가 ↔ 공유 손절
 * 기준으로 총수량을 산정(위험 X% 한 번만)하고 각 tier에 비중대로 배분한다.
 * v1은 되돌림(지정가) 래더만 — 모든 tier가 현재가의 되돌림 쪽에 있어야 한다.
 *
 * cf. docs/분할진입-설계.md (D3 사이징 · D7 v1 범위)
 */

export const MAX_LADDER_TIERS = 3;
/** v1 기본 비중 (시나리오 값이 없을 때). 1차 최대 → 뒤로 갈수록 작게. */
export const DEFAULT_LADDER_WEIGHTS = [40, 35, 25] as const;

export interface LadderTierInput {
  /** 1-based tier 번호 (1차/2차/3차). */
  tier: number;
  price: number;
  /** 비중(%) — 합 100 권장. 0/누락이면 균등 분배로 폴백. */
  weight: number;
}

export interface LadderTierSized extends LadderTierInput {
  /** 코인 수량 (비중 배분 후, 소수 4자리 floor). */
  quantity: number;
}

export interface BuildLadderResult {
  ok: boolean;
  error?: string;
  /** 비중 가중평균 진입가. */
  weightedEntry: number;
  /** 그룹 총수량 (위험 X% 기준). */
  totalQuantity: number;
  tiers: LadderTierSized[];
}

/** 비중 가중평균 진입가. 비중 합이 0이면 단순평균. */
export function weightedEntry(tiers: Array<{ price: number; weight: number }>): number {
  if (tiers.length === 0) return 0;
  const wSum = tiers.reduce((a, t) => a + (t.weight > 0 ? t.weight : 0), 0);
  if (wSum <= 0) return tiers.reduce((a, t) => a + t.price, 0) / tiers.length;
  return tiers.reduce((a, t) => a + t.price * ((t.weight > 0 ? t.weight : 0) / wSum), 0);
}

export function buildLadder(params: {
  direction: "long" | "short";
  tiers: LadderTierInput[];
  /** 공유 손절 (전 tier 동일). */
  stop: number;
  /** 공유 목표 (전 tier 동일). */
  target: number;
  accountSize: number;
  /** 그룹 전체에 허용할 위험 % (한 번만 차지). */
  riskPct: number;
  /** 현재가 — 되돌림 쪽 검증용. */
  currentPrice: number;
  /** 1차를 지금 시장가로 채우는 모드. 1차만 되돌림 쪽 검증에서 제외하고
   *  2차 이후는 그대로 되돌림이어야 한다. 이때 tiers[0].price 에는 실제
   *  체결가(현재가)를 넣어 호출해야 가중평균이 실제와 맞는다. */
  allowImmediateFirst?: boolean;
}): BuildLadderResult {
  const { direction, stop, target, accountSize, riskPct, currentPrice } = params;
  const fail = (error: string): BuildLadderResult => ({
    ok: false,
    error,
    weightedEntry: 0,
    totalQuantity: 0,
    tiers: [],
  });

  const tiers = (params.tiers ?? []).filter((t) => Number.isFinite(t.price) && t.price > 0);
  if (tiers.length === 0) return fail("진입 tier가 없습니다.");
  if (tiers.length > MAX_LADDER_TIERS)
    return fail(`분할 진입은 최대 ${MAX_LADDER_TIERS}단까지입니다.`);

  // 되돌림(지정가) 래더 — 모든 tier가 현재가의 되돌림 쪽에 있어야 한다.
  // 단 "1차 즉시" 모드에서는 1차만 예외(지금 시장가로 채우므로 현재가 자리가 정상).
  if (Number.isFinite(currentPrice) && currentPrice > 0) {
    // tier 번호가 아니라 정렬상 첫 항목을 1차로 본다(호출자가 tier 순으로 넘긴다).
    const firstTier = Math.min(...tiers.map((t) => t.tier));
    for (const t of tiers) {
      if (params.allowImmediateFirst && t.tier === firstTier) continue;
      if (direction === "long" && t.price > currentPrice)
        return fail(
          params.allowImmediateFirst
            ? "2차 이후 진입가는 현재가 이하여야 합니다 (되돌림 자리)."
            : "되돌림 지정가 래더는 모든 진입가가 현재가 이하여야 합니다.",
        );
      if (direction === "short" && t.price < currentPrice)
        return fail(
          params.allowImmediateFirst
            ? "2차 이후 진입가는 현재가 이상이어야 합니다 (되돌림 자리)."
            : "되돌림 지정가 래더는 모든 진입가가 현재가 이상이어야 합니다.",
        );
    }
  }

  const wEntry = weightedEntry(tiers);
  if (direction === "long" && (stop >= wEntry || target <= wEntry))
    return fail("롱: 손절은 진입 아래, 목표는 진입 위여야 합니다.");
  if (direction === "short" && (stop <= wEntry || target >= wEntry))
    return fail("숏: 손절은 진입 위, 목표는 진입 아래여야 합니다.");

  // 그룹 총수량 = 가중평균 진입 ↔ 공유 손절 기준 위험 X% (한 번만).
  const sizing = sizePosition({ accountSize, allowedLossPct: riskPct, entry: wEntry, stop });
  if (!sizing.valid || sizing.quantity <= 0) return fail(sizing.reason ?? "사이징 계산 실패");
  const totalQuantity = sizing.quantity;

  // 비중 배분 (비중 합 0이면 균등).
  const wSum = tiers.reduce((a, t) => a + (t.weight > 0 ? t.weight : 0), 0);
  const sized: LadderTierSized[] = tiers.map((t) => {
    const frac = wSum > 0 ? (t.weight > 0 ? t.weight : 0) / wSum : 1 / tiers.length;
    return {
      ...t,
      weight: wSum > 0 ? t.weight : Math.round((100 / tiers.length) * 100) / 100,
      quantity: Math.floor(totalQuantity * frac * 1e4) / 1e4,
    };
  });

  return { ok: true, weightedEntry: wEntry, totalQuantity, tiers: sized };
}
