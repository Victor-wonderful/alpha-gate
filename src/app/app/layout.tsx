import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { Sidebar } from "@/components/app/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <Sidebar email={user.email ?? ""} />
      <main className="lg:pl-60">
        <div className="mx-auto w-full max-w-[1240px] px-4 py-5 lg:px-8 lg:py-7">{children}</div>
      </main>
    </div>
  );
}
