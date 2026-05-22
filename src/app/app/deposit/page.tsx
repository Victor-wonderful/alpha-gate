import { getSupabaseServer } from "@/lib/supabase/server";
import { getBalance } from "@/lib/paper-wallet";
import { DepositClient } from "./deposit-client";

export default async function DepositPage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let balance = 0;
  if (user) balance = await getBalance(user.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">vUSDT 충전</h1>
        <p className="text-sm text-muted-foreground mt-1">
          1 AAG = 1 USDT(실제) = 1,000 vUSDT (플랫폼 가상화폐)
        </p>
      </div>
      <DepositClient initialBalance={balance} />
    </div>
  );
}
