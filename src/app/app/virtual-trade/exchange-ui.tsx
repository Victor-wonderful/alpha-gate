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

// ─── Orderbook ───────────────────────────────────────────────────────────
function OrderbookPanel({ symbol }: { symbol: string }) {
  const [book, setBook] = useState<{ bids: [number, number][]; asks: [number, number][]; last: number | null }>({
    bids: [],
    asks: [],
    last: null,
  });

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const [depthR, priceR] = await Promise.all([
          fetch(`https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=20`),
          fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`),
        ]);
        const depth = (await depthR.json()) as { bids: [string, string][]; asks: [string, string][] };
        const price = (await priceR.json()) as { price: string };
        if (!alive) return;
        setBook({
          bids: depth.bids.slice(0, 12).map((b) => [parseFloat(b[0]), parseFloat(b[1])]),
          asks: depth.asks.slice(0, 12).map((a) => [parseFloat(a[0]), parseFloat(a[1])]),
          last: parseFloat(price.price),
        });
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

  const maxQty = Math.max(
    ...book.bids.map((b) => b[1]),
    ...book.asks.map((a) => a[1]),
    1,
  );

  return (
    <Card>
      <CardContent className="p-3">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>호가창</span>
          <span className="text-[10px]">2초 갱신</span>
        </div>

        <div className="space-y-0.5">
          {[...book.asks].reverse().map((a, i) => (
            <OrderbookRow key={`a${i}`} price={a[0]} qty={a[1]} maxQty={maxQty} side="ask" />
          ))}
        </div>

        <div
          className={cn(
            "my-1.5 rounded border border-border/40 bg-background/40 px-2 py-1 text-center font-mono text-base font-bold tabular-nums",
          )}
        >
          {book.last != null ? `$${formatNumber(book.last)}` : "—"}
        </div>

        <div className="space-y-0.5">
          {book.bids.map((b, i) => (
            <OrderbookRow key={`b${i}`} price={b[0]} qty={b[1]} maxQty={maxQty} side="bid" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function OrderbookRow({ price, qty, maxQty, side }: { price: number; qty: number; maxQty: number; side: "ask" | "bid" }) {
  const pct = Math.min(100, (qty / maxQty) * 100);
  const isAsk = side === "ask";
  return (
    <div className="relative grid grid-cols-2 px-1 text-[11px] tabular-nums">
      <div
        className={cn("absolute inset-y-0", isAsk ? "right-0 bg-grade-d/10" : "left-0 bg-grade-a/10")}
        style={{ width: `${pct}%` }}
      />
      <span className={cn("relative font-mono", isAsk ? "text-grade-d" : "text-grade-a")}>{formatNumber(price)}</span>
      <span className="relative text-right font-mono text-muted-foreground">{formatNumber(qty, { maximumFractionDigits: 3 })}</span>
    </div>
  );
}

// ─── Order Panel ─────────────────────────────────────────────────────────
function OrderPanel({ symbol, wallet }: { symbol: string; wallet: Wallet }) {
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [leverage, setLeverage] = useState(5);
  const [qty, setQty] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [accountPct, setAccountPct] = useState(10);
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

  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        {/* Direction tabs */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDirection("long")}
            className={cn(
              "rounded-md border py-2 text-sm font-bold transition-colors",
              direction === "long"
                ? "border-grade-a bg-grade-a text-white"
                : "border-border bg-background/40 text-muted-foreground hover:text-foreground",
            )}
          >
            <ArrowUpRight className="-mt-0.5 mr-1 inline h-4 w-4" />
            매수 (롱)
          </button>
          <button
            type="button"
            onClick={() => setDirection("short")}
            className={cn(
              "rounded-md border py-2 text-sm font-bold transition-colors",
              direction === "short"
                ? "border-grade-d bg-grade-d text-white"
                : "border-border bg-background/40 text-muted-foreground hover:text-foreground",
            )}
          >
            <ArrowDownRight className="-mt-0.5 mr-1 inline h-4 w-4" />
            매도 (숏)
          </button>
        </div>

        {/* Leverage */}
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">레버리지</span>
            <span className="font-mono font-semibold">{leverage}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={50}
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="mt-1 flex flex-wrap gap-1">
            {LEVERAGE_PRESETS.map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setLeverage(lv)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px]",
                  leverage === lv ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground",
                )}
              >
                {lv}x
              </button>
            ))}
          </div>
        </div>

        {/* Quantity */}
        <div>
          <Label className="text-[11px] text-muted-foreground">수량 ({baseSym})</Label>
          <Input
            type="number"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0.0000"
            className="mt-1 font-mono"
          />
          <div className="mt-2 flex gap-1">
            {[10, 25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => applyAccountPct(pct)}
                className={cn(
                  "flex-1 rounded border py-1 text-[10px]",
                  accountPct === pct ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground",
                )}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* Stop / Target */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">손절 (선택)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={stop}
              onChange={(e) => setStop(e.target.value)}
              placeholder={lastPrice ? formatNumber(direction === "long" ? lastPrice * 0.98 : lastPrice * 1.02) : "—"}
              className="mt-1 font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">목표 (선택)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={lastPrice ? formatNumber(direction === "long" ? lastPrice * 1.04 : lastPrice * 0.96) : "—"}
              className="mt-1 font-mono text-xs"
            />
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-md border border-border/40 bg-background/40 p-2 text-[11px]">
          <Row label="진입가 (예상)" value={lastPrice ? `$${formatNumber(lastPrice)}` : "—"} />
          <Row label="노출 금액" value={notional > 0 ? `$${formatNumber(notional)}` : "—"} />
          <Row
            label="필요 마진"
            value={margin > 0 ? `$${formatNumber(margin)}` : "—"}
            tone={margin > wallet.available ? "bad" : "default"}
          />
          <Row label="사용 가능" value={`$${formatNumber(wallet.available)}`} />
        </div>

        <Button
          type="button"
          onClick={submit}
          disabled={pending || qtyNum <= 0 || margin > wallet.available}
          className={cn(
            "w-full",
            direction === "long" ? "bg-grade-a hover:bg-grade-a/90" : "bg-grade-d hover:bg-grade-d/90",
          )}
          size="lg"
        >
          {pending ? "주문 처리 중..." : `${direction === "long" ? "매수 진입" : "매도 진입"}`}
        </Button>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "default" | "bad" }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono tabular-nums", tone === "bad" ? "text-grade-d" : "text-foreground")}>{value}</span>
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
        <thead className="text-[10px] uppercase text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left">심볼</th>
            <th className="px-2 py-1.5 text-left">방향</th>
            <th className="px-2 py-1.5 text-right">수량</th>
            <th className="px-2 py-1.5 text-right">진입가</th>
            <th className="px-2 py-1.5 text-right">현재가</th>
            <th className="px-2 py-1.5 text-right">미실현 PnL</th>
            <th className="px-2 py-1.5 text-right">마진</th>
            <th className="px-2 py-1.5 text-right">청산</th>
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
  const inProfit = pnl > 0;
  const isLong = pos.direction === "long";

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
    <tr className="border-t border-border/40 hover:bg-muted/20">
      <td className="px-2 py-1.5 font-mono font-semibold">{pos.symbol}</td>
      <td className="px-2 py-1.5">
        <Badge
          className={cn(
            "border text-[9px]",
            isLong ? "border-grade-a/40 bg-grade-a/10 text-grade-a" : "border-grade-d/40 bg-grade-d/10 text-grade-d",
          )}
        >
          {isLong ? "롱" : "숏"}
        </Badge>
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{formatNumber(pos.qty, { maximumFractionDigits: 4 })}</td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">${formatNumber(pos.entryActual)}</td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{last != null ? `$${formatNumber(last)}` : "—"}</td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums", inProfit ? "text-grade-a" : last != null ? "text-grade-d" : "text-muted-foreground")}>
        {last != null ? (pnl >= 0 ? "+" : "") + formatCurrency(pnl, "USD") : "—"}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">${formatNumber(pos.margin)}</td>
      <td className="px-2 py-1.5 text-right">
        <button
          type="button"
          onClick={close}
          disabled={closing}
          className="inline-flex items-center gap-1 rounded border border-grade-d/40 bg-grade-d/10 px-2 py-0.5 text-[10px] font-semibold text-grade-d hover:bg-grade-d/20"
        >
          <X className="h-3 w-3" />
          {closing ? "..." : "청산"}
        </button>
      </td>
    </tr>
  );
}
