import { Shield } from "lucide-react";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold tracking-tight">어드민</h1>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {admin.email}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        <aside className="lg:w-52 lg:shrink-0">
          <div className="lg:sticky lg:top-20">
            <AdminNav />
          </div>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
