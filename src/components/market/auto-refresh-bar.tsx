"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

/**
 * Auto + manual refresh control for server-rendered market pages.
 *
 * - Calls router.refresh() every `intervalMs` while the tab is visible.
 *   Background tabs are paused so we don't hit external APIs for nothing.
 * - Shows "마지막 갱신: N초 전" relative time, ticking every 5s.
 * - "지금 갱신" button forces an immediate refresh.
 *
 * The actual data freshness is bounded by each fetcher's revalidate window
 * (Binance ticker 60s, F&G 1h, etc.) — this just triggers re-evaluation
 * of the server components so newly-available cached data renders.
 */
export function AutoRefreshBar({
  intervalMs = 60_000,
  label,
}: {
  intervalMs?: number;
  label?: string;
}) {
  const router = useRouter();
  const t = useT();
  const [lastRefresh, setLastRefresh] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());
  const [isPending, startTransition] = useTransition();

  // Tick "N초 전" every 5s
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  // Auto refresh while visible
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      startTransition(() => {
        router.refresh();
        setLastRefresh(Date.now());
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  const handleManual = () => {
    startTransition(() => {
      router.refresh();
      setLastRefresh(Date.now());
    });
  };

  const seconds = Math.max(0, Math.floor((now - lastRefresh) / 1000));
  const rel =
    seconds < 5
      ? t("refresh.justNow")
      : seconds < 60
        ? t("refresh.secondsAgo", { n: seconds })
        : t("refresh.minutesAgo", { n: Math.floor(seconds / 60) });

  const intervalLabel =
    intervalMs >= 60_000
      ? `${Math.round(intervalMs / 60_000)}${t("unit.min")}`
      : `${Math.round(intervalMs / 1000)}${t("unit.sec")}`;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/30 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            isPending ? "bg-amber-400 animate-pulse" : "bg-grade-a",
          )}
        />
        <span className="text-muted-foreground">
          {label ?? t("refresh.last")}
        </span>
        <span className="font-medium text-foreground">{rel}</span>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          · {t("refresh.autoEvery", { interval: intervalLabel })}
        </span>
      </div>
      <button
        type="button"
        onClick={handleManual}
        disabled={isPending}
        className="group inline-flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-2.5 py-1 text-xs font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RotateCw
          className={cn(
            "h-3 w-3 transition-transform",
            isPending && "animate-spin",
          )}
        />
        {t("refresh.now")}
      </button>
    </div>
  );
}
