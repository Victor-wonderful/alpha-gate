import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Small "?" help link placed next to page titles or in ClusterTabs rightSlot.
 *  Points to the matching /app/guide/* subpage. */
export function HelpLink({
  href,
  size = "sm",
  label = "도움말",
}: {
  href: string;
  size?: "sm" | "md";
  label?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-card shadow-card text-muted-foreground transition-colors hover:border-border/80 hover:shadow-card-hover hover:-translate-y-0.5 hover:text-foreground",
        size === "sm" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs",
      )}
      title="이 화면 사용 방법"
    >
      <HelpCircle className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      <span>{label}</span>
    </Link>
  );
}
