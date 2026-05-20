import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";

/**
 * Pre-trade safety checks for live trading.
 *
 * These run inside placeLiveTradeAction BEFORE any exchange API call.
 * Any FAIL aborts the trade with a clear message.
 *
 * Limits are intentionally conservative — better to block a marginal trade
 * than to lose a day's account on a tilt session.
 */

export const LIVE_GUARD_LIMITS = {
  /** Block live entry if today's realized cumulative R is at or below this. */
  dailyLossLimitR: -2,
  /** Block live entry if a new position would push total live notional exposure above this % of account. */
  totalExposurePctOfAccount: 80,
  /** Block live entry if THIS new position alone exceeds this % of account. */
  singleTradeNotionalPctOfAccount: 50,
  /** Block live entry of grade D ("거래 금지" 등급). */
  blockGrades: ["D"] as const,
  /** Block live entry if there is already an open live trade for the same symbol+direction. */
  blockDuplicateOpenSameSymbol: true,
};

export interface GuardContext {
  userId: string;
  symbol: string;
  direction: "long" | "short";
  grade: string; // 'A' | 'B' | 'C' | 'D'
  /** Position notional (entry * quantity) in account currency. */
  notional: number;
  accountSize: number;
}

export interface GuardResult {
  ok: boolean;
  reason?: string;
  /** Helpful context shown to the user. */
  detail?: {
    todayR?: number;
    currentExposurePct?: number;
    newExposurePct?: number;
    duplicateSymbolOpen?: boolean;
  };
}

/** Returns ok=false with a user-facing reason if any guard trips. */
export async function checkLiveGuards(ctx: GuardContext): Promise<GuardResult> {
  const supabase = getSupabaseService();

  // Guard 1: Grade
  if (LIVE_GUARD_LIMITS.blockGrades.includes(ctx.grade as never)) {
    return {
      ok: false,
      reason: `등급 ${ctx.grade}는 실거래 차단 (거래 금지 등급). 페이퍼로 기록만 하거나 셋업을 다시 검토하세요.`,
    };
  }

  // Guard 2: Today's cumulative R (closed live + paper, today, KST)
  const dayStartUtc = startOfTodayUtcForKst();
  const { data: closedToday } = await supabase
    .from("trades")
    .select("result_r")
    .eq("user_id", ctx.userId)
    .gte("closed_at", dayStartUtc)
    .not("result_r", "is", null)
    .neq("mode", "backtest");

  const todayR = (closedToday ?? []).reduce((s, t) => s + Number(t.result_r ?? 0), 0);
  if (todayR <= LIVE_GUARD_LIMITS.dailyLossLimitR) {
    return {
      ok: false,
      reason: `오늘 누적 결과 ${todayR.toFixed(2)}R — 일일 손실 한도(${LIVE_GUARD_LIMITS.dailyLossLimitR}R) 도달. 내일 다시 시도하세요.`,
      detail: { todayR },
    };
  }

  // Guard 3: Single trade notional cap
  const newExposurePct = ctx.accountSize > 0 ? (ctx.notional / ctx.accountSize) * 100 : 0;
  if (newExposurePct > LIVE_GUARD_LIMITS.singleTradeNotionalPctOfAccount) {
    return {
      ok: false,
      reason: `이 거래 노출 금액 ${newExposurePct.toFixed(1)}% — 거래당 한도(${LIVE_GUARD_LIMITS.singleTradeNotionalPctOfAccount}%) 초과. 리스크% 또는 레버리지를 줄이세요.`,
      detail: { newExposurePct },
    };
  }

  // Guard 4: Total live exposure (sum of open live positions' notional)
  const { data: openLive } = await supabase
    .from("trades")
    .select("symbol, direction, entry, position_quantity")
    .eq("user_id", ctx.userId)
    .eq("is_paper", false)
    .eq("exchange_status", "open")
    .is("closed_at", null);

  const currentNotional = (openLive ?? []).reduce(
    (s, t) => s + Number(t.entry ?? 0) * Number(t.position_quantity ?? 0),
    0,
  );
  const currentExposurePct = ctx.accountSize > 0 ? (currentNotional / ctx.accountSize) * 100 : 0;
  const totalAfter = currentExposurePct + newExposurePct;
  if (totalAfter > LIVE_GUARD_LIMITS.totalExposurePctOfAccount) {
    return {
      ok: false,
      reason: `현재 노출 ${currentExposurePct.toFixed(1)}% + 이번 거래 ${newExposurePct.toFixed(1)}% = ${totalAfter.toFixed(1)}% > 총 한도(${LIVE_GUARD_LIMITS.totalExposurePctOfAccount}%). 다른 포지션을 먼저 정리하세요.`,
      detail: { currentExposurePct, newExposurePct },
    };
  }

  // Guard 5: Duplicate symbol+direction open
  if (LIVE_GUARD_LIMITS.blockDuplicateOpenSameSymbol) {
    const dup = (openLive ?? []).some(
      (t) => t.symbol === ctx.symbol && t.direction === ctx.direction,
    );
    if (dup) {
      return {
        ok: false,
        reason: `${ctx.symbol} ${ctx.direction === "long" ? "롱" : "숏"} 포지션이 이미 진행 중입니다. 동일 코인 같은 방향 중복 진입은 차단됩니다.`,
        detail: { duplicateSymbolOpen: true },
      };
    }
  }

  return {
    ok: true,
    detail: { todayR, currentExposurePct, newExposurePct },
  };
}

/** Returns the UTC ISO string of "today 00:00 KST" — i.e. the moment that
 *  divides yesterday's R from today's R in Korea. */
function startOfTodayUtcForKst(): string {
  const now = new Date();
  // KST = UTC+9. So 00:00 KST = 15:00 UTC of the previous day.
  // Compute current KST date components.
  const kstMs = now.getTime() + 9 * 60 * 60_000;
  const kstDate = new Date(kstMs);
  const y = kstDate.getUTCFullYear();
  const m = kstDate.getUTCMonth();
  const d = kstDate.getUTCDate();
  // Midnight KST → that's (y, m, d, 0, 0, 0) KST = (y, m, d, -9, 0, 0) UTC
  const midnightKstAsUtc = Date.UTC(y, m, d, 0, 0, 0) - 9 * 60 * 60_000;
  return new Date(midnightKstAsUtc).toISOString();
}
