import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { AppShell } from "@/components/app/app-shell";
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
    <>
      <AppShell
        email={user.email ?? ""}
        balance={balance}
        credits={credits}
        isAdmin={isAdminEmail(user.email)}
      >
        {children}
      </AppShell>
      <ScrollToTop />
    </>
  );
}
