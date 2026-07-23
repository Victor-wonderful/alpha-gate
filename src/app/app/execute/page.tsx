import { TradeForm } from "@/components/trade/trade-form";
import { getSupabaseServer } from "@/lib/supabase/server";
import { FlowStepper } from "@/components/app/flow-stepper";
import { getOrCreateWallet } from "@/lib/paper-wallet";
import { getMoneyContext } from "@/lib/money-management";
import { getEffectiveAccount } from "@/lib/account";
import { getT } from "@/lib/i18n/server";

/**
 * 거래 실행 — AI 리서치의 시나리오를 들고 넘어와 "이 거래 해도 되나"를 평가·발주하는 화면.
 * 진입/손절/목표 등 프리필은 URL 파라미터로 넘어오고 TradeForm이 클라이언트에서 읽는다.
 * (자동매매 봇은 /app/trade 로 분리 — 이 페이지와 별개.)
 */
export default async function TradeExecutePage({
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
  // 봉투 모델: eff.accountSize = 수동 몫(전체 − 봇 배정).
  const eff = user ? await getEffectiveAccount() : null;
  const effectiveSize = eff?.accountSize ?? 10000;
  const accountSize =
    Number.isFinite(urlAccountSize) && urlAccountSize > 0 ? urlAccountSize : effectiveSize;
  const riskPct =
    Number.isFinite(urlRiskPct) && urlRiskPct > 0 && urlRiskPct <= 10
      ? urlRiskPct
      : Number(profile?.default_risk_pct) || 1;
  const symbol = sp.symbol && /^[A-Z0-9]{2,15}USDT$/i.test(sp.symbol)
    ? sp.symbol.toUpperCase()
    : "BTCUSDT";

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
