"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Session = {
  name: string;
  ranges: [number, number][];
};

const SESSIONS: Session[] = [
  { name: "Sydney", ranges: [[6, 15]] },
  { name: "Tokyo", ranges: [[9, 18]] },
  { name: "London", ranges: [[16, 24], [0, 1]] },
  { name: "New York", ranges: [[22, 24], [0, 7]] },
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
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">글로벌 마켓 세션</h2>
        {mounted ? (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            KST {String(time.h).padStart(2, "0")}:{String(time.m).padStart(2, "0")}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">KST</span>
        )}
      </div>

      <ul className="divide-y divide-border/40 rounded-2xl border border-border/60 bg-card/40">
        {SESSIONS.map((s) => {
          const open = mounted ? isOpen(s, time.h) : false;
          const ranges = s.ranges
            .map(([a, b]) => `${String(a).padStart(2, "0")}–${String(b).padStart(2, "0")}`)
            .join(" / ");
          return (
            <li
              key={s.name}
              className="flex items-center justify-between gap-4 px-6 py-4"
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    open ? "bg-grade-a animate-pulse" : "bg-muted-foreground/30",
                  )}
                />
                <span className="text-base font-medium">{s.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm tabular-nums text-muted-foreground">
                  {ranges}
                </span>
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wider",
                    open
                      ? "bg-grade-a/15 text-grade-a"
                      : "bg-muted/40 text-muted-foreground",
                  )}
                >
                  {mounted ? (open ? "OPEN" : "CLOSED") : "—"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-sm text-muted-foreground">
        황금 시간대 22:30–01:00 KST (런던·뉴욕 겹침) · 함정 05:00–09:00 (한산 → 페이크 잦음)
      </p>
    </section>
  );
}
