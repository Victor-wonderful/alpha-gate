import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

type StepKey = "analyze" | "trade" | "journal" | "dashboard";

const STEPS: Array<{
  key: StepKey;
  labelKey: string;
  descKey: string;
  href: string;
}> = [
  { key: "analyze", labelKey: "nav.analyze", descKey: "flow.analyzeDesc", href: "/app/analyze" },
  { key: "trade", labelKey: "nav.trade", descKey: "flow.tradeDesc", href: "/app/trade" },
  { key: "journal", labelKey: "nav.journal", descKey: "flow.journalDesc", href: "/app/journal" },
  { key: "dashboard", labelKey: "nav.performance", descKey: "flow.dashboardDesc", href: "/app/dashboard" },
];

export async function FlowStepper({ current }: { current: StepKey }) {
  const t = await getT();
  const currentIndex = STEPS.findIndex((s) => s.key === current);
  return (
    <nav
      aria-label={t("flow.aria")}
      className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background/30 p-2 text-xs"
    >
      {STEPS.map((s, i) => {
        const active = i === currentIndex;
        const done = i < currentIndex;
        return (
          <div key={s.key} className="flex items-center gap-1">
            <Link
              href={s.href}
              aria-current={active ? "step" : undefined}
              className={cn(
                "group flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors",
                active
                  ? "bg-primary/15 text-foreground"
                  : done
                    ? "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    : "text-muted-foreground/60 hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[10px] font-bold",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : done
                      ? "border-grade-a/60 bg-grade-a/15 text-grade-a"
                      : "border-border bg-background/60",
                )}
              >
                {done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </span>
              <div className="leading-tight">
                <div className="text-[11px] font-semibold">{t(s.labelKey)}</div>
                <div className="text-[10px] text-muted-foreground/80 group-hover:text-muted-foreground">
                  {t(s.descKey)}
                </div>
              </div>
            </Link>
            {i < STEPS.length - 1 ? (
              <ArrowRight className="h-3 w-3 flex-none text-muted-foreground/40" />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
