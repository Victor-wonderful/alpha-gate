import { getSupabaseServer } from "@/lib/supabase/server";
import { AnalyzeClient } from "./analyze-client";
import { AnalysisHistory } from "@/components/analyze/analysis-history";
import { FlowStepper } from "@/components/app/flow-stepper";
import { HelpLink } from "@/components/app/help-link";

export const maxDuration = 60;

export default async function AnalyzePage() {
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
      <FlowStepper current="analyze" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">AI 시장 분석</h1>
            <HelpLink href="/app/guide/analyze" label="도움말" />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Binance USDT-M 선물 시장의 멀티 TF 구조, 유동성, 체결 흐름, 펀딩 편향을 종합 분석합니다.
            시나리오마다 매매 등급과 권장 포지션이 자동 계산됩니다.
          </p>
        </div>
      </div>
      <AnalyzeClient
        accountSize={Number(profile?.default_account_size) || 10000}
        riskPct={Number(profile?.default_risk_pct) || 1}
        currency={(profile?.account_currency as "USD" | "KRW") || "USD"}
      />
      <AnalysisHistory />
    </div>
  );
}
