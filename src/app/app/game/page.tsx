import { getSupabaseServer } from "@/lib/supabase/server";
import { GameClient } from "./game-client";

export default async function GamePage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initialPoints = 1000;
  if (user) {
    const { data: wallet } = await supabase
      .from("game_wallets")
      .select("points")
      .eq("user_id", user.id)
      .maybeSingle();
    if (wallet) {
      initialPoints = Number(wallet.points);
    } else {
      // 신규 유저: 지갑 생성
      await supabase
        .from("game_wallets")
        .insert({ user_id: user.id, points: 1000 });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">가격 예측 게임</h1>
        <p className="text-sm text-muted-foreground mt-1">
          다음 1분봉 종가를 예측하세요. 실제 바이낸스 시세 기반.
        </p>
      </div>
      <GameClient initialPoints={initialPoints} />
    </div>
  );
}
