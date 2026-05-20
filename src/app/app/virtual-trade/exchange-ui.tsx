"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { createChart, ColorType, CandlestickSeries, type IChartApi, type CandlestickData, type Time } from "lightweight-charts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { closeVirtualPositionAction, placeVirtualOrderAction } from "./order-actions";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT"] as const;
const TIMEFRAMES = ["15m", "1h", "4h", "1d"] as const;
const LEVERAGE_PRESETS = [1, 3, 5, 10, 20, 50];

type Wallet = {
  usdtBalance: number;
  available: number;
  usedMargin: number;
  startingBalance: number;
};

type Position = {
  id: string;
  symbol: string;
  direction: "long" | "short";
  entryActual: number;
  qty: number;
  margin: number;
  stop: number;
  target: number;
  createdAt: string;
};

export function ExchangeUI({
  initialSymbol,
  wallet,
  positions,
}: {
  initialSymbol: string;
  wallet: Wallet;
  positions: Position[];
}) {
  const [symbol, setSymbol] = useState<string>(initialSymbol);
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>("1h");
  const [tab, setTab] = useState<"positions" | "history">("positions");

  return (
    <div className="space-y-3">
      <ExchangeHeader symbol={symbol} onSymbolChange={setSymbol} wallet={wallet} positions={positions} />

      <div className="grid gap-3 lg:grid-cols-[1fr_300px_320px]">
        {/* Chart + tabs */}
        <div className="space-y-3">
          <ChartArea symbol={symbol} timeframe={timeframe} onTimeframeChange={setTimeframe} />
          <PositionsTabs tab={tab} onTabChange={setTab} positions={positions} />
        </div>

        {/* Orderbook */}
        <OrderbookPanel symbol={symbol} />

        {/* Order entry */}
        <OrderPanel symbol={symbol} wallet={wallet} />
      </div>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────
function ExchangeHeader({
  symbol,
  onSymbolChange,
  wallet,
  positions,
}: {
  symbol: string;
  onSymbolChange: (s: string) => void;
  wallet: Wallet;
  positions: Position[];
}) {
  const [ticker, setTicker] = useState<{ last: number; change: number; high: number; low: number; volume: number } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setTicker({
          last: parseFloat(j.lastPrice),
          change: parseFloat(j.priceChangePercent),
          high: parseFloat(j.highPrice),
          low: parseFloat(j.lowPrice),
          volume: parseFloat(j.quoteVolume),
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [symbol]);

  const totalUnrealized = positions.reduce((s, p) => {
    if (!ticker) return s;
    const movement = p.direction === "long" ? ticker.last - p.entryActual : p.entryActual - ticker.last;
    return s + movement * p.qty;
  }, 0);
  const equity = wallet.usdtBalance + totalUnrealized;

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Symbol switcher */}
          <select
            value={symbol}
            onChange={(e) => onSymbolChange(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 font-mono text-sm font-semibold"
          >
            {SYMBOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Price + 24h */}
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "font-mono text-2xl font-bold tabular-nums",
                ticker?.change != null ? (ticker.change >= 0 ? "text-grade-a" : "text-grade-d") : "",
              )}
            >
              ${ticker ? formatNumber(ticker.last) : "—"}
            </span>
            {ticker ? (
              <span
                className={cn(
                  "font-mono text-sm tabular-nums",
                  ticker.change >= 0 ? "text-grade-a" : "text-grade-d",
                )}
              >
                {ticker.change >= 0 ? "+" : ""}
                {ticker.change.toFixed(2)}%
              </span>
            ) : null}
          </div>

          {ticker ? (
            <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
              <HeaderStat label="24h 고가" value={`$${formatNumber(ticker.high)}`} />
              <HeaderStat label="24h 저가" value={`$${formatNumber(ticker.low)}`} />
              <HeaderStat label="24h 거래량" value={`$${formatNumber(ticker.volume / 1_000_000, { maximumFractionDigits: 1 })}M`} />
            </div>
          ) : null}

          <div className="ml-auto flex flex-wrap gap-3 text-[11px]">
            <HeaderStat label="자산 (Equity)" value={formatCurrency(equity, "USD")} accent="primary" />
            <HeaderStat label="잔액" value={formatCurrency(wallet.usdtBalance, "USD")} />
            <HeaderStat label="사용 가능" value={formatCurrency(wallet.available, "USD")} />
            <HeaderStat label="마진" value={formatCurrency(wallet.usedMargin, "USD")} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HeaderStat({ label, value, accent }: { label: string; value: string; accent?: "primary" }) {
  return (
    <div>
      <div className="text-[9px] uppercase text-muted-foreground/80">{label}</div>
      <div className={cn("font-mono text-xs font-semibold tabular-nums", accent === "primary" && "text-primary")}>
        {value}
      </div>
    </div>
  );
}

// ─── Chart ───────────────────────────────────────────────────────────────
function ChartArea({
  symbol,
  timeframe,
  onTimeframeChange,
}: {
  symbol: string;
  timeframe: (typeof TIMEFRAMES)[number];
  onTimeframeChange: (tf: (typeof TIMEFRAMES)[number]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgb(148 163 184)",
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.06)" },
        horzLines: { color: "rgba(148, 163, 184, 0.06)" },
      },
      timeScale: { borderColor: "rgba(148, 163, 184, 0.1)", timeVisible: true },
      rightPriceScale: { borderColor: "rgba(148, 163, 184, 0.1)" },
      width: container.clientWidth,
      height: 420,
    });
    chartRef.current = chart;
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "rgb(74 222 128)",
      downColor: "rgb(248 113 113)",
      borderUpColor: "rgb(74 222 128)",
      borderDownColor: "rgb(248 113 113)",
      wickUpColor: "rgb(74 222 128)",
      wickDownColor: "rgb(248 113 113)",
    });

    let alive = true;
    setLoading(true);
    fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=300`)
      .then((r) => r.json())
      .then((arr: unknown[][]) => {
        if (!alive) return;
        const data: CandlestickData<Time>[] = arr.map((k) => ({
          time: (Number(k[0]) / 1000) as Time,
          open: parseFloat(k[1] as string),
          high: parseFloat(k[2] as string),
          low: parseFloat(k[3] as string),
          close: parseFloat(k[4] as string),
        }));
        series.setData(data);
        chart.timeScale().fitContent();
        setLoading(false);
      })
      .catch(() => setLoading(false));

    const ro = new ResizeObserver(() => {
      if (chartRef.current && container) chartRef.current.applyOptions({ width: container.clientWidth });
    });
    ro.observe(container);

    return () => {
      alive = false;
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [symbol, timeframe]);

  return (
    <Card>
      <CardContent className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold text-muted-foreground">{symbol} · {timeframe.toUpperCase()}</div>
          <div className="flex gap-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onTimeframeChange(tf)}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] font-medium uppercase",
                  tf === timeframe
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
        <div ref={containerRef} className="relative w-full" style={{ height: 420 }}>
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              차트 로딩 중...
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Orderbook + Market Trades ──────────────────────────────────────────
type DepthView = "both" | "bid" | "ask";
const GROUP_OPTIONS = [0.01, 0.1, 1, 10] as const;

function OrderbookPanel({ symbol }: { symbol: string }) {
  const [tab, setTab] = useState<"book" | "trades">("book");
  const [depthView, setDepthView] = useState<DepthView>("both");
  const [groupSize, setGroupSize] = useState<number>(0.1);

  return (
    <Card>
      <CardContent className="p-0">
        {/* Tab header */}
        <div className="flex items-center border-b border-border/40 px-3 py-2">
          <button
            type="button"
            onClick={() => setTab("book")}
            className={cn(
              "text-xs font-semibold transition-colors",
              tab === "book" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            호가창
          </button>
          <div className="mx-3 h-3 w-px bg-border/60" />
          <button
            type="button"
            onClick={() => setTab("trades")}
            className={cn(
              "text-xs font-semibold transition-colors",
              tab === "trades" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            최근 체결
          </button>

          {tab === "book" ? (
            <div className="ml-auto flex items-center gap-2">
              {/* Depth view mode */}
              <div className="flex gap-0.5 rounded border border-border/60 bg-background/40 p-0.5">
                <DepthIcon active={depthView === "both"} onClick={() => setDepthView("both")} kind="both" />
                <DepthIcon active={depthView === "bid"} onClick={() => setDepthView("bid")} kind="bid" />
                <DepthIcon active={depthView === "ask"} onClick={() => setDepthView("ask")} kind="ask" />
              </div>
              {/* Group size */}
              <select
                value={groupSize}
                onChange={(e) => setGroupSize(Number(e.target.value))}
                className="h-6 rounded border border-border/60 bg-background/40 px-1.5 font-mono text-[10px] tabular-nums"
              >
                {GROUP_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {tab === "book" ? (
          <OrderbookContent symbol={symbol} depthView={depthView} groupSize={groupSize} />
        ) : (
          <MarketTradesContent symbol={symbol} />
        )}
      </CardContent>
    </Card>
  );
}

function DepthIcon({
  active,
  onClick,
  kind,
}: {
  active: boolean;
  onClick: () => void;
  kind: "both" | "bid" | "ask";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-5 w-6 items-center justify-center rounded transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
      title={kind === "both" ? "양쪽" : kind === "bid" ? "매수만" : "매도만"}
    >
      <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
        {(kind === "both" || kind === "ask") && (
          <>
            <rect x="0" y="0" width="6" height="2" fill="currentColor" className="text-grade-d/70" />
            <rect x="0" y="3" width="9" height="2" fill="currentColor" className="text-grade-d/70" />
          </>
        )}
        {(kind === "both" || kind === "bid") && (
          <>
            <rect x="0" y="7" width="9" height="2" fill="currentColor" className="text-grade-a/70" />
            <rect x="0" y="10" width="6" height="2" fill="currentColor" className="text-grade-a/70" />
          </>
        )}
      </svg>
    </button>
  );
}

function OrderbookContent({
  symbol,
  depthView,
  groupSize,
}: {
  symbol: string;
  depthView: DepthView;
  groupSize: number;
}) {
  const [book, setBook] = useState<{
    bids: [number, number][];
    asks: [number, number][];
    last: number | null;
    prevLast: number | null;
  }>({
    bids: [],
    asks: [],
    last: null,
    prevLast: null,
  });

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const [depthR, priceR] = await Promise.all([
          fetch(`https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=30`),
          fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`),
        ]);
        const depth = (await depthR.json()) as { bids: [string, string][]; asks: [string, string][] };
        const price = (await priceR.json()) as { price: string };
        if (!alive) return;
        setBook((prev) => ({
          bids: depth.bids.map((b) => [parseFloat(b[0]), parseFloat(b[1])]),
          asks: depth.asks.map((a) => [parseFloat(a[0]), parseFloat(a[1])]),
          last: parseFloat(price.price),
          prevLast: prev.last,
        }));
      } catch {
        /* skip */
      } finally {
        if (alive) timer = setTimeout(tick, 2000);
      }
    }
    tick();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [symbol]);

  // Group prices by groupSize (floor for asks → smaller bucket, ceil for bids → bigger bucket)
  function groupBy(entries: [number, number][], side: "ask" | "bid"): [number, number][] {
    if (groupSize <= 0) return entries;
    const map = new Map<number, number>();
    for (const [p, q] of entries) {
      const bucket = side === "ask" ? Math.ceil(p / groupSize) * groupSize : Math.floor(p / groupSize) * groupSize;
      map.set(bucket, (map.get(bucket) ?? 0) + q);
    }
    const sorted = Array.from(map.entries()).map(([p, q]) => [p, q] as [number, number]);
    if (side === "ask") sorted.sort((a, b) => a[0] - b[0]);
    else sorted.sort((a, b) => b[0] - a[0]);
    return sorted;
  }

  const groupedAsks = groupBy(book.asks, "ask").slice(0, 14);
  const groupedBids = groupBy(book.bids, "bid").slice(0, 14);

  // Cumulative totals (from best outward)
  const askCum: number[] = [];
  let askAcc = 0;
  for (const a of groupedAsks) {
    askAcc += a[1];
    askCum.push(askAcc);
  }
  const bidCum: number[] = [];
  let bidAcc = 0;
  for (const b of groupedBids) {
    bidAcc += b[1];
    bidCum.push(bidAcc);
  }
  const maxCum = Math.max(askAcc, bidAcc, 1);

  // B/S ratio (depth-weighted)
  const bidValue = groupedBids.reduce((s, [p, q]) => s + p * q, 0);
  const askValue = groupedAsks.reduce((s, [p, q]) => s + p * q, 0);
  const total = bidValue + askValue;
  const bidPct = total > 0 ? (bidValue / total) * 100 : 50;
  const askPct = 100 - bidPct;

  const bestBid = groupedBids[0]?.[0];
  const bestAsk = groupedAsks[0]?.[0];
  const spread = bestBid && bestAsk ? bestAsk - bestBid : 0;
  const spreadPct = bestAsk ? (spread / bestAsk) * 100 : 0;

  const lastTone =
    book.last != null && book.prevLast != null
      ? book.last > book.prevLast
        ? "up"
        : book.last < book.prevLast
          ? "down"
          : "flat"
      : "flat";

  const showAsks = depthView === "both" || depthView === "ask";
  const showBids = depthView === "both" || depthView === "bid";
  // 단일 view 모드일 때 행 수 늘리기
  const askRows = depthView === "ask" ? groupedAsks : groupedAsks.slice(0, 12);
  const bidRows = depthView === "bid" ? groupedBids : groupedBids.slice(0, 12);

  return (
    <>
      {/* Column header */}
      <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-border/30 px-3 py-1 text-[9px] uppercase tracking-wider text-muted-foreground/70">
        <span>가격 (USDT)</span>
        <span className="text-right">수량</span>
        <span className="text-right">누적</span>
      </div>

      {/* Asks */}
      {showAsks ? (
        <div className="px-1 py-1">
          {askRows.length === 0 ? (
            <div className="px-2 py-3 text-center text-[10px] text-muted-foreground">로딩...</div>
          ) : (
            [...askRows].reverse().map((a, i) => {
              const cumIdx = askRows.length - 1 - i;
              return (
                <OrderbookRow
                  key={`a${i}`}
                  price={a[0]}
                  qty={a[1]}
                  cum={askCum[cumIdx]}
                  maxCum={maxCum}
                  side="ask"
                />
              );
            })
          )}
        </div>
      ) : null}

      {/* Mid: last price + spread */}
      <div
        className={cn(
          "border-y border-border/40 px-3 py-2",
          lastTone === "up" && "bg-grade-a/5",
          lastTone === "down" && "bg-grade-d/5",
        )}
      >
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "font-mono text-base font-bold tabular-nums",
              lastTone === "up" ? "text-grade-a" : lastTone === "down" ? "text-grade-d" : "text-foreground",
            )}
          >
            {book.last != null ? formatNumber(book.last) : "—"}
          </span>
          <span className="text-right">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">스프레드</div>
            <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {spread > 0 ? formatNumber(spread, { maximumFractionDigits: 2 }) : "—"}
              {spreadPct > 0 ? <span className="ml-1">({spreadPct.toFixed(3)}%)</span> : null}
            </div>
          </span>
        </div>
      </div>

      {/* Bids */}
      {showBids ? (
        <div className="px-1 py-1">
          {bidRows.length === 0 ? (
            <div className="px-2 py-3 text-center text-[10px] text-muted-foreground">로딩...</div>
          ) : (
            bidRows.map((b, i) => (
              <OrderbookRow key={`b${i}`} price={b[0]} qty={b[1]} cum={bidCum[i]} maxCum={maxCum} side="bid" />
            ))
          )}
        </div>
      ) : null}

      {/* B/S ratio bar */}
      <div className="border-t border-border/40 px-3 py-1.5">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="font-bold text-grade-a">B</span>
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-grade-d/20">
            <div
              className="absolute inset-y-0 left-0 bg-grade-a transition-all"
              style={{ width: `${bidPct}%` }}
            />
          </div>
          <span className="font-bold text-grade-d">S</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[10px] font-mono tabular-nums">
          <span className="text-grade-a">{bidPct.toFixed(2)}%</span>
          <span className="text-grade-d">{askPct.toFixed(2)}%</span>
        </div>
      </div>
    </>
  );
}

function OrderbookRow({
  price,
  qty,
  cum,
  maxCum,
  side,
}: {
  price: number;
  qty: number;
  cum: number;
  maxCum: number;
  side: "ask" | "bid";
}) {
  const pct = Math.min(100, (cum / maxCum) * 100);
  const isAsk = side === "ask";
  return (
    <div className="relative grid grid-cols-[1fr_1fr_1fr] items-center px-2 py-[1px] text-[11px] tabular-nums transition-colors hover:bg-muted/30">
      <div
        className={cn(
          "absolute inset-y-0 transition-all",
          isAsk ? "right-0 bg-grade-d/15" : "left-0 bg-grade-a/15",
        )}
        style={{ width: `${pct}%` }}
      />
      <span className={cn("relative font-mono font-medium", isAsk ? "text-grade-d" : "text-grade-a")}>
        {formatNumber(price, { maximumFractionDigits: 2 })}
      </span>
      <span className="relative text-right font-mono text-foreground/90">
        {formatNumber(qty, { maximumFractionDigits: 3 })}
      </span>
      <span className="relative text-right font-mono text-muted-foreground/70">
        {formatNumber(cum, { maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}

function MarketTradesContent({ symbol }: { symbol: string }) {
  const [trades, setTrades] = useState<Array<{ time: number; price: number; qty: number; isBuy: boolean }>>([]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const r = await fetch(`https://fapi.binance.com/fapi/v1/trades?symbol=${symbol}&limit=30`);
        const arr = (await r.json()) as Array<{
          time: number;
          price: string;
          qty: string;
          isBuyerMaker: boolean;
        }>;
        if (!alive) return;
        // isBuyerMaker=true → seller takes the trade (sell-side market trade)
        const parsed = arr
          .map((t) => ({
            time: t.time,
            price: parseFloat(t.price),
            qty: parseFloat(t.qty),
            isBuy: !t.isBuyerMaker,
          }))
          .reverse(); // newest first
        setTrades(parsed);
      } catch {
        /* skip */
      } finally {
        if (alive) timer = setTimeout(tick, 2000);
      }
    }
    tick();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [symbol]);

  return (
    <>
      <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-border/30 px-3 py-1 text-[9px] uppercase tracking-wider text-muted-foreground/70">
        <span>가격</span>
        <span className="text-right">수량</span>
        <span className="text-right">시간</span>
      </div>
      <div className="max-h-[480px] overflow-y-auto px-1 py-1">
        {trades.length === 0 ? (
          <div className="px-2 py-3 text-center text-[10px] text-muted-foreground">로딩...</div>
        ) : (
          trades.map((t, i) => {
            const d = new Date(t.time);
            const hh = String(d.getHours()).padStart(2, "0");
            const mm = String(d.getMinutes()).padStart(2, "0");
            const ss = String(d.getSeconds()).padStart(2, "0");
            return (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr_1fr] items-center px-2 py-[1px] text-[11px] tabular-nums transition-colors hover:bg-muted/30"
              >
                <span className={cn("font-mono font-medium", t.isBuy ? "text-grade-a" : "text-grade-d")}>
                  {formatNumber(t.price, { maximumFractionDigits: 2 })}
                </span>
                <span className="text-right font-mono text-foreground/90">
                  {formatNumber(t.qty, { maximumFractionDigits: 4 })}
                </span>
                <span className="text-right font-mono text-muted-foreground/70">
                  {hh}:{mm}:{ss}
                </span>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

// ─── Order Panel ─────────────────────────────────────────────────────────
function OrderPanel({ symbol, wallet }: { symbol: string; wallet: Wallet }) {
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [orderType, setOrderType] = useState<"limit" | "market" | "tpsl">("market");
  const [leverage, setLeverage] = useState(5);
  const [price, setPrice] = useState(""); // Limit 가격
  const [qty, setQty] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [tpslEnabled, setTpslEnabled] = useState(false);
  const [accountPct, setAccountPct] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  // Latest price (kept fresh by orderbook poll elsewhere, but we fetch our own to avoid prop drilling)
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function tick() {
      try {
        const r = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
        const j = (await r.json()) as { price: string };
        if (!alive) return;
        setLastPrice(parseFloat(j.price));
      } catch {}
      finally {
        if (alive) timer = setTimeout(tick, 3000);
      }
    }
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [symbol]);

  // Derived
  const qtyNum = Number(qty) || 0;
  const notional = lastPrice != null ? lastPrice * qtyNum : 0;
  const margin = leverage > 0 ? notional / leverage : 0;
  const baseSym = symbol.replace("USDT", "");

  // Auto-fill quantity from account-% slider
  function applyAccountPct(pct: number) {
    setAccountPct(pct);
    if (lastPrice == null) return;
    // exposure = wallet.available * pct% * leverage
    const exposure = wallet.available * (pct / 100) * leverage;
    const q = exposure / lastPrice;
    setQty(q > 0 ? q.toFixed(4) : "");
  }

  function submit() {
    if (qtyNum <= 0) {
      toast.error("수량을 입력하세요.");
      return;
    }
    if (margin > wallet.available) {
      toast.error(`가상 잔액 부족 — 필요 $${margin.toFixed(2)}, 가능 $${wallet.available.toFixed(2)}`);
      return;
    }
    startTransition(async () => {
      const r = await placeVirtualOrderAction({
        symbol,
        direction,
        quantity: qtyNum,
        leverage,
        stop: stop ? Number(stop) : undefined,
        target: target ? Number(target) : undefined,
      });
      if (!r.ok) {
        toast.error(r.error ?? "주문 실패");
        return;
      }
      toast.success(`${direction === "long" ? "롱" : "숏"} 진입 완료 · 체결가 $${formatNumber(r.fillPrice ?? 0)} · 마진 $${formatNumber(r.margin ?? 0)}`);
      setQty("");
      setStop("");
      setTarget("");
    });
  }

  // Effective price for calc (limit이면 입력가, market이면 lastPrice)
  const effectivePrice = orderType === "limit" && price ? Number(price) : lastPrice;

  // Recompute derived metrics with effective price
  const _qtyNum = Number(qty) || 0;
  const _notional = effectivePrice != null ? effectivePrice * _qtyNum : 0;
  const _margin = leverage > 0 ? _notional / leverage : 0;

  // Total (USDT) — Amount × Price 자동 계산 표시
  const totalUsdt = _notional;

  // R:R / 이동 % 계산
  const stopMovePct =
    effectivePrice && stop && Number(stop) > 0
      ? (Math.abs(effectivePrice - Number(stop)) / effectivePrice) * 100
      : 0;
  const targetMovePct =
    effectivePrice && target && Number(target) > 0
      ? (Math.abs(Number(target) - effectivePrice) / effectivePrice) * 100
      : 0;
  const rr =
    stopMovePct > 0 && targetMovePct > 0 ? targetMovePct / stopMovePct : 0;

  const buttonTone = direction === "long" ? "long" : "short";
  const buttonLabel = pending
    ? "주문 처리 중..."
    : _margin > wallet.available && _margin > 0
      ? "잔액 부족"
      : _qtyNum <= 0
        ? "수량 입력"
        : `${baseSym} ${direction === "long" ? "매수" : "매도"}`;

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-3 p-3">
        {/* 매수/매도 큰 토글 */}
        <div className="grid grid-cols-2 overflow-hidden rounded-md">
          <button
            type="button"
            onClick={() => setDirection("long")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold transition-all",
              direction === "long"
                ? "bg-grade-a text-white"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/60",
            )}
          >
            매수
          </button>
          <button
            type="button"
            onClick={() => setDirection("short")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold transition-all",
              direction === "short"
                ? "bg-grade-d text-white"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/60",
            )}
          >
            매도
          </button>
        </div>

        {/* 주문 유형 sub-tab */}
        <div className="flex items-center gap-4 border-b border-border/40 pb-1.5">
          {(["limit", "market", "tpsl"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                if (t === "limit") return; // 지정가는 준비 중
                if (t === "tpsl") {
                  setTpslEnabled(!tpslEnabled);
                  return;
                }
                setOrderType(t);
              }}
              disabled={t === "limit"}
              className={cn(
                "relative pb-1.5 text-xs font-medium transition-colors",
                t === "tpsl"
                  ? tpslEnabled
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                  : orderType === t
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                t === "limit" && "cursor-not-allowed opacity-40",
              )}
              title={t === "limit" ? "지정가는 준비 중" : ""}
            >
              {t === "limit" ? "지정가" : t === "market" ? "시장가" : "TP/SL"}
              {(t === "tpsl" ? tpslEnabled : orderType === t) ? (
                <span className="absolute -bottom-1.5 left-0 right-0 h-0.5 bg-primary" />
              ) : null}
              {t === "limit" ? (
                <span className="ml-1 rounded bg-muted/50 px-1 py-0.5 text-[8px] uppercase">준비중</span>
              ) : null}
            </button>
          ))}
        </div>

        {/* 잔액 표시 */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">사용 가능</span>
          <span className="font-mono font-semibold tabular-nums">
            {formatNumber(wallet.available, { maximumFractionDigits: 2 })} USDT
          </span>
        </div>

        {/* Price (Limit일 때만 활성) */}
        {orderType === "limit" ? (
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">가격 (USDT)</span>
            </div>
            <Input
              type="number"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={lastPrice ? String(lastPrice.toFixed(2)) : "—"}
              className="font-mono"
            />
          </div>
        ) : (
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">가격</span>
              <span className="text-muted-foreground/60">시장가 — 현재가 즉시 체결</span>
            </div>
            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 font-mono text-sm tabular-nums">
              {lastPrice ? `${formatNumber(lastPrice)} USDT` : "—"}
            </div>
          </div>
        )}

        {/* Amount */}
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">수량 ({baseSym})</span>
          </div>
          <Input
            type="number"
            inputMode="decimal"
            value={qty}
            onChange={(e) => {
              setQty(e.target.value);
              setAccountPct(null);
            }}
            placeholder="0.0000"
            className="font-mono"
          />
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={accountPct ?? 0}
            onChange={(e) => applyAccountPct(Number(e.target.value))}
            className="mt-2 w-full accent-primary"
          />
          <div className="mt-0.5 grid grid-cols-5 text-[10px] text-muted-foreground/70">
            {[0, 25, 50, 75, 100].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyAccountPct(p)}
                className={cn(
                  "text-center hover:text-foreground",
                  accountPct === p && "text-primary",
                )}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>

        {/* Total (USDT) */}
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">총액 (USDT)</span>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 font-mono text-sm tabular-nums text-muted-foreground">
            {totalUsdt > 0 ? formatNumber(totalUsdt, { maximumFractionDigits: 2 }) : "—"}
          </div>
        </div>

        {/* 레버리지 */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">레버리지</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums",
                leverage >= 20
                  ? "bg-grade-d/15 text-grade-d"
                  : leverage >= 10
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-primary/15 text-primary",
              )}
            >
              {leverage}×
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={50}
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="mt-1.5 grid grid-cols-6 gap-1">
            {LEVERAGE_PRESETS.map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setLeverage(lv)}
                className={cn(
                  "rounded border py-0.5 text-[10px] font-medium transition-colors",
                  leverage === lv
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border bg-background/30 text-muted-foreground hover:border-border/80 hover:text-foreground",
                )}
              >
                {lv}×
              </button>
            ))}
          </div>
        </div>

        {/* TP/SL 확장 영역 */}
        {tpslEnabled ? (
          <div className="space-y-2 rounded-md border border-border/40 bg-background/30 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">TP / SL</span>
              <button
                type="button"
                onClick={() => setTpslEnabled(false)}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                닫기
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] text-grade-d">손절가</span>
                  {stopMovePct > 0 ? (
                    <span className="text-[9px] font-mono text-muted-foreground">{stopMovePct.toFixed(2)}%</span>
                  ) : null}
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={stop}
                  onChange={(e) => setStop(e.target.value)}
                  placeholder={
                    effectivePrice
                      ? formatNumber(effectivePrice * (direction === "long" ? 0.98 : 1.02), { maximumFractionDigits: 2 })
                      : "—"
                  }
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] text-grade-a">목표가</span>
                  {rr > 0 ? (
                    <span className="text-[9px] font-mono text-muted-foreground">{rr.toFixed(2)}R</span>
                  ) : null}
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={
                    effectivePrice
                      ? formatNumber(effectivePrice * (direction === "long" ? 1.04 : 0.96), { maximumFractionDigits: 2 })
                      : "—"
                  }
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* 진입 버튼 */}
        <Button
          type="button"
          onClick={submit}
          disabled={pending || _qtyNum <= 0 || (_margin > 0 && _margin > wallet.available)}
          className={cn(
            "w-full font-bold transition-all",
            buttonTone === "long"
              ? "bg-grade-a hover:bg-grade-a/90"
              : "bg-grade-d hover:bg-grade-d/90",
          )}
          size="lg"
        >
          {buttonLabel}
        </Button>

        {/* 주문 요약 정보 */}
        <div className="space-y-1 rounded-md border border-border/30 bg-background/20 p-2.5 text-[10px]">
          <Row
            label="예상 체결가"
            value={lastPrice ? `${formatNumber(lastPrice)} USDT` : "—"}
            mono
          />
          <Row
            label="노출 금액"
            value={_notional > 0 ? `${formatNumber(_notional, { maximumFractionDigits: 2 })} USDT` : "—"}
            mono
          />
          <Row
            label="필요 마진"
            value={_margin > 0 ? `${formatNumber(_margin, { maximumFractionDigits: 2 })} USDT` : "—"}
            tone={_margin > wallet.available && _margin > 0 ? "bad" : "default"}
            mono
          />
          <div className="my-1.5 border-t border-border/30" />
          <Row label="수수료 (Taker)" value="0.05%" mono />
        </div>

        {/* 지갑 영역 */}
        <div className="rounded-md border border-border/30 bg-background/20 p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">지갑</span>
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              잔액 ${formatNumber(wallet.usdtBalance, { maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Link
              href="/app/virtual-trade/wallet"
              className="rounded-md border border-border bg-background/40 py-1.5 text-center text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              자금 추가
            </Link>
            <Link
              href="/app/virtual-trade/wallet"
              className="rounded-md border border-border bg-background/40 py-1.5 text-center text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              지갑 관리
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, tone, mono }: { label: string; value: string; tone?: "default" | "bad"; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums font-medium",
          mono && "font-mono",
          tone === "bad" ? "text-grade-d" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Positions / History Tabs ───────────────────────────────────────────
function PositionsTabs({
  tab,
  onTabChange,
  positions,
}: {
  tab: "positions" | "history";
  onTabChange: (t: "positions" | "history") => void;
  positions: Position[];
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="mb-3 flex gap-3 border-b border-border/40">
          <TabButton active={tab === "positions"} onClick={() => onTabChange("positions")}>
            진행 중 포지션 ({positions.length})
          </TabButton>
          <TabButton active={tab === "history"} onClick={() => onTabChange("history")}>
            거래 내역
          </TabButton>
        </div>
        {tab === "positions" ? (
          positions.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">진행 중 포지션이 없습니다.</div>
          ) : (
            <PositionsTable positions={positions} />
          )
        ) : (
          <div className="py-6 text-center text-xs text-muted-foreground">
            <Link href="/app/journal" className="text-primary underline-offset-2 hover:underline">
              내 거래 페이지
            </Link>
            에서 전체 종료 거래를 확인하세요.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-b-2 px-2 pb-2 text-xs font-semibold transition-colors",
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function PositionsTable({ positions }: { positions: Position[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-[9px] uppercase tracking-wider text-muted-foreground/70">
          <tr className="border-b border-border/40">
            <th className="px-3 py-2 text-left font-medium">심볼 / 방향</th>
            <th className="px-3 py-2 text-right font-medium">수량 / 마진</th>
            <th className="px-3 py-2 text-right font-medium">진입가 → 현재가</th>
            <th className="px-3 py-2 text-right font-medium">미실현 PnL</th>
            <th className="px-3 py-2 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <PositionRow key={p.id} pos={p} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PositionRow({ pos }: { pos: Position }) {
  const [last, setLast] = useState<number | null>(null);
  const [closing, startCloseTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function tick() {
      try {
        const r = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${pos.symbol}`);
        const j = (await r.json()) as { price: string };
        if (!alive) return;
        setLast(parseFloat(j.price));
      } catch {}
      finally {
        if (alive) timer = setTimeout(tick, 5000);
      }
    }
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [pos.symbol]);

  const movement = last != null ? (pos.direction === "long" ? last - pos.entryActual : pos.entryActual - last) : 0;
  const pnl = movement * pos.qty;
  const pnlPct = last != null && pos.entryActual > 0 ? (movement / pos.entryActual) * 100 : 0;
  const inProfit = pnl > 0;
  const isLong = pos.direction === "long";
  const baseSym = pos.symbol.replace("USDT", "");

  function close() {
    if (!confirm(`${pos.symbol} ${isLong ? "롱" : "숏"} 포지션을 즉시 청산하시겠습니까?`)) return;
    startCloseTransition(async () => {
      const r = await closeVirtualPositionAction(pos.id);
      if (!r.ok) {
        toast.error(r.error ?? "청산 실패");
        return;
      }
      toast.success(`청산 완료 · PnL ${r.pnl && r.pnl >= 0 ? "+" : ""}${formatCurrency(r.pnl ?? 0, "USD")}`);
    });
  }

  return (
    <tr className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn("h-7 w-0.5 rounded", isLong ? "bg-grade-a" : "bg-grade-d")}
          />
          <div>
            <div className="font-mono text-xs font-semibold">{pos.symbol}</div>
            <div className={cn("text-[10px] font-medium uppercase", isLong ? "text-grade-a" : "text-grade-d")}>
              {isLong ? "롱" : "숏"}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="font-mono text-xs font-medium tabular-nums">
          {formatNumber(pos.qty, { maximumFractionDigits: 4 })} {baseSym}
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          마진 ${formatNumber(pos.margin, { maximumFractionDigits: 2 })}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="font-mono text-xs tabular-nums">
          <span className="text-muted-foreground">${formatNumber(pos.entryActual)}</span>
          <span className="mx-1 text-muted-foreground/60">→</span>
          <span className="font-semibold">{last != null ? `$${formatNumber(last)}` : "—"}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right">
        {last != null ? (
          <>
            <div
              className={cn(
                "font-mono text-sm font-bold tabular-nums",
                inProfit ? "text-grade-a" : "text-grade-d",
              )}
            >
              {pnl >= 0 ? "+" : ""}
              {formatCurrency(pnl, "USD")}
            </div>
            <div
              className={cn(
                "text-[10px] font-mono tabular-nums",
                inProfit ? "text-grade-a/70" : "text-grade-d/70",
              )}
            >
              {pnlPct >= 0 ? "+" : ""}
              {pnlPct.toFixed(2)}%
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        <button
          type="button"
          onClick={close}
          disabled={closing}
          className="inline-flex items-center gap-1 rounded-md border border-grade-d/30 bg-grade-d/10 px-2.5 py-1 text-[11px] font-semibold text-grade-d transition-colors hover:border-grade-d/60 hover:bg-grade-d/20 disabled:opacity-50"
        >
          <X className="h-3 w-3" />
          {closing ? "..." : "청산"}
        </button>
      </td>
    </tr>
  );
}
