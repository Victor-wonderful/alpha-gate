import "server-only";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { MoneyContext, Direction } from "@/types/trade";

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
    .select("id, symbol, direction, entry, position_quantity, order_status")
    .eq("user_id", user.id)
    .neq("mode", "backtest")
    .is("closed_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

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

  return {
    todayCumulativeR,
    todayClosedCount,
    openPositions,
    openExposurePct: pct(totalExposure),
    longExposurePct: pct(longExposure),
    shortExposurePct: pct(shortExposure),
  };
}
