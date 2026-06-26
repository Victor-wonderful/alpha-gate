"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { classifyLiquidity, dayOfWeekNote, entrySuitability, type EntryTier } from "@/lib/analysis/sessions";

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
  dow: number;
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
    dow: d.getUTCDay(), // KST 기준 요일 (0=일 … 6=토)
  };
}

const ENTRY_TONE: Record<EntryTier, { box: string; badge: string; dot: string }> = {
  optimal: {
    box: "border-grade-a/40 bg-grade-a/5",
    badge: "bg-grade-a/15 text-grade-a",
    dot: "bg-grade-a",
  },
  good: {
    box: "border-primary/30 bg-primary/5",
    badge: "bg-primary/15 text-primary",
    dot: "bg-primary",
  },
  caution: {
    box: "border-grade-c/40 bg-grade-c/5",
    badge: "bg-grade-c/15 text-grade-c",
    dot: "bg-grade-c",
  },
  avoid: {
    box: "border-grade-d/40 bg-grade-d/5",
    badge: "bg-grade-d/15 text-grade-d",
    dot: "bg-grade-d",
  },
};

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

function fmtMin(totalMin: number, t: (key: string, vars?: Record<string, string | number>) => string) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return t("market.sessions.durationMin", { m });
  if (m === 0) return t("market.sessions.durationHour", { h });
  return t("market.sessions.durationHourMin", { h, m });
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
  const t = useT();
  const [time, setTime] = useState<{
    h: number;
    m: number;
    totalMin: number;
    utcH: number;
    utcM: number;
    dow: number;
  }>({
    h: 0,
    m: 0,
    totalMin: 0,
    utcH: 0,
    utcM: 0,
    dow: 0,
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTime(clockNow());
    const t = setInterval(() => setTime(clockNow()), 30_000);
    return () => clearInterval(t);
  }, []);

  // 유동성 등급은 공유 분류기 사용 (분석 타이밍 힌트와 동일 기준)
  const tier = mounted ? classifyLiquidity(time.totalMin, t).tier : null;
  const inGolden = tier === "golden";
  const inTrap = tier === "dead";

  // 진입(트레이딩) 적합도 — 유동성 + 펀딩 + 요일 종합
  const entry = mounted ? entrySuitability(time.totalMin, time.dow, t) : null;
  const dayNote = mounted ? dayOfWeekNote(time.dow, t) : null;
  const entryTone = entry ? ENTRY_TONE[entry.tier] : null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Clock className="h-4 w-4 text-muted-foreground" />
          {t("market.sessions.title")}
        </h2>
        {mounted ? (
          <div className="flex items-center gap-2">
            {inGolden ? (
              <span className="rounded-md bg-grade-a/15 px-2 py-0.5 text-xs font-semibold text-grade-a">
                🌟 {t("market.sessions.goldenWindow")}
              </span>
            ) : inTrap ? (
              <span className="rounded-md bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-400">
                ⚠ {t("market.sessions.trapWindow")}
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

      {/* 진입 적합도 — 지금이 실제 트레이딩하기 좋은 때인가 */}
      {entry && entryTone ? (
        <div className={cn("mb-2 rounded-xl border px-3 py-2.5", entryTone.box)}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-bold",
                entryTone.badge,
              )}
            >
              <span className={cn("h-1.5 w-1.5 animate-pulse rounded-full", entryTone.dot)} />
              {entry.label}
            </span>
            <span className="min-w-0 flex-1 text-xs text-muted-foreground">{entry.advice}</span>
          </div>
          {dayNote ? (
            <div className="mt-1.5 border-t border-border/40 pt-1.5 text-[11px] text-muted-foreground">
              📅 {dayNote}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mb-2 rounded-xl border border-border/60 bg-card/30 px-3 py-2.5 text-xs text-muted-foreground">
          {t("market.sessions.entryEvaluating")}
        </div>
      )}

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
                    {open ? t("market.sessions.untilClose") : t("market.sessions.untilOpen")}{" "}
                    <span className="font-mono font-medium tabular-nums">
                      {fmtMin(until, t)}
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
