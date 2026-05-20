import Link from "next/link";
import { Settings } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getOrCreateWallet } from "@/lib/paper-wallet";
import { ExchangeUI } from "./exchange-ui";

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
      "id, symbol, direction, entry, entry_actual, stop, target, position_quantity, paper_margin, fees_pct, context_flags, created_at",
    )
    .eq("user_id", user.id)
    .eq("is_paper", true)
    .is("closed_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const positions = (openTrades ?? []).map((t) => {
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
    };
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">가상 트레이딩</h1>
          <p className="text-xs text-muted-foreground">
            Binance Futures USDT-M 시뮬레이션 — 실거래 체험용. AI 분석 → 주문 검토와 같은 거래가 여기서 진행됩니다.
          </p>
        </div>
        <Link
          href="/app/virtual-trade/wallet"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-3.5 w-3.5" />
          지갑 관리
        </Link>
      </div>

      <ExchangeUI
        initialSymbol={symbol}
        wallet={{
          usdtBalance: wallet.usdtBalance,
          available: wallet.available,
          usedMargin: wallet.usedMargin,
          startingBalance: wallet.startingBalance,
        }}
        positions={positions}
      />
    </div>
  );
}
