import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { fetchKlines } from "@/lib/analysis/binance";
import type { Interval } from "@/lib/analysis/binance";
import { getOrCreateWallet, debitBalance } from "@/lib/paper-wallet";

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

  // vUSDT 지갑 조회 (paper_wallets가 SSOT)
  const wallet = await getOrCreateWallet(user.id);
  if (wallet.available < bet) {
    return NextResponse.json({ error: "포인트 부족" }, { status: 400 });
  }

  // ── 다음 캔들 시가→종가 판정 방식 ──
  // 주의: Binance closeTime = openTime + tfMs - 1 (이번 캔들 마지막 ms)
  // 다음 캔들의 openTime = 이번 캔들 openTime + tfMs (정확히 정시 경계)
  const candles = await fetchKlines(symbol, timeframe as Interval, 2);
  const currentCandle = candles[candles.length - 1];
  const tfMs = TF_SECONDS[timeframe] * 1000;
  const targetOpenTime = currentCandle.openTime + tfMs;  // 다음 캔들 시작 시각 (정확)
  const targetCloseTime = targetOpenTime + tfMs;          // 다음 캔들 끝 시각

  const placeholderPrice = Number(currentCandle.close);

  // vUSDT 차감 (paper_wallets.usdt_balance — SSOT)
  let balanceAfter: number;
  try {
    balanceAfter = await debitBalance(user.id, bet, "game_bet", {
      symbol,
      timeframe,
      placeholder_price: placeholderPrice,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "차감 실패" },
      { status: 400 },
    );
  }

  // 게임 기록 생성
  const { data: game } = await supabase
    .from("binary_games")
    .insert({
      user_id: user.id,
      symbol,
      direction,
      bet_points: bet,
      entry_price: placeholderPrice,
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
    // 호환 목적 — 둘 다 반환
    pointsRemaining: balanceAfter,
    balanceRemaining: balanceAfter,
  });
}
