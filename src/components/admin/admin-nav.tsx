"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Activity, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

export function AdminNav() {
  const pathname = usePathname();
  const t = useT();

  const ITEMS = [
    { href: "/app/admin", label: t("admin.navDashboard"), icon: LayoutDashboard, exact: true },
    { href: "/app/admin/users", label: t("admin.navUsers"), icon: Users, exact: false },
    { href: "/app/admin/activity", label: t("admin.navActivity"), icon: Activity, exact: false },
    { href: "/app/admin/system", label: t("admin.navSystem"), icon: Server, exact: false },
  ];
  return (
    <nav
      className={cn(
        // mobile: horizontal scroll row; desktop: vertical list
        "flex flex-row gap-1 overflow-x-auto rounded-lg border border-border bg-card/40 p-1",
        "lg:flex-col lg:overflow-visible lg:p-1.5",
      )}
    >
      {ITEMS.map((it) => {
        const Icon = it.icon;
        const active = it.exact
          ? pathname === it.href
          : pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors lg:w-full",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
