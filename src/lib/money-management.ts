import "server-only";
import { getSupabaseServer } from "@/lib/supabase/server";
import { type MoneyContext, type Direction, TOTAL_RISK_BUDGET_PCT } from "@/types/trade";

/**
 * 오늘 마감된 거래의 누적 R + 진행 중(미마감) 포지션 집계.
 * 거래 평가 페이지의 "자금 관리 상태" 블록에서 사용.
 */
export async function getMoneyContext(accountSize: number): Promise<MoneyContext> {
  const empty: MoneyContext = {
    todayCumulativeR: 0,
    todayClosedCount: 0,
    openPositions: [],
    openExposurePct: 0,
    longExposurePct: 0,
    shortExposurePct: 0,
    usedRiskPct: 0,
    riskBudgetPct: TOTAL_RISK_BUDGET_PCT,
    remainingRiskPct: TOTAL_RISK_BUDGET_PCT,
  };

  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  // KST 자정 기준 (UTC+9). 사용자가 한국 시간대로 운영한다고 가정.
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kstMidnight = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), 0, 0, 0));
  const utcStartOfTodayKST = new Date(kstMidnight.getTime() - 9 * 60 * 60 * 1000);

  // 백테스트 거래는 일일 손실 한도/노출 집계에서 제외 (시뮬이라 실제 자금 관리와 무관).
  const { data: closedToday } = await supabase
    .from("trades")
    .select("result_r")
    .eq("user_id", user.id)
    .neq("mode", "backtest")
    .not("closed_at", "is", null)
    .gte("closed_at", utcStartOfTodayKST.toISOString());

  const { data: openRows } = await supabase
    .from("trades")
    .select("id, symbol, direction, entry, stop, position_quantity, order_status, context_flags")
    .eq("user_id", user.id)
    .neq("mode", "backtest")
    .is("closed_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  // 예약(pending) 지정가/역지정가 주문 — 아직 체결 전이지만 위험을 미리 예약(차감).
  const { data: pendingRows } = await supabase
    .from("pending_limit_orders")
    .select("limit_price, stop, quantity, direction")
    .eq("user_id", user.id)
    .eq("status", "open");

  const todayCumulativeR = (closedToday ?? []).reduce(
    (s, r) => s + (Number(r.result_r) || 0),
    0,
  );
  const todayClosedCount = closedToday?.length ?? 0;

  // 미체결/취소/만료 지정가 주문은 실제 보유 포지션이 아니므로 노출에서 제외.
  // (체결된 포지션 = order_status "filled", 구버전 시장가 = null → 둘 다 포함)
  const NON_POSITION = new Set(["pending", "canceled", "expired"]);
  const openPositions = (openRows ?? [])
    .filter((r) => !NON_POSITION.has((r.order_status as string | null) ?? ""))
    // 적립(DCA) 회차는 위험 예산에서 뺀다. 손절이 없는 매수라 |진입−손절| 이 의미가 없고,
    // 주문 경로가 채운 기본 손절(±2%)이 위험으로 잡히면 예산을 헛되이 깎는다.
    // 적립은 "잃을 수 있는 금액"이 아니라 "쓰기로 한 예산"으로 관리한다(플랜의 총예산).
    .filter((r) => !(r.context_flags as { dcaPlanId?: string } | null)?.dcaPlanId)
    .map((r) => ({
      id: r.id as string,
      symbol: r.symbol as string,
      direction: r.direction as Direction,
      positionSize: (Number(r.entry) || 0) * (Number(r.position_quantity) || 0),
    }));

  const totalExposure = openPositions.reduce((s, p) => s + p.positionSize, 0);
  const longExposure = openPositions
    .filter((p) => p.direction === "long")
    .reduce((s, p) => s + p.positionSize, 0);
  const shortExposure = openPositions
    .filter((p) => p.direction === "short")
    .reduce((s, p) => s + p.positionSize, 0);
  const pct = (v: number) => (accountSize > 0 ? (v / accountSize) * 100 : 0);

  // ── 위험 예산 ── 오픈+예약 포지션의 "손절 시 손실"을 합산해 예산에서 차감.
  // 위험 = |진입 - 손절| × 수량 (계좌 대비 %). 노출(사이즈)이 아니라 실제 잃을 금액.
  const openRisk = (openRows ?? [])
    .filter((r) => !NON_POSITION.has((r.order_status as string | null) ?? ""))
    .reduce((s, r) => s + Math.abs((Number(r.entry) || 0) - (Number(r.stop) || 0)) * (Number(r.position_quantity) || 0), 0);
  const pendingRisk = (pendingRows ?? []).reduce(
    (s, r) => s + Math.abs((Number(r.limit_price) || 0) - (Number(r.stop) || 0)) * (Number(r.quantity) || 0),
    0,
  );
  const usedRiskPct = pct(openRisk + pendingRisk);
  const remainingRiskPct = Math.max(0, TOTAL_RISK_BUDGET_PCT - usedRiskPct);

  return {
    todayCumulativeR,
    todayClosedCount,
    openPositions,
    openExposurePct: pct(totalExposure),
    longExposurePct: pct(longExposure),
    shortExposurePct: pct(shortExposure),
    usedRiskPct,
    riskBudgetPct: TOTAL_RISK_BUDGET_PCT,
    remainingRiskPct,
  };
}
