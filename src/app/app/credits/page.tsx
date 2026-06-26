import { getSupabaseServer } from "@/lib/supabase/server";
import { getBalance, getAiCredits } from "@/lib/paper-wallet";
import { getT } from "@/lib/i18n/server";
import { CreditsClient } from "./credits-client";

export default async function CreditsPage() {
  const t = await getT();
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let balance = 0;
  let credits = 0;
  if (user) {
    [balance, credits] = await Promise.all([
      getBalance(user.id),
      getAiCredits(user.id),
    ]);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("billing.credits.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("billing.credits.subtitle")}
        </p>
      </div>
      <CreditsClient initialBalance={balance} initialCredits={credits} />
    </div>
  );
}
