import { TradeForm } from "@/components/trade/trade-form";
import { getSupabaseServer } from "@/lib/supabase/server";
import { FlowStepper } from "@/components/app/flow-stepper";
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

  return (
    <div className="space-y-6">
      <FlowStepper current="trade" />
      <TradeForm
        initialAccountSize={accountSize}
        initialRiskPct={Number(profile?.default_risk_pct) || 1}
        currency={(profile?.account_currency as "USD" | "KRW") || "USD"}
        initialSymbol={symbol}
        money={EMPTY_MONEY}
      />
    </div>
  );
}
