import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TopNav } from "@/components/app/topnav";
import { ScrollToTop } from "@/components/app/scroll-to-top";
import { getBalance, getAiCredits } from "@/lib/paper-wallet";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch balance + credits in parallel so the wallet chip in the header has
  // up-to-date numbers without a client-side spinner. Failures default to 0 —
  // the chip is informational only.
  const [balance, credits] = await Promise.all([
    getBalance(user.id).catch(() => 0),
    getAiCredits(user.id).catch(() => 0),
  ]);

  return (
    <div className="min-h-screen">
      <TopNav email={user.email ?? ""} balance={balance} credits={credits} />
      <main>
        <div className="mx-auto w-full max-w-[1600px] px-4 py-5 lg:px-6 lg:py-6">{children}</div>
      </main>
      <ScrollToTop />
    </div>
  );
}
