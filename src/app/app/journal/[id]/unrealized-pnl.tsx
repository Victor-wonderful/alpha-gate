"use client";

import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

type Props = {
  symbol: string;
  direction: "long" | "short";
  entryActual: number;
  stop: number;
  target: number;
  positionQuantity: number;
  feesPct: number;
  currency?: "USD" | "KRW";
};

/** Live unrealized PnL widget. Polls Binance Futures public ticker every 10s and
 *  computes net R after round-trip fees. Pure client-side fetch — no server load. */
export function UnrealizedPnl({
  symbol,
  direction,
  entryActual,
  stop,
  target,
  positionQuantity,
  feesPct,
  currency = "USD",
}: Props) {
  const [price, setPrice] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const r = await fetch(
          `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${encodeURIComponent(symbol)}`,
          { cache: "no-store" },
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as { price: string };
        if (!alive) return;
        setPrice(parseFloat(j.price));
        setStale(false);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setStale(true);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) timer = setTimeout(tick, 10_000);
      }
    }
    tick();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [symbol]);

  if (price == null) {
    return (
      <div className="rounded-lg border border-border bg-card/50 px-4 py-3 text-xs text-muted-foreground">
        현재가 가져오는 중...
        {error ? <span className="ml-2 text-grade-d">({error})</span> : null}
      </div>
    );
  }

  // R math (uses entry_actual, fees subtracted)
  const stopDist = Math.abs(entryActual - stop);
  const targetDist = Math.abs(target - entryActual);
  const movement = direction === "long" ? price - entryActual : entryActual - price;
  const feesR = stopDist > 0 ? (entryActual * (feesPct / 100)) / stopDist : 0;
  const grossR = stopDist > 0 ? movement / stopDist : 0;
  const netR = grossR - feesR;

  // Dollar PnL (gross — fees are tiny in $ terms for paper display).
  const pnlUsd = movement * positionQuantity;
  const movePct = entryActual > 0 ? (movement / entryActual) * 100 : 0;

  const distToStopPct =
    entryActual > 0 ? (Math.abs(price - stop) / entryActual) * 100 : 0;
  const distToTargetPct =
    entryActual > 0 ? (Math.abs(price - target) / entryActual) * 100 : 0;
  const stopProgress =
    stopDist > 0 ? Math.min(100, Math.max(0, ((stopDist - Math.abs(price - stop)) / stopDist) * 100)) : 0;
  const targetProgress =
    targetDist > 0
      ? Math.min(100, Math.max(0, ((targetDist - Math.abs(target - price)) / targetDist) * 100))
      : 0;
  // Has price actually crossed entry in the favorable direction yet?
  const inProfit = netR > 0;

  return (
    <div className={cn(
      "rounded-lg border bg-card/70 p-4",
      inProfit ? "border-grade-a/40" : "border-grade-d/40",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className={cn("inline-block h-1.5 w-1.5 rounded-full", stale ? "bg-grade-c" : "bg-grade-a animate-pulse")} />
            진행 중 · 미실현 손익
            {stale ? <span className="text-grade-c">(연결 지연)</span> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-3">
            <span className={cn("font-mono text-2xl font-bold tabular-nums", inProfit ? "text-grade-a" : "text-grade-d")}>
              {inProfit ? "+" : ""}{netR.toFixed(2)}R
            </span>
            <span className={cn("font-mono text-base tabular-nums", inProfit ? "text-grade-a" : "text-grade-d")}>
              {pnlUsd >= 0 ? "+" : ""}{formatCurrency(pnlUsd, currency)}
            </span>
            <span className={cn("font-mono text-xs tabular-nums", inProfit ? "text-grade-a/80" : "text-grade-d/80")}>
              {movePct >= 0 ? "+" : ""}{movePct.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-muted-foreground">현재가</div>
          <div className="font-mono text-sm font-semibold tabular-nums">${formatNumber(price)}</div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <div className="flex items-center justify-between text-[10px] uppercase text-muted-foreground">
            <span className="flex items-center gap-1 text-grade-d">
              <TrendingDown className="h-3 w-3" />
              손절까지
            </span>
            <span className="font-mono tabular-nums">{distToStopPct.toFixed(2)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/30">
            <div
              className="h-full bg-grade-d/60 transition-all"
              style={{ width: `${stopProgress}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[10px] uppercase text-muted-foreground">
            <span className="flex items-center gap-1 text-grade-a">
              <TrendingUp className="h-3 w-3" />
              목표까지
            </span>
            <span className="font-mono tabular-nums">{distToTargetPct.toFixed(2)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/30">
            <div
              className="h-full bg-grade-a/60 transition-all"
              style={{ width: `${targetProgress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-2 text-[10px] text-muted-foreground">
        10초마다 자동 갱신 · 수수료 {feesPct.toFixed(2)}% 차감 반영 · Binance 마크 가격
      </div>
    </div>
  );
}
