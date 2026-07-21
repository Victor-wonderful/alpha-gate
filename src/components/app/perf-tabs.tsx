import Link from "next/link";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

/** 성과 분석 ↔ 거래 일지 전환 탭 (링크형). 두 페이지를 한 메뉴처럼 묶는다. */
export async function PerfTabs({ current }: { current: "perf" | "journal" }) {
  const t = await getT();
  const tabs = [
    { key: "perf" as const, href: "/app/dashboard", label: t("nav.performance") },
    { key: "journal" as const, href: "/app/journal", label: t("nav.journal") },
  ];
  return (
    <div className="inline-flex gap-1 rounded-lg border border-border bg-background/40 p-0.5">
      {tabs.map((tb) => (
        <Link
          key={tb.key}
          href={tb.href}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-semibold transition-colors",
            current === tb.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
          )}
        >
          {tb.label}
        </Link>
      ))}
    </div>
  );
}
