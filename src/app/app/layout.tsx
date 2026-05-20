import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TopNav } from "@/components/app/topnav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <TopNav email={user.email ?? ""} />
      <main>
        <div className="mx-auto w-full max-w-[1600px] px-4 py-5 lg:px-6 lg:py-6">{children}</div>
      </main>
    </div>
  );
}
