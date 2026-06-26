import { getUpcomingMacroEvents } from "@/lib/market-widgets/calendar";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

function dayBadge(days: number) {
  if (days === 0) return "D-DAY";
  return `D-${days}`;
}

function dayBadgeTone(days: number, impact: "high" | "med") {
  if (days === 0) return "bg-grade-d/15 text-grade-d";
  if (days <= 1 && impact === "high") return "bg-grade-d/15 text-grade-d";
  if (days <= 3) return "bg-amber-400/15 text-amber-400";
  return "bg-muted/40 text-muted-foreground";
}

export async function MacroCalendar() {
  const t = await getT();
  const events = getUpcomingMacroEvents(4);

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">{t("market.macroCal.title")}</h2>
        <span className="text-xs text-muted-foreground">KST</span>
      </div>

      {events.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card/40 px-6 py-8 text-center text-sm text-muted-foreground">
          {t("market.macroCal.empty")}
        </div>
      ) : (
        <ul className="divide-y divide-border/40 rounded-2xl border border-border/60 bg-card/40">
          {events.map((e) => (
            <li
              key={e.startsAt}
              className="flex items-center justify-between gap-4 px-6 py-4"
            >
              <div className="flex min-w-0 items-center gap-4">
                <span
                  className={cn(
                    "shrink-0 rounded-md px-2 py-1 font-mono text-xs font-bold tabular-nums",
                    dayBadgeTone(e.daysUntil, e.impact),
                  )}
                >
                  {dayBadge(e.daysUntil)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-medium">{e.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {e.dateStr} · {e.hourStr}
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-md border border-border/60 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {e.kind}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
