import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { fetchKlines } from "@/lib/analysis/binance";
import type { Interval } from "@/lib/analysis/binance";

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

  let settledCount = 0;
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
      // 개별 실패 무시
    }
  }

  return NextResponse.json({ settled: settledCount });
}
