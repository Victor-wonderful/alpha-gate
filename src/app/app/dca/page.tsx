import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { dcaCandidateSymbols } from "@/lib/dca/asset-gate";
import { loadDcaAssessmentAction, loadDcaPlansAction } from "./_actions";
import { DcaClient } from "./dca-client";

export const dynamic = "force-dynamic";

export default async function DcaPage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = await getT();
  const { plans } = await loadDcaPlansAction();

  // 플랜은 자기 자산의 가격 판단을 스스로 들고 있어야 한다. 화면에서 다른 자산을
  // 보고 있다는 이유로 "지금 사도 되는지"를 못 보여주면 플랜 목록이 무의미하다.
  const symbols = [...new Set(plans.map((p) => p.symbol))];
  const entries = await Promise.all(
    symbols.map(async (s) => [s, (await loadDcaAssessmentAction(s)).valueZone] as const),
  );
  const zoneBySymbol = Object.fromEntries(entries.filter(([, v]) => v?.ok));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{t("dca.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("dca.subtitle")}</p>
      </div>
      <DcaClient symbols={dcaCandidateSymbols()} initialPlans={plans} zoneBySymbol={zoneBySymbol} />
    </div>
  );
}
