import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TopNav } from "@/components/app/topnav";
import { ScrollToTop } from "@/components/app/scroll-to-top";
import { getBalance, getAiCredits } from "@/lib/paper-wallet";
import { isAdminEmail } from "@/lib/admin/guard";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Block deactivated accounts. Sign-out happens client-side on the login page;
  // here we just deny access to the app shell.
  const { data: profile } = await supabase
    .from("profiles")
    .select("disabled")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.disabled) redirect("/login?disabled=1");

  // Fetch balance + credits in parallel so the wallet chip in the header has
  // up-to-date numbers without a client-side spinner. Failures default to 0 —
  // the chip is informational only.
  const [balance, credits] = await Promise.all([
    getBalance(user.id).catch(() => 0),
    getAiCredits(user.id).catch(() => 0),
  ]);

  return (
    <div className="min-h-screen">
      <TopNav
        email={user.email ?? ""}
        balance={balance}
        credits={credits}
        isAdmin={isAdminEmail(user.email)}
      />
      <main>
        <div className="mx-auto w-full max-w-[1600px] px-4 py-5 lg:px-6 lg:py-6">{children}</div>
      </main>
      <ScrollToTop />
    </div>
  );
}
