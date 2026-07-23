import { AutoTradePanel } from "@/components/trade/auto-trade-panel";
import { getAutoConfig, getAutoStatus } from "./auto-actions";
import { DcaClient } from "@/app/app/dca/dca-client";
import { loadDcaPlansAction, loadDcaAssessmentAction } from "@/app/app/dca/_actions";
import { dcaCandidateSymbols } from "@/lib/dca/asset-gate";
import { Card, CardContent } from "@/components/ui/card";
import { PiggyBank } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getEffectiveAccount } from "@/lib/account";
import { getT } from "@/lib/i18n/server";

/**
 * 자동매매 — 봇(자동 발주) + 적립(DCA). 사이드바 "자동매매" 메뉴.
 * (AI 리서치에서 시나리오를 들고 오는 수동 "거래 실행" 평가 화면은 /app/execute 로 분리됨.)
 */
export default async function TradePage() {
  const t = await getT();
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /app/* 는 미들웨어로 인증 보호됨 — user 는 항상 존재.
  if (!user) return null;

  // 봉투 모델: eff.total = 전체, eff.botAlloc = 봇 몫.
  const eff = await getEffectiveAccount();

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
        <AutoTradePanel
          initialConfig={autoConfig}
          status={autoStatus}
          total={eff?.total ?? 10000}
          botAlloc={eff?.botAlloc ?? 0}
        />
      </section>
      <section>{dca}</section>
    </div>
  );
}
