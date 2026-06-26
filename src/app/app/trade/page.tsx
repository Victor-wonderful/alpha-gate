import { TradeForm } from "@/components/trade/trade-form";
import { getSupabaseServer } from "@/lib/supabase/server";
import { FlowStepper } from "@/components/app/flow-stepper";
import { getOrCreateWallet } from "@/lib/paper-wallet";
import { getMoneyContext } from "@/lib/money-management";
import { getT } from "@/lib/i18n/server";

export default async function TradePage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string; accountSize?: string; riskPct?: string }>;
}) {
  const t = await getT();
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

  const sp = await searchParams;
  // URL override > profile default. Guards against junk input.
  const urlAccountSize = sp.accountSize ? Number(sp.accountSize) : NaN;
  const urlRiskPct = sp.riskPct ? Number(sp.riskPct) : NaN;
  const accountSize =
    Number.isFinite(urlAccountSize) && urlAccountSize > 0
      ? urlAccountSize
      : Number(profile?.default_account_size) || 10000;
  const riskPct =
    Number.isFinite(urlRiskPct) && urlRiskPct > 0 && urlRiskPct <= 10
      ? urlRiskPct
      : Number(profile?.default_risk_pct) || 1;
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
    nickname: (k.nickname as string | null) ?? t("trade.page.noName"),
    apiKeyMasked: k.api_key_masked as string,
    canTrade: Boolean((k.permissions as { canTrade?: boolean } | null)?.canTrade),
  }));

  const wallet = user
    ? await getOrCreateWallet(user.id)
    : { usdtBalance: 0, available: 0, usedMargin: 0, startingBalance: 10000 };

  const money = await getMoneyContext(accountSize);

  return (
    <div className="space-y-6">
      <FlowStepper current="trade" />
      <TradeForm
        initialAccountSize={accountSize}
        initialRiskPct={riskPct}
        currency={(profile?.account_currency as "USD" | "KRW") || "USD"}
        initialSymbol={symbol}
        money={money}
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
