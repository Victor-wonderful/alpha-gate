import Link from "next/link";
import { Settings } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getOrCreateWallet } from "@/lib/paper-wallet";
import { ExchangeUI } from "./exchange-ui";
import { ClusterTabs } from "@/components/app/cluster-tabs";
import { clusters } from "@/components/app/cluster-tabs-config";
import { HelpLink } from "@/components/app/help-link";
import { ExpiryBanner } from "@/components/trade/expiry-banner";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function VirtualTradePage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string }>;
}) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const wallet = await getOrCreateWallet(user.id);
  const sp = await searchParams;
  const symbol =
    sp.symbol && /^[A-Z0-9]{2,15}USDT$/i.test(sp.symbol) ? sp.symbol.toUpperCase() : "BTCUSDT";

  // Open paper positions
  const { data: openTrades } = await supabase
    .from("trades")
    .select(
      "id, symbol, direction, entry, entry_actual, stop, target, position_quantity, paper_margin, fees_pct, context_flags, created_at, timeframe, extended_until, market_type",
    )
    .eq("user_id", user.id)
    .eq("is_paper", true)
    .is("closed_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const positions = (openTrades ?? [])
    .filter((t) => {
      // pending 지정가 주문은 포지션 탭에서 제외 (주문 탭에 따로 표시)
      const status = (t as { order_status?: string }).order_status;
      return status !== "pending";
    })
    .map((t) => {
      const ctx = (t.context_flags ?? {}) as { leverage?: number };
      return {
        id: t.id as string,
        symbol: t.symbol as string,
        direction: t.direction as "long" | "short",
        entryActual: Number(t.entry_actual ?? t.entry),
        qty: Number(t.position_quantity ?? 0),
        margin: Number(t.paper_margin ?? 0),
        stop: Number(t.stop),
        target: Number(t.target),
        leverage: Number(ctx.leverage ?? 1),
        feesPct: Number(t.fees_pct ?? 0.12),
        createdAt: t.created_at as string,
        timeframe: t.timeframe as string,
        extendedUntil: (t.extended_until as string | null) ?? null,
        marketType: ((t.market_type as string | null) ?? "futures") as
          | "futures"
          | "spot",
      };
    });

  // 미체결 지정가 주문 조회
  const { data: openOrders } = await supabase
    .from("pending_limit_orders")
    .select("id, symbol, direction, limit_price, quantity, leverage, stop, target, expires_at, created_at")
    .eq("user_id", user.id)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50);

  const pendingOrders = (openOrders ?? []).map((o) => ({
    id: o.id as string,
    symbol: o.symbol as string,
    direction: o.direction as "long" | "short",
    limitPrice: Number(o.limit_price),
    quantity: Number(o.quantity),
    leverage: Number(o.leverage),
    stop: o.stop != null ? Number(o.stop) : null,
    target: o.target != null ? Number(o.target) : null,
    expiresAt: o.expires_at as string,
    createdAt: o.created_at as string,
  }));

  const cluster = clusters.trading({
    rightSlot: (
      <div className="flex items-center gap-2">
        <HelpLink href="/app/guide/trading" />
        <Link
          href="/app/virtual-trade/wallet"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-3.5 w-3.5" />
          지갑 관리
        </Link>
      </div>
    ),
  });
  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <ExpiryBanner />
      </Suspense>
      <ClusterTabs title={cluster.title} description={cluster.description} tabs={cluster.tabs} rightSlot={cluster.rightSlot} />

      <ExchangeUI
        initialSymbol={symbol}
        wallet={{
          usdtBalance: wallet.usdtBalance,
          available: wallet.available,
          usedMargin: wallet.usedMargin,
          startingBalance: wallet.startingBalance,
        }}
        positions={positions}
        pendingOrders={pendingOrders}
      />
    </div>
  );
}
