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

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params;
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: game } = await supabase
    .from("binary_games")
    .select("*")
    .eq("id", gameId)
    .eq("user_id", user.id)
    .single();

  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (game.status === "settled")
    return NextResponse.json({
      won: game.won,
      exitPrice: game.exit_price,
      entryPrice: game.entry_price,
      pnlPoints: game.pnl_points,
    });

  // 캔들이 아직 안 닫혔으면 거부
  if (Date.now() < Number(game.candle_close_time))
    return NextResponse.json(
      { error: "캔들이 아직 닫히지 않았습니다" },
      { status: 400 },
    );

  const timeframe = (game.timeframe ?? "1m") as Interval;
  const tfMs = (TF_SECONDS[timeframe] ?? 60) * 1000;
  const targetCloseTime = Number(game.candle_close_time);
  const targetOpenTime = targetCloseTime - tfMs;

  // ── 다음 캔들 시가→종가 방식 ──
  // 목표 캔들 = openTime === targetOpenTime 인 봉
  const candles = await fetchKlines(game.symbol as string, timeframe, 5);
  const targetCandle =
    candles.find(
      (c) => Math.abs(c.openTime - targetOpenTime) < 1000, // 1초 이내 매칭
    ) ?? candles[candles.length - 2];

  if (!targetCandle) {
    return NextResponse.json(
      { error: "캔들 데이터를 찾을 수 없습니다" },
      { status: 500 },
    );
  }

  const entryPrice = Number(targetCandle.open); // 캔들 시가
  const exitPrice = Number(targetCandle.close); // 캔들 종가
  const direction = game.direction as "call" | "put";
  const won =
    direction === "call" ? exitPrice > entryPrice : exitPrice < entryPrice;

  const betPoints = Number(game.bet_points);
  const pnlPoints = won ? Math.round(betPoints * 0.8) : -betPoints;

  // 포인트 업데이트
  const { data: wallet } = await supabase
    .from("game_wallets")
    .select("points, total_games, wins")
    .eq("user_id", user.id)
    .single();

  const newPoints =
    Number(wallet?.points ?? 0) + (won ? betPoints + pnlPoints : 0);
  await supabase
    .from("game_wallets")
    .update({
      points: newPoints,
      total_games: (wallet?.total_games ?? 0) + 1,
      wins: (wallet?.wins ?? 0) + (won ? 1 : 0),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  // 게임 기록 업데이트 (entry_price를 실제 캔들 시가로 덮어씀)
  await supabase
    .from("binary_games")
    .update({
      entry_price: entryPrice,
      exit_price: exitPrice,
      won,
      pnl_points: pnlPoints,
      status: "settled",
    })
    .eq("id", gameId);

  return NextResponse.json({
    won,
    entryPrice,
    exitPrice,
    pnlPoints,
    pointsTotal: newPoints,
  });
}
