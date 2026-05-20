import { TradeForm } from "@/components/trade/trade-form";
import { getSupabaseServer } from "@/lib/supabase/server";
import { FlowStepper } from "@/components/app/flow-stepper";
import { getOrCreateWallet } from "@/lib/paper-wallet";
import type { MoneyContext } from "@/types/trade";

const EMPTY_MONEY: MoneyContext = {
  todayCumulativeR: 0,
  todayClosedCount: 0,
  openPositions: [],
  openExposurePct: 0,
};

export default async function TradePage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string }>;
}) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("default_account_size, default_risk_pct, account_currency")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const accountSize = Number(profile?.default_account_size) || 10000;
  const sp = await searchParams;
  const symbol = (sp.symbol && /^[A-Z0-9]{2,15}USDT$/i.test(sp.symbol)
    ? sp.symbol.toUpperCase()
    : "BTCUSDT");

  // Fetch valid (verified) exchange API keys for live trading dropdown.
  const { data: apiKeysRaw } = user
    ? await supabase
        .from("exchange_api_keys")
        .select("id, exchange, nickname, api_key_masked, verification_status, permissions")
        .eq("user_id", user.id)
        .eq("verification_status", "valid")
        .order("created_at", { ascending: false })
    : { data: null };
  const apiKeys = (apiKeysRaw ?? []).map((k) => ({
    id: k.id as string,
    exchange: k.exchange as "binance" | "upbit",
    nickname: (k.nickname as string | null) ?? "(이름 없음)",
    apiKeyMasked: k.api_key_masked as string,
    canTrade: Boolean((k.permissions as { canTrade?: boolean } | null)?.canTrade),
  }));

  const wallet = user
    ? await getOrCreateWallet(user.id)
    : { usdtBalance: 0, available: 0, usedMargin: 0, startingBalance: 10000 };

  return (
    <div className="space-y-6">
      <FlowStepper current="trade" />
      <TradeForm
        initialAccountSize={accountSize}
        initialRiskPct={Number(profile?.default_risk_pct) || 1}
        currency={(profile?.account_currency as "USD" | "KRW") || "USD"}
        initialSymbol={symbol}
        money={EMPTY_MONEY}
        apiKeys={apiKeys}
        paperWallet={{
          balance: wallet.usdtBalance,
          available: wallet.available,
          usedMargin: wallet.usedMargin,
        }}
      />
    </div>
  );
}
