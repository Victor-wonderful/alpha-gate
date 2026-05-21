import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { fetchKlines } from "@/lib/analysis/binance";
import type { Interval } from "@/lib/analysis/binance";

export const dynamic = "force-dynamic";

const VALID_TIMEFRAMES: Interval[] = ["1m", "5m", "15m"];

export async function POST(req: Request) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { symbol, direction, betPoints, timeframe = "1m" } = await req.json();
  if (!["BTCUSDT", "ETHUSDT", "SOLUSDT"].includes(symbol))
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  if (!["call", "put"].includes(direction))
    return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
  if (!VALID_TIMEFRAMES.includes(timeframe as Interval))
    return NextResponse.json({ error: "Invalid timeframe" }, { status: 400 });
  const bet = Number(betPoints);
  if (!bet || bet < 10)
    return NextResponse.json({ error: "Min bet 10pt" }, { status: 400 });

  // 게임 지갑 조회 또는 생성
  const { data: wallet } = await supabase
    .from("game_wallets")
    .select("points")
    .eq("user_id", user.id)
    .maybeSingle();

  const currentPoints = wallet ? Number(wallet.points) : 1000;
  if (!wallet) {
    await supabase.from("game_wallets").insert({ user_id: user.id, points: 1000 });
  }
  if (currentPoints < bet)
    return NextResponse.json({ error: "포인트 부족" }, { status: 400 });

  // 선택된 타임프레임 캔들 조회
  const candles = await fetchKlines(symbol, timeframe as Interval, 2);
  const currentCandle = candles[candles.length - 1];
  const entryPrice = Number(currentCandle.close);
  const candleCloseTime = currentCandle.closeTime;
  const expirySeconds = Math.max(0, Math.round((candleCloseTime - Date.now()) / 1000));

  // 포인트 차감
  await supabase
    .from("game_wallets")
    .update({ points: currentPoints - bet, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  // 게임 기록 생성
  const { data: game } = await supabase
    .from("binary_games")
    .insert({
      user_id: user.id,
      symbol,
      direction,
      bet_points: bet,
      entry_price: entryPrice,
      candle_close_time: candleCloseTime,
      timeframe,
    })
    .select("id")
    .single();

  return NextResponse.json({
    gameId: game?.id,
    entryPrice,
    candleCloseTime,
    timeframe,
    expirySeconds,
    pointsRemaining: currentPoints - bet,
  });
}
