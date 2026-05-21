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
  const candles = await fetchKlines(game.symbol as string, timeframe, 5);
  const targetCandle =
    candles.find(
      (c) => Math.abs(c.openTime - targetOpenTime) < 1000,
    ) ?? candles[candles.length - 2];

  if (!targetCandle) {
    return NextResponse.json(
      { error: "캔들 데이터를 찾을 수 없습니다" },
      { status: 500 },
    );
  }

  const entryPrice = Number(targetCandle.open);
  const exitPrice = Number(targetCandle.close);
  const direction = game.direction as "call" | "put";
  const won =
    direction === "call" ? exitPrice > entryPrice : exitPrice < entryPrice;

  const betPoints = Number(game.bet_points);
  const pnlPoints = won ? Math.round(betPoints * 0.8) : -betPoints;

  // vUSDT 정산: 승리 시 베팅액 + 수익만큼 paper_wallets에 입금 (SSOT)
  // 패배 시 이미 start 단계에서 차감됐으므로 추가 작업 없음
  const payoutAmount = won ? betPoints + pnlPoints : 0;
  let balanceTotal = 0;
  if (won && payoutAmount > 0) {
    try {
      balanceTotal = await creditBalance(user.id, payoutAmount, "game_payout", {
        game_id: gameId,
        won: true,
        bet_points: betPoints,
        pnl_points: pnlPoints,
      });
    } catch {
      // best-effort — 정산 로그 실패 무시
    }
  } else {
    // 패배 시에도 현재 잔액 조회
    const svc = getSupabaseService();
    const { data: pw } = await svc
      .from("paper_wallets")
      .select("usdt_balance")
      .eq("user_id", user.id)
      .maybeSingle();
    balanceTotal = Number(pw?.usdt_balance ?? 0);
  }

  // game_wallets 통계 업데이트 (total_games / wins — 통계만 유지)
  const svc = getSupabaseService();
  const { data: gw } = await svc
    .from("game_wallets")
    .select("total_games, wins")
    .eq("user_id", user.id)
    .maybeSingle();

  if (gw) {
    await svc
      .from("game_wallets")
      .update({
        total_games: (gw.total_games ?? 0) + 1,
        wins: (gw.wins ?? 0) + (won ? 1 : 0),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
  } else {
    await svc.from("game_wallets").insert({
      user_id: user.id,
      points: 0, // 더 이상 사용 안 함
      total_games: 1,
      wins: won ? 1 : 0,
    });
  }

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
    // 호환 목적 — 둘 다 반환
    pointsTotal: balanceTotal,
    balanceTotal,
  });
}
