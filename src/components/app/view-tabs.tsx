import Link from "next/link";
import { cn } from "@/lib/utils";

export type View = "all" | "trades" | "games";

/** Sub-tab bar used inside Journal and Dashboard to switch the data source.
 *  Server-driven via ?view= search param so each tab is a regular link
 *  (full SSR refetch). Counts are optional but help the user pick. */
export function ViewTabs({
  basePath,
  current,
  counts,
}: {
  basePath: string;
  current: View;
  counts?: { all?: number; trades?: number; games?: number };
}) {
  const tabs: { key: View; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "trades", label: "거래" },
    { key: "games", label: "게임" },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-card/40 p-0.5 text-sm">
      {tabs.map((t) => {
        const active = current === t.key;
        const href = t.key === "all" ? basePath : `${basePath}?view=${t.key}`;
        const count = counts?.[t.key];
        return (
          <Link
            key={t.key}
            href={href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 transition-colors",
              active
                ? "bg-primary/15 text-primary font-semibold"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <span>{t.label}</span>
            {count != null ? (
              <span
                className={cn(
                  "rounded px-1.5 text-[10px] font-mono tabular-nums",
                  active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

export function parseView(raw: string | undefined | null): View {
  return raw === "trades" || raw === "games" ? raw : "all";
}
