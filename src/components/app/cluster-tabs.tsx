"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ClusterTab } from "./cluster-tabs-config";

export type { ClusterTab } from "./cluster-tabs-config";

/** Shared tab bar that visually unifies sibling pages under one IA "cluster".
 *
 * Example clusters:
 * - 트레이딩: /app/virtual-trade
 *
 * Pages remain separate routes — this component just renders a tab strip and
 * highlights the matching one based on the current pathname. Switching is a
 * normal client-side navigation.
 *
 * Cluster definitions (title/tabs/etc) live in cluster-tabs-config.ts so that
 * server components can call the factory functions — this client module
 * doesn't expose them across the RSC boundary.
 */
export function ClusterTabs({
  title,
  description,
  tabs,
  rightSlot,
}: {
  title: string;
  description?: string;
  tabs: ClusterTab[];
  rightSlot?: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-background/40 px-5 py-3">
        <div>
          <h1 className="text-lg font-bold leading-[1.15]">{title}</h1>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {rightSlot ? <div className="flex-none">{rightSlot}</div> : null}
      </div>
      <nav className="flex items-center gap-0.5 overflow-x-auto bg-background/20 px-3 py-1.5">
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {t.icon ? <span className="text-[14px] leading-none">{t.icon}</span> : null}
              <span>{t.label}</span>
              {t.badge != null ? (
                <span
                  className={cn(
                    "ml-0.5 rounded px-1.5 text-[10px] font-mono tabular-nums",
                    active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {t.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
