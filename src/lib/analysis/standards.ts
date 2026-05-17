import type { TradingStyle } from "./style";

/** Round-trip cost on Binance USDT-M Futures (taker + slippage, BTC/ETH).
 *  Used in fee-adjusted R:R thinking. */
export const ROUND_TRIP_COST_PCT = 0.12;

export interface StyleStandard {
  /** % of entry price */
  stopPct: { min: number; max: number };
  /** % of entry price */
  targetPct: { min: number; max: number };
  /** reward / risk */
  rr: { min: number };
}

/** Expert-consensus standard ranges, adjusted for real costs. */
export const STYLE_STANDARDS: Record<TradingStyle, StyleStandard> = {
  scalp: {
    stopPct: { min: 0.3, max: 0.7 },
    targetPct: { min: 0.7, max: 1.5 },
    rr: { min: 2 },
  },
  day: {
    stopPct: { min: 0.7, max: 1.5 },
    targetPct: { min: 1.5, max: 3 },
    rr: { min: 1.5 },
  },
  swing: {
    stopPct: { min: 2, max: 5 },
    targetPct: { min: 5, max: 15 },
    rr: { min: 2 },
  },
  position: {
    stopPct: { min: 5, max: 15 },
    targetPct: { min: 15, max: 50 },
    rr: { min: 3 },
  },
};

export type CheckStatus = "ok" | "warn" | "fail";

export interface RangeCheck {
  status: CheckStatus;
  label: string;
}

export function checkStop(stopPct: number, style: TradingStyle): RangeCheck {
  const s = STYLE_STANDARDS[style].stopPct;
  if (stopPct < s.min)
    return {
      status: "warn",
      label: `손절폭 ${stopPct.toFixed(2)}% — 표준 ${s.min}~${s.max}% 보다 좁음 (노이즈에 잡힐 위험)`,
    };
  if (stopPct > s.max)
    return {
      status: "warn",
      label: `손절폭 ${stopPct.toFixed(2)}% — 표준 ${s.min}~${s.max}% 보다 큼`,
    };
  return {
    status: "ok",
    label: `손절폭 ${stopPct.toFixed(2)}% — 표준 범위 (${s.min}~${s.max}%)`,
  };
}

export function checkTarget(targetPct: number, style: TradingStyle): RangeCheck {
  const t = STYLE_STANDARDS[style].targetPct;
  if (targetPct < t.min)
    return {
      status: "warn",
      label: `목표폭 ${targetPct.toFixed(2)}% — 표준 ${t.min}~${t.max}% 보다 작음 (수수료에 까일 수 있음)`,
    };
  return {
    status: "ok",
    label: `목표폭 ${targetPct.toFixed(2)}% — 표준 범위 (${t.min}~${t.max}%)`,
  };
}

export function checkRR(rr: number, style: TradingStyle): RangeCheck {
  const r = STYLE_STANDARDS[style].rr;
  if (rr < r.min)
    return {
      status: "warn",
      label: `손익비 ${rr.toFixed(2)} — 표준 ${r.min}+ 미달 (수수료 차감 시 적자 가능)`,
    };
  return {
    status: "ok",
    label: `손익비 ${rr.toFixed(2)} — 표준 ${r.min}+ 충족`,
  };
}

export function checkRiskPct(riskPct: number): RangeCheck {
  if (riskPct <= 0)
    return { status: "fail", label: "거래당 리스크가 0 이하" };
  if (riskPct <= 0.5)
    return { status: "ok", label: `거래당 리스크 ${riskPct.toFixed(2)}% — 보수적 (입문자 권장)` };
  if (riskPct <= 1)
    return { status: "ok", label: `거래당 리스크 ${riskPct.toFixed(2)}% — 일반 권장 범위` };
  if (riskPct <= 2)
    return {
      status: "warn",
      label: `거래당 리스크 ${riskPct.toFixed(2)}% — 공격적 (검증된 시스템 한정)`,
    };
  return {
    status: "fail",
    label: `거래당 리스크 ${riskPct.toFixed(2)}% — 권장 한도 2% 초과`,
  };
}

/** Effective R:R after subtracting round-trip cost from the target.
 *  This is a rough but useful heuristic. */
export function effectiveRR(
  entry: number,
  stop: number,
  target: number,
  costPct = ROUND_TRIP_COST_PCT,
): number {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  const cost = entry * (costPct / 100);
  if (risk === 0) return 0;
  return Math.max(0, reward - cost) / risk;
}
