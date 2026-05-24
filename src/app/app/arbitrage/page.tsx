import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getOrCreateWallet } from "@/lib/paper-wallet";
import { ClusterTabs } from "@/components/app/cluster-tabs";
import { clusters } from "@/components/app/cluster-tabs-config";
import { HelpLink } from "@/components/app/help-link";
import { scanKimchi, fetchCurrentPremiums } from "@/lib/arbitrage/scan";
import { ArbitrageUI } from "./arbitrage-ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "차익거래 · Alpha Gate",
};

export default async function ArbitragePage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/arbitrage");

  const [wallet, kimchi, currentPremiums, openRes, closedRes] = await Promise.all([
    getOrCreateWallet(user.id).catch(() => null),
    scanKimchi(),
    fetchCurrentPremiums(),
    supabase
      .from("arbitrage_positions")
      .select(
        "id, kind, symbol, notional_usd, long_exchange, long_entry_price, long_qty, short_exchange, short_entry_price, short_qty, entry_premium_pct, target_premium_pct, expires_at, created_at",
      )
      .eq("user_id", user.id)
      .eq("kind", "kimchi")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    supabase
      .from("arbitrage_positions")
      .select(
        "id, kind, symbol, notional_usd, long_exchange, short_exchange, entry_premium_pct, target_premium_pct, long_entry_price, short_entry_price, long_exit_price, short_exit_price, realized_pnl, close_reason, created_at, closed_at",
      )
      .eq("user_id", user.id)
      .eq("kind", "kimchi")
      .in("status", ["closed", "expired"])
      .order("closed_at", { ascending: false })
      .limit(50),
  ]);

  const premiumMap: Record<string, number> = {};
  for (const [k, v] of currentPremiums) premiumMap[k] = v;

  const cluster = clusters.trading({ rightSlot: <HelpLink href="/app/guide" /> });

  return (
    <div className="space-y-5">
      <ClusterTabs
        title={cluster.title}
        description="김치 프리미엄 차익거래 — 김프 0 근처 진입, 목표값 도달 시 양쪽 청산."
        tabs={cluster.tabs}
        rightSlot={cluster.rightSlot}
      />

      <ArbitrageUI
        wallet={
          wallet
            ? {
                usdtBalance: wallet.usdtBalance,
                available: wallet.available,
                usedMargin: wallet.usedMargin,
              }
            : null
        }
        kimchi={kimchi}
        currentPremiums={premiumMap}
        openPositions={openRes.data ?? []}
        closedPositions={closedRes.data ?? []}
      />
    </div>
  );
}
