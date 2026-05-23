import { CalendarDays } from "lucide-react";
import { getUpcomingMacroEvents } from "@/lib/market-widgets/calendar";
import { cn } from "@/lib/utils";

const KIND_STYLES: Record<string, string> = {
  FOMC: "bg-rose-400/15 text-rose-400 border-rose-400/30",
  CPI: "bg-amber-400/15 text-amber-400 border-amber-400/30",
  PPI: "bg-amber-400/10 text-amber-400/80 border-amber-400/20",
  고용: "bg-sky-400/15 text-sky-400 border-sky-400/30",
};

function dayBadge(days: number) {
  if (days === 0) return "D-DAY";
  return `D-${days}`;
}

function dayBadgeTone(days: number, impact: "high" | "med") {
  if (days === 0) return "bg-grade-d/20 text-grade-d";
  if (days <= 1 && impact === "high") return "bg-grade-d/15 text-grade-d";
  if (days <= 3) return "bg-amber-400/15 text-amber-400";
  return "bg-muted/40 text-muted-foreground";
}

export function MacroCalendar() {
  const events = getUpcomingMacroEvents(4);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          이번 주 매크로 이벤트
        </h3>
        <span className="text-[11px] text-muted-foreground">KST</span>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/30 px-5 py-8 text-center text-sm text-muted-foreground">
          다가오는 주요 이벤트 없음.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {events.map((e) => (
            <article
              key={e.startsAt}
              className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/30 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[10px] font-semibold",
                    KIND_STYLES[e.kind] ?? "border-border bg-muted/40 text-muted-foreground",
                  )}
                >
                  {e.kind}
                </span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums",
                    dayBadgeTone(e.daysUntil, e.impact),
                  )}
                >
                  {dayBadge(e.daysUntil)}
                </span>
              </div>
              <p className="text-sm font-semibold leading-snug">{e.title}</p>
              <div className="mt-auto flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{e.dateStr}</span>
                <span className="font-mono tabular-nums">{e.hourStr}</span>
              </div>
              {e.impact === "high" && e.daysUntil <= 1 ? (
                <p className="rounded bg-grade-d/10 px-2 py-1 text-[10px] text-grade-d">
                  ⚠ 발표 직전 24h — 큰 포지션 회피·스톱 좁게
                </p>
              ) : e.note ? (
                <p className="text-[10px] text-muted-foreground">{e.note}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
