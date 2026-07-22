import { getSupabaseServer } from "@/lib/supabase/server";
import { AnalyzeClient } from "./analyze-client";
import { AnalysisHistory } from "@/components/analyze/analysis-history";
import { HelpLink } from "@/components/app/help-link";
import { getMoneyContext } from "@/lib/money-management";
import { getEffectiveAccount } from "@/lib/account";
import { loadLatestRadar, type RadarSnapshot } from "@/lib/analysis/radar-persist";
import type { MoneyContext } from "@/types/trade";
import { getT } from "@/lib/i18n/server";

export const maxDuration = 60;

export default async function AnalyzePage() {
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

  // 활성 모드(실거래 배정액 / 가상 자금) 기준 유효 자금 — 앱 전체 단일 기준.
  const accountSize = user ? (await getEffectiveAccount()).accountSize : 10000;

  // grade 산정에 쓸 실제 자금 관리 컨텍스트 (오늘 누적 R, 진행 중 포지션, 노출 등).
  // 분석 페이지에서 미리 보여서 거래 평가 페이지와 등급이 일치하게 함.
  // 로그인 안 됐으면 empty context.
  const money: MoneyContext = user
    ? await getMoneyContext(accountSize).catch(() => ({
        todayCumulativeR: 0,
        todayClosedCount: 0,
        openPositions: [],
        openExposurePct: 0,
      }))
    : {
        todayCumulativeR: 0,
        todayClosedCount: 0,
        openPositions: [],
        openExposurePct: 0,
      };

  // 후보 레이더 — 최신 스캔 배치 (크론이 10분마다 채움). 로그인 사용자만.
  const radar: RadarSnapshot = user
    ? await loadLatestRadar().catch(() => ({ candidates: [], scannedAt: null }))
    : { candidates: [], scannedAt: null };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{t("analyze.pageh.title")}</h1>
            <HelpLink href="/app/guide/analyze" label={t("analyze.pageh.help")} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("analyze.pageh.intro")}
          </p>
          <p className="mt-2 inline-block rounded-md bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground">
            {t("analyze.pageh.steps")}
          </p>
        </div>
      </div>
      <AnalyzeClient
        accountSize={accountSize}
        riskPct={Number(profile?.default_risk_pct) || 1}
        currency={(profile?.account_currency as "USD" | "KRW") || "USD"}
        money={money}
        radar={radar}
        // 최근 분석 기록 — 우측 컬럼(분석 대상 아래) 빈 공간에 배치.
        // 서버 컴포넌트라 클라이언트에 직접 못 넣고 ReactNode로 전달.
        history={<AnalysisHistory limit={4} />}
      />
    </div>
  );
}
