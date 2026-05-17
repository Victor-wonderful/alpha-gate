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

  const { data: closedToday } = await supabase
    .from("trades")
    .select("result_r")
    .eq("user_id", user.id)
    .not("closed_at", "is", null)
    .gte("closed_at", utcStartOfTodayKST.toISOString());

  const { data: openRows } = await supabase
    .from("trades")
    .select("id, symbol, direction, entry, position_quantity")
    .eq("user_id", user.id)
    .is("closed_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const todayCumulativeR = (closedToday ?? []).reduce(
    (s, r) => s + (Number(r.result_r) || 0),
    0,
  );
  const todayClosedCount = closedToday?.length ?? 0;

  const openPositions = (openRows ?? []).map((r) => ({
    id: r.id as string,
    symbol: r.symbol as string,
    direction: r.direction as Direction,
    positionSize: (Number(r.entry) || 0) * (Number(r.position_quantity) || 0),
  }));

  const totalExposure = openPositions.reduce((s, p) => s + p.positionSize, 0);
  const openExposurePct = accountSize > 0 ? (totalExposure / accountSize) * 100 : 0;

  return {
    todayCumulativeR,
    todayClosedCount,
    openPositions,
    openExposurePct,
  };
}
