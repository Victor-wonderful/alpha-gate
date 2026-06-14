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
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type CandlestickData,
  type LineData,
  type HistogramData,
  type Time,
} from "lightweight-charts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import {
  cancelLimitOrderAction,
  closeVirtualPositionAction,
  placeVirtualOrderAction,
} from "./order-actions";

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
  leverage: number;
  feesPct: number;
  createdAt: string;
  timeframe: string;
  extendedUntil: string | null;
  marketType: "futures" | "spot";
};

// resolve-trades/route.ts 의 TIMEOUT_MS 와 반드시 일치.
const POSITION_TIMEOUT_MS: Record<string, number> = {
  "15m": 24 * 60 * 60_000, // 24h
  "1h": 4 * 24 * 60 * 60_000, // 4d
  "4h": 14 * 24 * 60 * 60_000, // 14d
  "1D": 60 * 24 * 60 * 60_000, // 60d
};

type PendingOrder = {
  id: string;
  symbol: string;
  direction: "long" | "short";
  limitPrice: number;
  quantity: number;
  leverage: number;
  stop: number | null;
  target: number | null;
  kind: "limit" | "stop";
  expiresAt: string;
  createdAt: string;
};

export function ExchangeUI({
  initialSymbol,
  wallet,
  positions,
  pendingOrders = [],
}: {
  initialSymbol: string;
  wallet: Wallet;
  positions: Position[];
  pendingOrders?: PendingOrder[];
}) {
  const [symbol, setSymbol] = useState<string>(initialSymbol);
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>("1h");
  const [tab, setTab] = useState<"positions" | "orders" | "history">("positions");
  const [marketType, setMarketType] = useState<"futures" | "spot">("futures");

  return (
    <div className="space-y-3">
      <ExchangeHeader symbol={symbol} onSymbolChange={setSymbol} wallet={wallet} positions={positions} />

      {/* 시장 종류 토글 — Futures / Spot */}
      <div className="inline-flex gap-1 rounded-md border border-border bg-background/40 p-0.5">
        <button
          type="button"
          onClick={() => setMarketType("futures")}
          className={cn(
            "rounded px-4 py-1.5 text-xs font-semibold transition-colors",
            marketType === "futures"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
          )}
          title="USDT-M 무기한 선물 (롱·숏·레버리지)"
        >
          🌐 선물
        </button>
        <button
          type="button"
          onClick={() => setMarketType("spot")}
          className={cn(
            "rounded px-4 py-1.5 text-xs font-semibold transition-colors",
            marketType === "spot"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
          )}
          title="현물 (매수만 · 1x · 청산 없음 · 펀딩 없음 · 수수료 0.2%)"
        >
          💎 현물
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_300px_320px] lg:grid-rows-[auto_auto]">
        {/* Chart */}
        <ChartArea symbol={symbol} timeframe={timeframe} onTimeframeChange={setTimeframe} />

        {/* Orderbook (matches chart height) */}
        <OrderbookPanel symbol={symbol} />

        {/* Order entry — spans both rows on the right */}
        <div className="lg:row-span-2 lg:col-start-3 lg:row-start-1">
          <div className="h-full">
            <OrderPanel symbol={symbol} wallet={wallet} marketType={marketType} />
          </div>
        </div>

        {/* Positions / orders / history — spans chart + orderbook columns */}
        <div className="lg:col-span-2 lg:col-start-1 lg:row-start-2">
          <PositionsTabs tab={tab} onTabChange={setTab} positions={positions} pendingOrders={pendingOrders} />
        </div>
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
function timeToUnixSeconds(t: Time): number {
  if (typeof t === "number") return t;
  if (typeof t === "string") {
    const d = new Date(t).getTime();
    return Number.isFinite(d) ? d / 1000 : 0;
  }
  // BusinessDay object
  if (typeof t === "object" && t !== null && "year" in t) {
    const bd = t as { year: number; month: number; day: number };
    return Date.UTC(bd.year, bd.month - 1, bd.day) / 1000;
  }
  return 0;
}

function calcMA(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    out.push(sum / period);
  }
  return out;
}

type ChartHeaderData = {
  time: number; // seconds (lightweight-charts Time)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  changePct: number;
  rangePct: number;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
};

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
  const [header, setHeader] = useState<ChartHeaderData | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgb(148 163 184)",
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.05)" },
        horzLines: { color: "rgba(148, 163, 184, 0.05)" },
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.1)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
      },
      rightPriceScale: { borderColor: "rgba(148, 163, 184, 0.1)" },
      crosshair: { mode: 0 }, // normal crosshair
      width: container.clientWidth,
      height: container.clientHeight,
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "rgb(74 222 128)",
      downColor: "rgb(248 113 113)",
      borderUpColor: "rgb(74 222 128)",
      borderDownColor: "rgb(248 113 113)",
      wickUpColor: "rgb(74 222 128)",
      wickDownColor: "rgb(248 113 113)",
    });

    // MA lines
    const ma5Series = chart.addSeries(LineSeries, {
      color: "rgb(250 204 21)", // yellow
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ma10Series = chart.addSeries(LineSeries, {
      color: "rgb(168 85 247)", // purple
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ma20Series = chart.addSeries(LineSeries, {
      color: "rgb(244 114 182)", // pink
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Volume histogram (separate pane via priceScaleId)
    const volSeries = chart.addSeries(HistogramSeries, {
      color: "rgba(148, 163, 184, 0.4)",
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    let alive = true;
    setLoading(true);
    fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=300`)
      .then((r) => r.json())
      .then((arr: unknown) => {
        if (!alive) return;
        if (!Array.isArray(arr)) return;
        const rows = arr as unknown[][];
        const candles: CandlestickData<Time>[] = [];
        const closes: number[] = [];
        const volumes: HistogramData<Time>[] = [];

        for (const k of rows) {
          const time = (Number(k[0]) / 1000) as Time;
          const open = parseFloat(k[1] as string);
          const high = parseFloat(k[2] as string);
          const low = parseFloat(k[3] as string);
          const close = parseFloat(k[4] as string);
          const volume = parseFloat(k[5] as string);
          candles.push({ time, open, high, low, close });
          closes.push(close);
          volumes.push({
            time,
            value: volume,
            color: close >= open ? "rgba(74, 222, 128, 0.35)" : "rgba(248, 113, 113, 0.35)",
          });
        }

        candleSeries.setData(candles);
        volSeries.setData(volumes);

        // MA lines
        const ma5 = calcMA(closes, 5);
        const ma10 = calcMA(closes, 10);
        const ma20 = calcMA(closes, 20);

        const toLine = (vals: (number | null)[]): LineData<Time>[] =>
          candles
            .map((c, i) => ({ time: c.time, value: vals[i] }))
            .filter((d): d is LineData<Time> => d.value != null);

        ma5Series.setData(toLine(ma5));
        ma10Series.setData(toLine(ma10));
        ma20Series.setData(toLine(ma20));

        chart.timeScale().fitContent();

        // Set initial header to last candle
        const last = candles[candles.length - 1];
        const first = candles[candles.length - 2] ?? last;
        const lastIdx = candles.length - 1;
        if (last && first) {
          setHeader({
            time: timeToUnixSeconds(last.time),
            open: last.open,
            high: last.high,
            low: last.low,
            close: last.close,
            volume: volumes[lastIdx]?.value ?? 0,
            changePct: ((last.close - first.close) / first.close) * 100,
            rangePct: ((last.high - last.low) / last.low) * 100,
            ma5: ma5[lastIdx],
            ma10: ma10[lastIdx],
            ma20: ma20[lastIdx],
          });
        }

        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Crosshair → update header to hovered bar
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) return;
      const candleData = param.seriesData.get(candleSeries) as CandlestickData<Time> | undefined;
      const volData = param.seriesData.get(volSeries) as HistogramData<Time> | undefined;
      const ma5Data = param.seriesData.get(ma5Series) as LineData<Time> | undefined;
      const ma10Data = param.seriesData.get(ma10Series) as LineData<Time> | undefined;
      const ma20Data = param.seriesData.get(ma20Series) as LineData<Time> | undefined;
      if (!candleData) return;
      setHeader({
        time: timeToUnixSeconds(param.time),
        open: candleData.open,
        high: candleData.high,
        low: candleData.low,
        close: candleData.close,
        volume: volData?.value ?? 0,
        changePct: candleData.open > 0 ? ((candleData.close - candleData.open) / candleData.open) * 100 : 0,
        rangePct: candleData.low > 0 ? ((candleData.high - candleData.low) / candleData.low) * 100 : 0,
        ma5: ma5Data?.value ?? null,
        ma10: ma10Data?.value ?? null,
        ma20: ma20Data?.value ?? null,
      });
    });

    let lastW = container.clientWidth;
    let lastH = container.clientHeight;
    let rafId: number | null = null;
    const ro = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!chartRef.current || !container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w === lastW && h === lastH) return;
        lastW = w;
        lastH = h;
        chartRef.current.applyOptions({ width: w, height: h });
      });
    });
    ro.observe(container);

    return () => {
      alive = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [symbol, timeframe]);

  return (
    <Card className="flex flex-col" style={{ height: 540 }}>
      <CardContent className="flex flex-1 flex-col p-3">
        {/* Top row: symbol + TF picker */}
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <div className="text-xs font-semibold text-foreground">
            {symbol} <span className="text-muted-foreground">· {timeframe.toUpperCase()}</span>
          </div>
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

        {/* OHLCV header row */}
        {header ? (
          <div className="mb-2 flex h-7 shrink-0 items-center gap-x-3 overflow-x-auto whitespace-nowrap border-y border-border/30 text-[10px] font-mono tabular-nums">
            <span className="text-muted-foreground/90">
              {new Date(header.time * 1000).toLocaleString("ko-KR", {
                year: "2-digit",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </span>
            <span className="text-muted-foreground/40">|</span>
            <HeaderCell label="시" value={header.open} />
            <HeaderCell label="고" value={header.high} tone="up" />
            <HeaderCell label="저" value={header.low} tone="down" />
            <HeaderCell label="종" value={header.close} />
            <HeaderCell
              label="변동"
              value={`${header.changePct >= 0 ? "+" : ""}${header.changePct.toFixed(2)}%`}
              tone={header.changePct >= 0 ? "up" : "down"}
              raw
            />
            <HeaderCell
              label="범위"
              value={`${header.rangePct.toFixed(2)}%`}
              raw
            />
            <HeaderCell
              label="거래량"
              value={formatNumber(header.volume, { maximumFractionDigits: 0 })}
              raw
            />
            <div className="ml-auto flex gap-3">
              {header.ma5 != null ? (
                <span className="text-[10px]">
                  <span className="text-yellow-300/90">MA5</span>{" "}
                  <span className="font-mono tabular-nums">{formatNumber(header.ma5, { maximumFractionDigits: 2 })}</span>
                </span>
              ) : null}
              {header.ma10 != null ? (
                <span className="text-[10px]">
                  <span className="text-purple-400/90">MA10</span>{" "}
                  <span className="font-mono tabular-nums">{formatNumber(header.ma10, { maximumFractionDigits: 2 })}</span>
                </span>
              ) : null}
              {header.ma20 != null ? (
                <span className="text-[10px]">
                  <span className="text-pink-400/90">MA20</span>{" "}
                  <span className="font-mono tabular-nums">{formatNumber(header.ma20, { maximumFractionDigits: 2 })}</span>
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        <div ref={containerRef} className="relative min-h-0 w-full flex-1">
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

function HeaderCell({
  label,
  value,
  tone,
  raw,
}: {
  label: string;
  value: number | string;
  tone?: "up" | "down";
  raw?: boolean;
}) {
  const displayValue = raw ? String(value) : formatNumber(value as number, { maximumFractionDigits: 2 });
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-muted-foreground/70">{label}</span>
      <span
        className={cn(
          "font-mono tabular-nums",
          tone === "up" && "text-grade-a",
          tone === "down" && "text-grade-d",
        )}
      >
        {displayValue}
      </span>
    </span>
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
    <Card className="flex flex-col" style={{ height: 540 }}>
      <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
        {/* Tab header */}
        <div className="flex shrink-0 items-center border-b border-border/40 px-3 py-2">
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
          fetch(`https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=50`),
          fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`),
        ]);
        if (!depthR.ok || !priceR.ok) {
          console.warn("[orderbook] HTTP status", { depth: depthR.status, price: priceR.status });
          return;
        }
        const depth = (await depthR.json()) as { bids?: [string, string][]; asks?: [string, string][] };
        const price = (await priceR.json()) as { price?: string };
        if (!alive) return;
        if (!depth?.bids || !depth?.asks || !price?.price) {
          console.warn("[orderbook] unexpected response shape", { depth, price });
          return;
        }
        setBook((prev) => ({
          bids: depth.bids!.map((b) => [parseFloat(b[0]), parseFloat(b[1])]),
          asks: depth.asks!.map((a) => [parseFloat(a[0]), parseFloat(a[1])]),
          last: parseFloat(price.price!),
          prevLast: prev.last,
        }));
      } catch (err) {
        console.error("[orderbook] fetch failed", err);
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
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Column header */}
      <div className="shrink-0 grid grid-cols-[1fr_1fr_1fr] border-b border-border/30 px-3 py-1 text-[9px] uppercase tracking-wider text-muted-foreground/70">
        <span>가격 (vUSDT)</span>
        <span className="text-right">수량</span>
        <span className="text-right">누적</span>
      </div>

      {/* Asks */}
      {showAsks ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
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
          "shrink-0 border-y border-border/40 px-3 py-2",
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
        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
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
      <div className="shrink-0 border-t border-border/40 px-3 py-1.5">
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
    </div>
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
        }> | { code?: number; msg?: string };
        if (!alive) return;
        if (!Array.isArray(arr)) return; // API 일시 오류
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 grid grid-cols-[1fr_1fr_1fr] border-b border-border/30 px-3 py-1 text-[9px] uppercase tracking-wider text-muted-foreground/70">
        <span>가격</span>
        <span className="text-right">수량</span>
        <span className="text-right">시간</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
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
    </div>
  );
}

// ─── Order Panel ─────────────────────────────────────────────────────────
function OrderPanel({
  symbol,
  wallet,
  marketType,
}: {
  symbol: string;
  wallet: Wallet;
  marketType: "futures" | "spot";
}) {
  const isSpot = marketType === "spot";
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [orderType, setOrderType] = useState<"limit" | "market" | "stop" | "tpsl">("market");
  const [leverage, setLeverage] = useState(5);

  // Spot 모드 진입 시 강제 정렬: 매수만 + 1x.
  useEffect(() => {
    if (isSpot) {
      setDirection("long");
      setLeverage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpot]);
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
    if (orderType === "limit" && (!price || Number(price) <= 0)) {
      toast.error("지정가를 입력하세요.");
      return;
    }
    if (orderType === "stop") {
      if (!price || Number(price) <= 0) {
        toast.error("트리거가를 입력하세요.");
        return;
      }
      if (lastPrice && direction === "long" && Number(price) <= lastPrice) {
        toast.error("역지정가 롱은 트리거가가 현재가보다 높아야 합니다.");
        return;
      }
      if (lastPrice && direction === "short" && Number(price) >= lastPrice) {
        toast.error("역지정가 숏은 트리거가가 현재가보다 낮아야 합니다.");
        return;
      }
    }
    if (orderType === "market" && margin > wallet.available) {
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
        orderType: orderType === "limit" ? "limit" : orderType === "stop" ? "stop" : "market",
        limitPrice: orderType === "limit" || orderType === "stop" ? Number(price) : undefined,
        marketType,
      });
      if (!r.ok) {
        toast.error(r.error ?? "주문 실패");
        return;
      }
      if (r.orderType === "limit") {
        toast.success(
          `지정가 주문 등록 · ${direction === "long" ? "롱" : "숏"} ${symbol} @ $${formatNumber(r.limitPrice ?? 0)} · 24시간 내 미체결 시 만료`,
        );
      } else if (r.orderType === "stop") {
        toast.success(
          `역지정가 주문 등록 · ${direction === "long" ? "롱" : "숏"} ${symbol} @ 트리거 $${formatNumber(r.limitPrice ?? 0)} · 도달 시 추격 진입`,
        );
      } else {
        toast.success(`${direction === "long" ? "롱" : "숏"} 진입 완료 · 체결가 $${formatNumber(r.fillPrice ?? 0)} · 마진 $${formatNumber(r.margin ?? 0)}`);
      }
      setQty("");
      setStop("");
      setTarget("");
      setPrice("");
    });
  }

  // Effective price for calc (limit이면 입력가, market이면 lastPrice)
  const effectivePrice = (orderType === "limit" || orderType === "stop") && price ? Number(price) : lastPrice;

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
    <Card className="h-full overflow-hidden">
      <CardContent className="flex h-full flex-col gap-3 overflow-y-auto p-3">
        {/* 매수/매도 큰 토글 */}
        {isSpot ? (
          /* 현물은 매수만 */
          <button
            type="button"
            className="w-full rounded-md bg-grade-a py-2.5 text-sm font-bold text-white"
            disabled
          >
            매수 (현물)
          </button>
        ) : (
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
        )}

        {/* 주문 유형 sub-tab */}
        <div className="flex items-center gap-4 border-b border-border/40 pb-1.5">
          {(["limit", "market", "stop", "tpsl"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                if (t === "tpsl") {
                  setTpslEnabled(!tpslEnabled);
                  return;
                }
                setOrderType(t);
              }}
              className={cn(
                "relative pb-1.5 text-xs font-medium transition-colors",
                t === "tpsl"
                  ? tpslEnabled
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                  : orderType === t
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "limit" ? "지정가" : t === "market" ? "시장가" : t === "stop" ? "역지정가" : "TP/SL"}
              {(t === "tpsl" ? tpslEnabled : orderType === t) ? (
                <span className="absolute -bottom-1.5 left-0 right-0 h-0.5 bg-primary" />
              ) : null}
            </button>
          ))}
        </div>

        {/* 잔액 표시 */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">사용 가능</span>
          <span className="font-mono font-semibold tabular-nums">
            {formatNumber(wallet.available, { maximumFractionDigits: 2 })} vUSDT
          </span>
        </div>

        {/* Price — 지정가/역지정가는 입력, 시장가는 현재가 표시 */}
        {orderType === "limit" ? (
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">가격 (vUSDT)</span>
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
        ) : orderType === "stop" ? (
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">트리거가 (vUSDT)</span>
              <span className="text-muted-foreground/60">
                {direction === "long" ? "현재가 위로 돌파 시 진입" : "현재가 아래로 이탈 시 진입"}
              </span>
            </div>
            <Input
              type="number"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={lastPrice ? String(lastPrice.toFixed(2)) : "—"}
              className="font-mono"
            />
            <p className="mt-1 text-[9px] text-muted-foreground/70">
              역지정가 {direction === "long" ? "롱" : "숏"} — 트리거가는 현재가보다{" "}
              {direction === "long" ? "높아야" : "낮아야"} 합니다 (돌파 추격).
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">가격</span>
              <span className="text-muted-foreground/60">시장가 — 현재가 즉시 체결</span>
            </div>
            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 font-mono text-sm tabular-nums">
              {lastPrice ? `${formatNumber(lastPrice)} vUSDT` : "—"}
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

        {/* Total (vUSDT) */}
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">총액 (vUSDT)</span>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 font-mono text-sm tabular-nums text-muted-foreground">
            {totalUsdt > 0 ? formatNumber(totalUsdt, { maximumFractionDigits: 2 }) : "—"}
          </div>
        </div>

        {/* 레버리지 — 현물은 숨김 (항상 1x) */}
        {!isSpot ? (
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
        ) : (
          <div className="rounded-md border border-border/40 bg-background/30 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            💎 현물 거래 — 레버리지 1× · 청산 없음 · 펀딩 없음 · 수수료 0.2%
          </div>
        )}

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
            value={lastPrice ? `${formatNumber(lastPrice)} vUSDT` : "—"}
            mono
          />
          <Row
            label="노출 금액"
            value={_notional > 0 ? `${formatNumber(_notional, { maximumFractionDigits: 2 })} vUSDT` : "—"}
            mono
          />
          <Row
            label="필요 마진"
            value={_margin > 0 ? `${formatNumber(_margin, { maximumFractionDigits: 2 })} vUSDT` : "—"}
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

// ─── Positions / Orders / History Tabs ──────────────────────────────────
function PositionsTabs({
  tab,
  onTabChange,
  positions,
  pendingOrders,
}: {
  tab: "positions" | "orders" | "history";
  onTabChange: (t: "positions" | "orders" | "history") => void;
  positions: Position[];
  pendingOrders: PendingOrder[];
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="mb-3 flex gap-3 border-b border-border/40">
          <TabButton active={tab === "positions"} onClick={() => onTabChange("positions")}>
            진행 중 포지션 ({positions.length})
          </TabButton>
          <TabButton active={tab === "orders"} onClick={() => onTabChange("orders")}>
            미체결 주문 ({pendingOrders.length})
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
        ) : tab === "orders" ? (
          pendingOrders.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">미체결 주문이 없습니다.</div>
          ) : (
            <PendingOrdersTable orders={pendingOrders} />
          )
        ) : (
          <div className="py-6 text-center text-xs text-muted-foreground">
            <Link href="/app/journal" className="text-primary underline-offset-2 hover:underline">
              거래 일지 페이지
            </Link>
            에서 전체 종료 거래를 확인하세요.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Pending Orders Table ─────────────────────────────────────────────────
function PendingOrdersTable({ orders }: { orders: PendingOrder[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-xs">
        <thead className="text-[9px] uppercase tracking-wider text-muted-foreground/70">
          <tr className="border-b border-border/40">
            <th className="px-2 py-2 text-left font-medium">심볼</th>
            <th className="px-2 py-2 text-left font-medium">방향</th>
            <th className="px-2 py-2 text-right font-medium">주문가</th>
            <th className="px-2 py-2 text-right font-medium">수량</th>
            <th className="px-2 py-2 text-right font-medium">손절 / 목표</th>
            <th className="px-2 py-2 text-right font-medium">만료</th>
            <th className="px-2 py-2 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <PendingOrderRow key={o.id} order={o} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PendingOrderRow({ order }: { order: PendingOrder }) {
  const [canceling, startCancelTransition] = useTransition();
  const isLong = order.direction === "long";
  const expiresIn = Math.max(0, new Date(order.expiresAt).getTime() - Date.now());
  const expiresHours = Math.floor(expiresIn / 3_600_000);
  const expiresMinutes = Math.floor((expiresIn % 3_600_000) / 60_000);

  function cancel() {
    const kindLabel = order.kind === "stop" ? "역지정가" : "지정가";
    if (!confirm(`${order.symbol} ${kindLabel} ${isLong ? "매수" : "매도"} 주문을 취소하시겠습니까?`)) return;
    startCancelTransition(async () => {
      const r = await cancelLimitOrderAction(order.id);
      if (!r.ok) {
        toast.error(r.error ?? "취소 실패");
        return;
      }
      toast.success("주문이 취소되었습니다.");
    });
  }

  return (
    <tr className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-2">
          <span aria-hidden className={cn("h-6 w-0.5 rounded", isLong ? "bg-grade-a" : "bg-grade-d")} />
          <span className="font-mono text-xs font-semibold">{order.symbol}</span>
          <span
            className={cn(
              "rounded px-1 py-px text-[9px] font-medium",
              order.kind === "stop"
                ? "bg-amber-500/15 text-amber-300"
                : "bg-muted/50 text-muted-foreground",
            )}
          >
            {order.kind === "stop" ? "역지정" : "지정"}
          </span>
        </div>
      </td>
      <td className="px-2 py-2.5">
        <Badge
          className={cn(
            "border text-[9px]",
            isLong ? "border-grade-a/40 bg-grade-a/10 text-grade-a" : "border-grade-d/40 bg-grade-d/10 text-grade-d",
          )}
        >
          {isLong ? "롱" : "숏"}
        </Badge>
      </td>
      <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums">
        ${formatNumber(order.limitPrice)}
      </td>
      <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums">
        {formatNumber(order.quantity, { maximumFractionDigits: 4 })}
      </td>
      <td className="px-2 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1.5 font-mono text-[11px] tabular-nums">
          {order.stop != null ? (
            <span className="text-grade-d/80">${formatNumber(order.stop, { maximumFractionDigits: 2 })}</span>
          ) : (
            <span className="text-muted-foreground/40">—</span>
          )}
          <span className="text-muted-foreground/40">/</span>
          {order.target != null ? (
            <span className="text-grade-a/80">${formatNumber(order.target, { maximumFractionDigits: 2 })}</span>
          ) : (
            <span className="text-muted-foreground/40">—</span>
          )}
        </div>
      </td>
      <td className="px-2 py-2.5 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {expiresHours > 0 ? `${expiresHours}시간 ${expiresMinutes}분` : `${expiresMinutes}분`}
      </td>
      <td className="px-2 py-2.5 text-right">
        <button
          type="button"
          onClick={cancel}
          disabled={canceling}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background/40 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-grade-d/40 hover:text-grade-d disabled:opacity-50"
        >
          <X className="h-3 w-3" />
          {canceling ? "..." : "취소"}
        </button>
      </td>
    </tr>
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
      <table className="w-full min-w-[1100px] text-xs">
        <thead className="text-[9px] uppercase tracking-wider text-muted-foreground/70">
          <tr className="border-b border-border/40">
            <th className="px-2 py-2 text-left font-medium">심볼</th>
            <th className="px-2 py-2 text-left font-medium">방향 / 레버리지</th>
            <th className="px-2 py-2 text-right font-medium">수량 / 노출</th>
            <th className="px-2 py-2 text-right font-medium">진입 / 청산가</th>
            <th className="px-2 py-2 text-right font-medium">현재가</th>
            <th className="px-2 py-2 text-right font-medium">손절 / 목표</th>
            <th className="px-2 py-2 text-right font-medium">마진</th>
            <th className="px-2 py-2 text-right font-medium">수수료</th>
            <th className="px-2 py-2 text-right font-medium">미실현 PnL / ROE / R</th>
            <th className="px-2 py-2 text-right font-medium">보유 / 만료</th>
            <th className="px-2 py-2 text-right font-medium"></th>
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

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 ${minutes % 60}분`;
  const days = Math.floor(hours / 24);
  return `${days}일 ${hours % 24}시간`;
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
  // ROE = PnL / margin (실효 수익률 — 레버리지 반영된 마진 대비)
  const roe = pos.margin > 0 ? (pnl / pos.margin) * 100 : 0;
  // R 단위 PnL = (현재가 - 진입가) / |진입가 - 손절가|
  const stopDist = Math.abs(pos.entryActual - pos.stop);
  const rPnl = stopDist > 0 ? movement / stopDist : 0;
  // 청산가 (단순화): 진입가 ± 진입가/레버리지
  const liqPrice =
    pos.leverage > 0
      ? pos.direction === "long"
        ? pos.entryActual * (1 - 1 / pos.leverage)
        : pos.entryActual * (1 + 1 / pos.leverage)
      : 0;
  // 노출 금액
  const notional = pos.entryActual * pos.qty;
  // 수수료 (round-trip × 노출)
  const totalFees = (pos.feesPct / 100) * notional;
  // 보유 시간 + 만료까지 남은 시간
  const ageMs = Date.now() - new Date(pos.createdAt).getTime();
  const createdMs = new Date(pos.createdAt).getTime();
  const expiryMs = pos.extendedUntil
    ? new Date(pos.extendedUntil).getTime()
    : createdMs + (POSITION_TIMEOUT_MS[pos.timeframe] ?? 0);
  const msToExpiry = Math.max(0, expiryMs - Date.now());
  const expiryTone =
    msToExpiry < 60 * 60_000
      ? "text-grade-d"
      : msToExpiry < 24 * 60 * 60_000
        ? "text-amber-400"
        : "text-muted-foreground/70";
  // TP/SL 진행률
  const stopProgress =
    last != null && stopDist > 0
      ? Math.min(100, Math.max(0, ((stopDist - Math.abs(last - pos.stop)) / stopDist) * 100))
      : 0;
  const targetDist = Math.abs(pos.target - pos.entryActual);
  const targetProgress =
    last != null && targetDist > 0
      ? Math.min(100, Math.max(0, ((targetDist - Math.abs(pos.target - last)) / targetDist) * 100))
      : 0;
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
      {/* 심볼 */}
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-2">
          <span aria-hidden className={cn("h-6 w-0.5 rounded", isLong ? "bg-grade-a" : "bg-grade-d")} />
          <div>
            <span className="font-mono text-xs font-semibold">{pos.symbol}</span>
            {pos.marketType === "spot" ? (
              <span className="ml-1.5 rounded bg-sky-500/15 px-1 py-0.5 text-[9px] font-semibold text-sky-400">
                현물
              </span>
            ) : null}
          </div>
        </div>
      </td>
      {/* 방향 + 레버리지 */}
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-1.5">
          <Badge
            className={cn(
              "border text-[9px]",
              isLong ? "border-grade-a/40 bg-grade-a/10 text-grade-a" : "border-grade-d/40 bg-grade-d/10 text-grade-d",
            )}
          >
            {isLong ? "롱" : "숏"}
          </Badge>
          {pos.marketType === "spot" ? (
            <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums bg-muted/40 text-muted-foreground">
              1×
            </span>
          ) : (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums",
                pos.leverage >= 20
                  ? "bg-grade-d/15 text-grade-d"
                  : pos.leverage >= 10
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-primary/15 text-primary",
              )}
            >
              {pos.leverage}×
            </span>
          )}
        </div>
      </td>
      {/* 수량 + 노출 */}
      <td className="px-2 py-2.5 text-right">
        <div className="font-mono text-xs tabular-nums">
          {formatNumber(pos.qty, { maximumFractionDigits: 4 })}{" "}
          <span className="text-[10px] text-muted-foreground">{baseSym}</span>
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          ${formatNumber(notional, { maximumFractionDigits: 2 })}
        </div>
      </td>
      {/* 진입가 + 청산가 */}
      <td className="px-2 py-2.5 text-right">
        <div className="font-mono text-xs font-medium tabular-nums">
          ${formatNumber(pos.entryActual)}
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums" title="청산가 (단순 계산 — 1/레버리지)">
          청산 ${formatNumber(liqPrice, { maximumFractionDigits: 2 })}
        </div>
      </td>
      {/* 현재가 */}
      <td className="px-2 py-2.5 text-right font-mono text-xs font-semibold tabular-nums">
        {last != null ? `$${formatNumber(last)}` : "—"}
      </td>
      {/* 손절 / 목표 + 진행 바 */}
      <td className="px-2 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1.5 font-mono text-[11px] tabular-nums">
          <span className="text-grade-d/80">${formatNumber(pos.stop, { maximumFractionDigits: 2 })}</span>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-grade-a/80">${formatNumber(pos.target, { maximumFractionDigits: 2 })}</span>
        </div>
        {last != null ? (
          <div className="mt-1 flex items-center gap-1">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted/30">
              <div className="h-full bg-grade-d/60" style={{ width: `${stopProgress}%` }} />
            </div>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted/30">
              <div className="h-full bg-grade-a/60" style={{ width: `${targetProgress}%` }} />
            </div>
          </div>
        ) : null}
      </td>
      {/* 마진 */}
      <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums">
        ${formatNumber(pos.margin, { maximumFractionDigits: 2 })}
      </td>
      {/* 수수료 */}
      <td className="px-2 py-2.5 text-right">
        <div className="font-mono text-xs tabular-nums text-muted-foreground">
          ${formatNumber(totalFees, { maximumFractionDigits: 2 })}
        </div>
        <div className="text-[10px] text-muted-foreground/60">왕복 {pos.feesPct.toFixed(2)}%</div>
      </td>
      {/* 미실현 PnL / ROE / R */}
      <td className="px-2 py-2.5 text-right">
        {last != null ? (
          <>
            <div className={cn("font-mono text-sm font-bold tabular-nums", inProfit ? "text-grade-a" : "text-grade-d")}>
              {pnl >= 0 ? "+" : ""}
              {formatCurrency(pnl, "USD")}
            </div>
            <div
              className={cn(
                "flex items-center justify-end gap-2 text-[10px] font-mono tabular-nums",
                inProfit ? "text-grade-a/70" : "text-grade-d/70",
              )}
            >
              <span>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</span>
              <span className="text-muted-foreground/60">·</span>
              <span title="마진 대비 수익률 (레버리지 반영)">
                ROE {roe >= 0 ? "+" : ""}{roe.toFixed(1)}%
              </span>
              <span className="text-muted-foreground/60">·</span>
              <span title="손절폭 기준 R 단위 손익">
                {rPnl >= 0 ? "+" : ""}{rPnl.toFixed(2)}R
              </span>
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      {/* 보유 시간 + 만료까지 (현물은 만료 없음) */}
      <td className="px-2 py-2.5 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        <div>{formatDuration(ageMs)}</div>
        {pos.marketType === "spot" ? (
          <div className="text-[10px] text-muted-foreground/60">현물 (영구)</div>
        ) : (
          <div
            className={expiryTone}
            title={`만료까지 ${formatDuration(msToExpiry)} 후 자동 청산`}
          >
            만료 {formatDuration(msToExpiry)}
          </div>
        )}
      </td>
      {/* 청산 */}
      <td className="px-2 py-2.5 text-right">
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
