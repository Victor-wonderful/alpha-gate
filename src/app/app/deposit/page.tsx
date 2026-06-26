import { getSupabaseServer } from "@/lib/supabase/server";
import { getBalance } from "@/lib/paper-wallet";
import { getT } from "@/lib/i18n/server";
import { DepositClient } from "./deposit-client";

export default async function DepositPage() {
  const t = await getT();
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let balance = 0;
  if (user) balance = await getBalance(user.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("billing.deposit.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("billing.deposit.subtitle")}
        </p>
      </div>
      <DepositClient initialBalance={balance} />
    </div>
  );
}
