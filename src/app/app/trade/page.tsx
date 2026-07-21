import { TradeForm } from "@/components/trade/trade-form";
import { AutoTradePanel } from "@/components/trade/auto-trade-panel";
import { getAutoConfig, getAutoStatus } from "./auto-actions";
import { DcaClient } from "@/app/app/dca/dca-client";
import { loadDcaPlansAction, loadDcaAssessmentAction } from "@/app/app/dca/_actions";
import { dcaCandidateSymbols } from "@/lib/dca/asset-gate";
import { Card, CardContent } from "@/components/ui/card";
import { PiggyBank } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { FlowStepper } from "@/components/app/flow-stepper";
import { getOrCreateWallet } from "@/lib/paper-wallet";
import { getMoneyContext } from "@/lib/money-management";
import { getEffectiveAccount } from "@/lib/account";
import { getT } from "@/lib/i18n/server";

export default async function TradePage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string; accountSize?: string; riskPct?: string; entry?: string }>;
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
  // URL override > 활성 모드 유효 자금(실거래 배정/가상). Guards against junk input.
  const urlAccountSize = sp.accountSize ? Number(sp.accountSize) : NaN;
  const urlRiskPct = sp.riskPct ? Number(sp.riskPct) : NaN;
  const effectiveSize = user ? (await getEffectiveAccount()).accountSize : 10000;
  const accountSize =
    Number.isFinite(urlAccountSize) && urlAccountSize > 0
      ? urlAccountSize
      : effectiveSize;
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

  const manual = (
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
  );

  // AI 분석에서 시나리오를 들고 넘어온 경우(entry 파라미터) → 그 거래를 평가·발주하는
  // 수동 화면을 그대로 보여준다. (수동 실행은 사이드바 메뉴에선 뺐지만, 분석 흐름에선 유지)
  if (sp.entry) {
    return (
      <div className="space-y-6">
        <FlowStepper current="trade" />
        {manual}
      </div>
    );
  }

  // 직접 진입 → [자동매매(봇) | 적립] 탭. (구 "수동 실행" 탭은 제거, 적립 메뉴를 여기로 합침)
  if (!user) {
    return <div className="space-y-6">{manual}</div>;
  }

  const [autoConfig, autoStatus] = await Promise.all([getAutoConfig(), getAutoStatus()]);

  // 적립(DCA) 데이터 — 구 /app/dca 페이지가 하던 로딩을 그대로.
  const { plans } = await loadDcaPlansAction();
  const dcaSymbols = [...new Set(plans.map((p) => p.symbol))];
  const dcaEntries = await Promise.all(
    dcaSymbols.map(async (s) => [s, (await loadDcaAssessmentAction(s)).valueZone] as const),
  );
  const zoneBySymbol = Object.fromEntries(dcaEntries.filter(([, v]) => v?.ok));

  const dca = (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center gap-2.5 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
            <PiggyBank className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold">{t("dca.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("dca.subtitle")}</p>
          </div>
        </CardContent>
      </Card>
      <DcaClient symbols={dcaCandidateSymbols()} initialPlans={plans} zoneBySymbol={zoneBySymbol} stacked />
    </div>
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section>
        <AutoTradePanel initialConfig={autoConfig} status={autoStatus} accountSize={accountSize} />
      </section>
      <section>{dca}</section>
    </div>
  );
}
