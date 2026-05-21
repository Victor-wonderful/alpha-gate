import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { fetchKlines } from "@/lib/analysis/binance";
import type { Interval } from "@/lib/analysis/binance";
import { getSupabaseService } from "@/lib/supabase/service";
import { creditBalance } from "@/lib/paper-wallet";

export const dynamic = "force-dynamic";

const TF_SECONDS: Record<string, number> = {
  "1m": 60,
  "3m": 180,
};

export async function POST() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = Date.now();
  const { data: pending } = await supabase
    .from("binary_games")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .lte("candle_close_time", now);

  if (!pending || pending.length === 0) {
    return NextResponse.json({ settled: 0 });
  }

  const svc = getSupabaseService();

  // game_wallets 통계 조회 (총 승수 누적용)
  const { data: gw } = await svc
    .from("game_wallets")
    .select("total_games, wins")
    .eq("user_id", user.id)
    .maybeSingle();

  let settledCount = 0;
  let totalGamesIncrement = 0;
  let winsIncrement = 0;

  for (const game of pending) {
    try {
      const timeframe = (game.timeframe ?? "1m") as Interval;
      const tfMs = (TF_SECONDS[timeframe] ?? 60) * 1000;
      const targetCloseTime = Number(game.candle_close_time);
      const targetOpenTime = targetCloseTime - tfMs;

      const candles = await fetchKlines(game.symbol as string, timeframe, 5);
      const targetCandle =
        candles.find((c) => Math.abs(c.openTime - targetOpenTime) < 1000) ??
        candles[candles.length - 2];

      if (!targetCandle) continue;

      const entryPrice = Number(targetCandle.open);
      const exitPrice = Number(targetCandle.close);
      const direction = game.direction as "call" | "put";
      const won =
        direction === "call" ? exitPrice > entryPrice : exitPrice < entryPrice;
      const betPoints = Number(game.bet_points);
      const pnlPoints = won ? Math.round(betPoints * 0.8) : -betPoints;

      // 게임 기록 settled 처리
      await supabase
        .from("binary_games")
        .update({
          entry_price: entryPrice,
          exit_price: exitPrice,
          won,
          pnl_points: pnlPoints,
          status: "settled",
        })
        .eq("id", game.id);

      // vUSDT 정산: 승리 시 paper_wallets에 입금 (SSOT)
      const payoutAmount = won ? betPoints + pnlPoints : 0;
      if (won && payoutAmount > 0) {
        try {
          await creditBalance(user.id, payoutAmount, "game_payout", {
            game_id: game.id as string,
            won: true,
            bet_points: betPoints,
            pnl_points: pnlPoints,
          });
        } catch {
          // best-effort
        }
      }

      totalGamesIncrement++;
      if (won) winsIncrement++;
      settledCount++;
    } catch {
      // 개별 실패 무시
    }
  }

  // game_wallets 통계 일괄 업데이트 (통계만 — points는 0 유지)
  if (totalGamesIncrement > 0) {
    if (gw) {
      await svc
        .from("game_wallets")
        .update({
          total_games: (gw.total_games ?? 0) + totalGamesIncrement,
          wins: (gw.wins ?? 0) + winsIncrement,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    } else {
      await svc.from("game_wallets").insert({
        user_id: user.id,
        points: 0, // 더 이상 사용 안 함
        total_games: totalGamesIncrement,
        wins: winsIncrement,
      });
    }
  }

  return NextResponse.json({ settled: settledCount });
}
