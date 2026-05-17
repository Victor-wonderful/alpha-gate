import { TradeForm } from "@/components/trade/trade-form";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function TradePage() {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">거래 평가</h1>
        <p className="text-sm text-muted-foreground">
          진입 전에 이 거래를 해도 되는지 점검하고, 등급과 권장 포지션을 확인하세요.
        </p>
      </div>
      <TradeForm
        initialAccountSize={Number(profile?.default_account_size) || 10000}
        initialRiskPct={Number(profile?.default_risk_pct) || 1}
        currency={(profile?.account_currency as "USD" | "KRW") || "USD"}
      />
    </div>
  );
}
