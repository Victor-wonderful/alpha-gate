import { getSupabaseServer } from "@/lib/supabase/server";
import { getBalance, getAiCredits } from "@/lib/paper-wallet";
import { CreditsClient } from "./credits-client";

export default async function CreditsPage() {
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
        <h1 className="text-2xl font-bold">AI 크레딧 구매</h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI 분석 1회 사용 = 크레딧 1개 · vUSDT로 결제
        </p>
      </div>
      <CreditsClient initialBalance={balance} initialCredits={credits} />
    </div>
  );
}
