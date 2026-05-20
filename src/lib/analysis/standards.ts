import type { TradingStyle } from "./style";
import type { StrategyId } from "./strategy";

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

/** Strategy-specific overrides for stop/target ranges.
 *  Some strategies legitimately produce tighter stops or higher RRs than the
 *  pure style baseline (e.g. liquidity_grab uses the swept wick as natural
 *  invalidation, which is often very close).
 *
 *  - stopMinMultiplier: multiplied with the style's stopPct.min as the floor.
 *    A value of 0.3 means "you may have a stop as tight as 30% of the style minimum".
 *  - rrMin: minimum reward/risk required for THIS strategy (overrides style).
 *  - note: short reason shown in UI when an exception applies.
 */
export interface StrategyExceptions {
  stopMinMultiplier: number;
  targetMinMultiplier: number;
  rrMin: number;
  note: string;
}

export const STRATEGY_EXCEPTIONS: Partial<Record<StrategyId, StrategyExceptions>> = {
  liquidity_grab: {
    stopMinMultiplier: 0.2, // 스윕된 wick이 자연 손절 → 매우 좁은 손절 허용
    targetMinMultiplier: 0.5,
    rrMin: 2.5, // 좁은 손절 보상으로 RR 더 요구
    note: "유동성 사냥 — sweep wick이 자연 손절, 손절 좁은 게 정상",
  },
  session_open_drive: {
    stopMinMultiplier: 0.5, // 개장 캔들 시가가 자연 손절
    targetMinMultiplier: 0.6,
    rrMin: 1.5,
    note: "세션 개장 드라이브 — 개장 캔들 시가가 자연 손절",
  },
  funding_squeeze: {
    stopMinMultiplier: 1, // 표준 그대로
    targetMinMultiplier: 0.7,
    rrMin: 2,
    note: "펀딩 압착 — 시간 한도 12~24시간 (그 안에 진행 없으면 청산)",
  },
};

/** Resolve effective ranges for a (style, strategy) pair. */
export function resolveStandard(
  style: TradingStyle,
  strategy?: StrategyId,
): {
  stopPct: { min: number; max: number };
  targetPct: { min: number; max: number };
  rrMin: number;
  exceptionNote?: string;
} {
  const base = STYLE_STANDARDS[style];
  const ex = strategy ? STRATEGY_EXCEPTIONS[strategy] : undefined;
  if (!ex) {
    return {
      stopPct: base.stopPct,
      targetPct: base.targetPct,
      rrMin: base.rr.min,
    };
  }
  return {
    stopPct: {
      min: base.stopPct.min * ex.stopMinMultiplier,
      max: base.stopPct.max,
    },
    targetPct: {
      min: base.targetPct.min * ex.targetMinMultiplier,
      max: base.targetPct.max,
    },
    rrMin: ex.rrMin,
    exceptionNote: ex.note,
  };
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

export function checkStop(stopPct: number, style: TradingStyle, strategy?: StrategyId): RangeCheck {
  const r = resolveStandard(style, strategy);
  const { min, max } = r.stopPct;
  const minStr = min.toFixed(min < 1 ? 2 : 1);
  const maxStr = max.toFixed(max < 1 ? 2 : 1);
  if (stopPct < min)
    return {
      status: "warn",
      label: `손절폭 ${stopPct.toFixed(2)}% — 표준 ${minStr}~${maxStr}% 보다 좁음 (노이즈에 잡힐 위험)`,
    };
  if (stopPct > max)
    return {
      status: "warn",
      label: `손절폭 ${stopPct.toFixed(2)}% — 표준 ${minStr}~${maxStr}% 보다 큼`,
    };
  return {
    status: "ok",
    label: `손절폭 ${stopPct.toFixed(2)}% — 표준 범위 (${minStr}~${maxStr}%)`,
  };
}

export function checkTarget(targetPct: number, style: TradingStyle, strategy?: StrategyId): RangeCheck {
  const r = resolveStandard(style, strategy);
  const { min, max } = r.targetPct;
  const minStr = min.toFixed(min < 1 ? 2 : 1);
  const maxStr = max.toFixed(max < 1 ? 2 : 1);
  if (targetPct < min)
    return {
      status: "warn",
      label: `목표폭 ${targetPct.toFixed(2)}% — 표준 ${minStr}~${maxStr}% 보다 작음 (수수료에 까일 수 있음)`,
    };
  return {
    status: "ok",
    label: `목표폭 ${targetPct.toFixed(2)}% — 표준 범위 (${minStr}~${maxStr}%)`,
  };
}

export function checkRR(rr: number, style: TradingStyle, strategy?: StrategyId): RangeCheck {
  const r = resolveStandard(style, strategy);
  if (rr < r.rrMin)
    return {
      status: "warn",
      label: `손익비 ${rr.toFixed(2)} — 표준 ${r.rrMin}+ 미달 (수수료 차감 시 적자 가능)`,
    };
  return {
    status: "ok",
    label: `손익비 ${rr.toFixed(2)} — 표준 ${r.rrMin}+ 충족`,
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
