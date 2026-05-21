import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { fetchKlines } from "@/lib/analysis/binance";
import type { Interval } from "@/lib/analysis/binance";

export const dynamic = "force-dynamic";

const VALID_TIMEFRAMES: Interval[] = ["1m", "3m"];

const TF_SECONDS: Record<string, number> = {
  "1m": 60,
  "3m": 180,
};

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

  // ── 다음 캔들 시가→종가 판정 방식 ──
  // 현재 진행 중인 캔들이 닫힐 때 = 다음 캔들이 시작될 때
  // 진입가는 다음 캔들의 시가(open), 종가는 같은 캔들의 종가(close)
  const candles = await fetchKlines(symbol, timeframe as Interval, 2);
  const currentCandle = candles[candles.length - 1];
  const tfMs = TF_SECONDS[timeframe] * 1000;
  const targetOpenTime = currentCandle.closeTime; // 다음 캔들 시작 시각
  const targetCloseTime = targetOpenTime + tfMs; // 다음 캔들 종료 시각

  // 현재 시세를 임시 진입가로 저장 (정산 시 실제 캔들 시가로 덮어씀)
  const placeholderPrice = Number(currentCandle.close);

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
      entry_price: placeholderPrice, // 정산 시 실제 시가로 업데이트
      candle_close_time: targetCloseTime,
      timeframe,
    })
    .select("id")
    .single();

  const expirySeconds = Math.max(0, Math.round((targetCloseTime - Date.now()) / 1000));

  return NextResponse.json({
    gameId: game?.id,
    entryPrice: placeholderPrice,
    candleOpenTime: targetOpenTime,
    candleCloseTime: targetCloseTime,
    timeframe,
    expirySeconds,
    pointsRemaining: currentPoints - bet,
  });
}
