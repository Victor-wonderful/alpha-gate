import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getOrCreateWallet } from "@/lib/paper-wallet";
import { ClusterTabs } from "@/components/app/cluster-tabs";
import { clusters } from "@/components/app/cluster-tabs-config";
import { HelpLink } from "@/components/app/help-link";
import { scanKimchi, scanFunding } from "@/lib/arbitrage/scan";
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

  const [wallet, kimchi, funding, openRes, closedRes] = await Promise.all([
    getOrCreateWallet(user.id).catch(() => null),
    scanKimchi(),
    scanFunding(),
    supabase
      .from("arbitrage_positions")
      .select(
        "id, kind, symbol, notional_usd, long_exchange, long_entry_price, long_qty, short_exchange, short_entry_price, short_qty, entry_premium_pct, entry_funding_pct, accrued_funding, expires_at, created_at",
      )
      .eq("user_id", user.id)
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    supabase
      .from("arbitrage_positions")
      .select(
        "id, kind, symbol, notional_usd, long_exchange, short_exchange, entry_premium_pct, entry_funding_pct, long_entry_price, short_entry_price, long_exit_price, short_exit_price, realized_pnl, close_reason, created_at, closed_at",
      )
      .eq("user_id", user.id)
      .in("status", ["closed", "expired"])
      .order("closed_at", { ascending: false })
      .limit(50),
  ]);

  const cluster = clusters.trading({ rightSlot: <HelpLink href="/app/guide" /> });

  return (
    <div className="space-y-5">
      <ClusterTabs
        title={cluster.title}
        description="시장 간 가격 차이(김프) · 시간 가치(펀딩비)를 활용한 무방향 차익거래. 양쪽 다리를 동시에 진입/청산합니다."
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
        funding={funding}
        openPositions={openRes.data ?? []}
        closedPositions={closedRes.data ?? []}
      />
    </div>
  );
}
