import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { fetchKlines } from "@/lib/analysis/binance";
import type { Interval } from "@/lib/analysis/binance";

export const dynamic = "force-dynamic";

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

  let settledCount = 0;
  for (const game of pending) {
    try {
      const timeframe = (game.timeframe ?? "1m") as Interval;
      const candles = await fetchKlines(game.symbol as string, timeframe, 3);
      const settledCandle =
        candles.find(
          (c) =>
            c.openTime >= Number(game.candle_close_time) - 60_000 * 16 &&
            c.closeTime <= Number(game.candle_close_time) + 5_000,
        ) ?? candles[candles.length - 2];
      const exitPrice = Number(settledCandle?.close ?? candles[candles.length - 1].close);
      const entryPrice = Number(game.entry_price);
      const direction = game.direction as "call" | "put";
      const won = direction === "call" ? exitPrice > entryPrice : exitPrice < entryPrice;
      const betPoints = Number(game.bet_points);
      const pnlPoints = won ? Math.round(betPoints * 0.8) : -betPoints;

      // 게임 업데이트
      await supabase
        .from("binary_games")
        .update({ exit_price: exitPrice, won, pnl_points: pnlPoints, status: "settled" })
        .eq("id", game.id);

      // 지갑 업데이트
      const { data: wallet } = await supabase
        .from("game_wallets")
        .select("points, total_games, wins")
        .eq("user_id", user.id)
        .single();
      const refundPlus = won ? betPoints + pnlPoints : 0;
      await supabase
        .from("game_wallets")
        .update({
          points: Number(wallet?.points ?? 0) + refundPlus,
          total_games: (wallet?.total_games ?? 0) + 1,
          wins: (wallet?.wins ?? 0) + (won ? 1 : 0),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
      settledCount++;
    } catch {
      // 개별 게임 정산 실패 시 다음 게임 계속 처리
    }
  }

  return NextResponse.json({ settled: settledCount });
}
