import { TradeForm } from "@/components/trade/trade-form";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getMoneyContext } from "@/lib/money-management";

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

  // Market context는 클라이언트에서 심볼 변경 시 다시 갱신될 수 있도록
  // 초기값만 서버에서 fetch. (form 안에서 심볼이 바뀌면 그 시점엔 stale이지만,
  // 펀딩비/BTC는 분 단위로만 의미 있어 페이지 진입 시점 스냅샷으로 충분.)
  const [money] = await Promise.all([getMoneyContext(accountSize)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">거래 평가</h1>
        <p className="text-sm text-muted-foreground">
          진입 전에 이 거래를 해도 되는지 점검하고, 등급과 권장 포지션을 확인하세요.
        </p>
      </div>
      <TradeForm
        initialAccountSize={accountSize}
        initialRiskPct={Number(profile?.default_risk_pct) || 1}
        currency={(profile?.account_currency as "USD" | "KRW") || "USD"}
        initialSymbol={symbol}
        money={money}
      />
    </div>
  );
}
