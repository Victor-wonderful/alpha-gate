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

  if (user) {
    const { data: wallet } = await supabase
      .from("game_wallets")
      .select("points, total_games, wins")
      .eq("user_id", user.id)
      .maybeSingle();

    if (wallet) {
      initialPoints = Number(wallet.points);
      totalGames = Number(
        (wallet as { points: number; total_games: number; wins: number })
          .total_games ?? 0,
      );
      wins = Number(
        (wallet as { points: number; total_games: number; wins: number })
          .wins ?? 0,
      );
    } else {
      await supabase
        .from("game_wallets")
        .insert({ user_id: user.id, points: 1000 });
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">가격 예측 게임</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          다음 캔들 시가→종가 방향 예측 · 1분/3분 · 바이낸스 선물 시세
        </p>
      </div>
      <GameClient
        initialPoints={initialPoints}
        totalGames={totalGames}
        wins={wins}
      />
    </div>
  );
}
