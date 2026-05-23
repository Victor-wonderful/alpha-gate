"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type Session = {
  name: string;
  region: string;
  ranges: [number, number][];
  accent: string;
};

const SESSIONS: Session[] = [
  { name: "Sydney", region: "Asia/Sydney", ranges: [[6, 15]], accent: "bg-amber-400/70" },
  { name: "Tokyo", region: "Asia/Tokyo", ranges: [[9, 18]], accent: "bg-rose-400/70" },
  {
    name: "London",
    region: "Europe/London",
    ranges: [
      [16, 24],
      [0, 1],
    ],
    accent: "bg-sky-400/70",
  },
  {
    name: "New York",
    region: "America/New_York",
    ranges: [
      [22, 24],
      [0, 7],
    ],
    accent: "bg-emerald-400/70",
  },
];

function kstNow(): { h: number; m: number } {
  const now = new Date();
  const kstMs = now.getTime() + 9 * 3600 * 1000;
  const d = new Date(kstMs);
  return { h: d.getUTCHours(), m: d.getUTCMinutes() };
}

function isOpen(s: Session, h: number) {
  return s.ranges.some(([a, b]) => h >= a && h < b);
}

export function SessionsClock() {
  const [time, setTime] = useState<{ h: number; m: number }>({ h: 0, m: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTime(kstNow());
    const t = setInterval(() => setTime(kstNow()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="h-4 w-4 text-muted-foreground" />
          글로벌 마켓 세션
          <span className="text-[11px] font-normal text-muted-foreground">· KST</span>
        </h3>
        {mounted ? (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            현재 KST {String(time.h).padStart(2, "0")}:{String(time.m).padStart(2, "0")}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SESSIONS.map((s) => {
          const open = mounted ? isOpen(s, time.h) : false;
          return (
            <article
              key={s.name}
              className={cn(
                "rounded-xl border bg-card/30 px-4 py-3 transition-colors",
                open ? "border-grade-a/40 bg-grade-a/[0.04]" : "border-border/60",
              )}
            >
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold">{s.name}</p>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    open
                      ? "bg-grade-a/15 text-grade-a"
                      : "bg-muted/40 text-muted-foreground",
                  )}
                >
                  {mounted ? (open ? "OPEN" : "CLOSED") : "—"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{s.region}</p>
              <p className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                KST{" "}
                {s.ranges
                  .map(
                    ([a, b]) =>
                      `${String(a).padStart(2, "0")}:00–${String(b).padStart(2, "0")}:00`,
                  )
                  .join(" / ")}
              </p>
              <span className={cn("mt-3 block h-0.5 rounded", s.accent)} />
            </article>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        황금 시간대: 런던·뉴욕 겹침 <span className="font-mono">22:30–01:00 KST</span> · 함정: 뉴욕 마감~도쿄 오픈 <span className="font-mono">05:00–09:00 KST</span>
      </p>
    </section>
  );
}
