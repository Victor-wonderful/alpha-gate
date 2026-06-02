"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type Session = {
  name: string;
  ranges: [number, number][]; // [openHour, closeHour) in KST
  utcRanges: [number, number][]; // same window expressed in UTC (KST − 9h)
};

const SESSIONS: Session[] = [
  { name: "Sydney", ranges: [[6, 15]], utcRanges: [[21, 24], [0, 6]] },
  { name: "Tokyo", ranges: [[9, 18]], utcRanges: [[0, 9]] },
  { name: "London", ranges: [[16, 24], [0, 1]], utcRanges: [[7, 16]] },
  { name: "New York", ranges: [[22, 24], [0, 7]], utcRanges: [[13, 22]] },
];

function clockNow(): {
  h: number;
  m: number;
  totalMin: number;
  utcH: number;
  utcM: number;
} {
  const now = new Date();
  const kstMs = now.getTime() + 9 * 3600 * 1000;
  const d = new Date(kstMs);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return {
    h,
    m,
    totalMin: h * 60 + m,
    utcH: now.getUTCHours(),
    utcM: now.getUTCMinutes(),
  };
}

function isOpen(s: Session, h: number) {
  return s.ranges.some(([a, b]) => h >= a && h < b);
}

/** Returns minutes until next state change (opens or closes), considering KST wrap. */
function minutesUntilNextChange(s: Session, totalMin: number): number {
  // Normalize each range to minute boundaries
  const events: { at: number; type: "open" | "close" }[] = [];
  for (const [a, b] of s.ranges) {
    const openMin = a * 60;
    const closeMin = b === 24 ? 24 * 60 : b * 60;
    events.push({ at: openMin, type: "open" });
    events.push({ at: closeMin, type: "close" });
  }
  events.sort((x, y) => x.at - y.at);
  // Find next event after current time
  for (const ev of events) {
    if (ev.at > totalMin) return ev.at - totalMin;
  }
  // Wrap to next day
  return 24 * 60 - totalMin + events[0].at;
}

function fmtMin(totalMin: number) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

function fmtRange(ranges: [number, number][]) {
  return ranges
    .map(
      ([a, b]) =>
        `${String(a).padStart(2, "0")}:00–${String(b).padStart(2, "0")}:00`,
    )
    .join(" / ");
}

export function SessionsClock() {
  const [time, setTime] = useState<{
    h: number;
    m: number;
    totalMin: number;
    utcH: number;
    utcM: number;
  }>({
    h: 0,
    m: 0,
    totalMin: 0,
    utcH: 0,
    utcM: 0,
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTime(clockNow());
    const t = setInterval(() => setTime(clockNow()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Detect golden window (22:30–01:00 KST = London·NY overlap)
  const inGolden = mounted && (time.totalMin >= 22 * 60 + 30 || time.totalMin < 60);
  // Trap window (05:00–09:00)
  const inTrap = mounted && time.totalMin >= 5 * 60 && time.totalMin < 9 * 60;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Clock className="h-4 w-4 text-muted-foreground" />
          글로벌 마켓 세션
        </h2>
        {mounted ? (
          <div className="flex items-center gap-2">
            {inGolden ? (
              <span className="rounded-md bg-grade-a/15 px-2 py-0.5 text-xs font-semibold text-grade-a">
                🌟 황금 시간대
              </span>
            ) : inTrap ? (
              <span className="rounded-md bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-400">
                ⚠ 함정 시간대
              </span>
            ) : null}
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              KST {String(time.h).padStart(2, "0")}:
              {String(time.m).padStart(2, "0")}
              <span className="text-muted-foreground/60">
                {" · "}UTC {String(time.utcH).padStart(2, "0")}:
                {String(time.utcM).padStart(2, "0")}
              </span>
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">KST · UTC</span>
        )}
      </div>

      <article className="rounded-2xl border border-border/60 bg-card/40 p-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {SESSIONS.map((s) => {
            const open = mounted ? isOpen(s, time.h) : false;
            const until = mounted ? minutesUntilNextChange(s, time.totalMin) : 0;
            return (
              <div
                key={s.name}
                className={cn(
                  "rounded-lg border px-3 py-2.5 transition-colors",
                  open
                    ? "border-grade-a/40 bg-grade-a/[0.06]"
                    : "border-border/60 bg-card/30",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{s.name}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      open
                        ? "bg-grade-a/20 text-grade-a"
                        : "bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {mounted ? (open ? "OPEN" : "CLOSED") : "—"}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                  KST {fmtRange(s.ranges)}
                </p>
                <p className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
                  UTC {fmtRange(s.utcRanges)}
                </p>
                {mounted ? (
                  <p
                    className={cn(
                      "mt-0.5 text-[11px]",
                      open ? "text-grade-a/80" : "text-muted-foreground",
                    )}
                  >
                    {open ? "마감까지" : "오픈까지"}{" "}
                    <span className="font-mono font-medium tabular-nums">
                      {fmtMin(until)}
                    </span>
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}
