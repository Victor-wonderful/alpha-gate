import { getSupabaseServer } from "@/lib/supabase/server";
import { GameClient } from "./game-client";

export default async function GamePage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initialPoints = 1000;
  let totalGames = 0;
  let wins = 0;
  let recentGames: Array<{
    won: boolean;
    pnl_points: number;
    symbol: string;
    direction: string;
  }> = [];

  if (user) {
    const { data: wallet } = await supabase
      .from("game_wallets")
      .select("points, total_games, wins")
      .eq("user_id", user.id)
      .maybeSingle();

    if (wallet) {
      initialPoints = Number(wallet.points);
      totalGames = (wallet as { points: number; total_games: number; wins: number }).total_games ?? 0;
      wins = (wallet as { points: number; total_games: number; wins: number }).wins ?? 0;
    } else {
      await supabase.from("game_wallets").insert({ user_id: user.id, points: 1000 });
    }

    const { data: recent } = await supabase
      .from("binary_games")
      .select("won, pnl_points, symbol, direction")
      .eq("user_id", user.id)
      .eq("status", "settled")
      .order("created_at", { ascending: false })
      .limit(10);

    recentGames = (recent ?? []) as typeof recentGames;
  }

  // 연승 계산
  let currentStreak = 0;
  for (const g of recentGames) {
    if (g.won) currentStreak++;
    else break;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">가격 예측 게임</h1>
        <p className="text-sm text-muted-foreground mt-1">
          다음 1분봉 종가를 예측하세요 · 실제 바이낸스 선물 시세 기반
        </p>
      </div>
      <GameClient
        initialPoints={initialPoints}
        totalGames={totalGames}
        wins={wins}
        recentGames={recentGames}
        currentStreak={currentStreak}
      />
    </div>
  );
}
