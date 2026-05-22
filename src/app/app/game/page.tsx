import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseService } from "@/lib/supabase/service";
import { getOrCreateWallet } from "@/lib/paper-wallet";
import { GameClient } from "./game-client";
import { ClusterTabs } from "@/components/app/cluster-tabs";
import { clusters } from "@/components/app/cluster-tabs-config";
import { HelpLink } from "@/components/app/help-link";

export default async function GamePage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // vUSDT 잔액은 paper_wallets에서 조회 (SSOT)
  let initialPoints = 1000;
  let totalGames = 0;
  let wins = 0;

  if (user) {
    // vUSDT 잔액 조회 (paper_wallets — SSOT)
    const wallet = await getOrCreateWallet(user.id);
    initialPoints = wallet.available; // 가용 잔액 (마진 제외)

    // 게임 통계는 game_wallets에서만 조회 (points는 무시)
    const svc = getSupabaseService();
    const { data: gw } = await svc
      .from("game_wallets")
      .select("total_games, wins")
      .eq("user_id", user.id)
      .maybeSingle();

    if (gw) {
      totalGames = Number(gw.total_games ?? 0);
      wins = Number(gw.wins ?? 0);
    }
    // game_wallets가 없어도 통계는 0으로 시작 (생성은 settle 시 수행)
  }

  const cluster = clusters.trading({
    rightSlot: <HelpLink href="/app/guide/game" />,
  });
  return (
    <div className="space-y-4">
      <ClusterTabs
        title={cluster.title}
        description={cluster.description}
        tabs={cluster.tabs}
        rightSlot={cluster.rightSlot}
      />
      <GameClient
        initialPoints={initialPoints}
        totalGames={totalGames}
        wins={wins}
      />
    </div>
  );
}
