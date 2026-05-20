import Link from "next/link";
import { ArrowRight, Wallet, TrendingUp, TrendingDown, Layers, History } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getOrCreateWallet } from "@/lib/paper-wallet";
import { fetchTicker24h } from "@/lib/analysis/binance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { VirtualTradeClient } from "./virtual-trade-client";

export const dynamic = "force-dynamic";

export default async function VirtualTradePage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const wallet = await getOrCreateWallet(user.id);

  // Open paper positions
  const { data: openTrades } = await supabase
    .from("trades")
    .select(
      "id, symbol, direction, entry, entry_actual, stop, target, position_quantity, paper_margin, fees_pct, created_at, pre_grade",
    )
    .eq("user_id", user.id)
    .eq("is_paper", true)
    .is("closed_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  // Recent wallet logs
  const { data: logs } = await supabase
    .from("paper_wallet_logs")
    .select("id, action, amount, balance_after, used_margin_after, note, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(15);

  // Fetch current prices for unique open symbols (batch)
  const symbols = Array.from(new Set((openTrades ?? []).map((t) => t.symbol)));
  const priceMap = new Map<string, number>();
  await Promise.all(
    symbols.map(async (s) => {
      try {
        const t = await fetchTicker24h(s);
        priceMap.set(s, t.lastPrice);
      } catch {
        /* skip */
      }
    }),
  );

  // Compute unrealized PnL per position
  type Pos = {
    id: string;
    symbol: string;
    direction: "long" | "short";
    entryActual: number;
    qty: number;
    margin: number;
    last: number | null;
    unrealized: number;
    movePct: number;
    grade: string;
    createdAt: string;
  };
  const positions: Pos[] = (openTrades ?? []).map((t) => {
    const entryActual = Number(t.entry_actual ?? t.entry);
    const qty = Number(t.position_quantity ?? 0);
    const margin = Number(t.paper_margin ?? 0);
    const last = priceMap.get(t.symbol) ?? null;
    const movement = last != null ? (t.direction === "long" ? last - entryActual : entryActual - last) : 0;
    const unrealized = last != null ? movement * qty : 0;
    const movePct = entryActual > 0 && last != null ? (movement / entryActual) * 100 : 0;
    return {
      id: t.id as string,
      symbol: t.symbol as string,
      direction: t.direction as "long" | "short",
      entryActual,
      qty,
      margin,
      last,
      unrealized,
      movePct,
      grade: t.pre_grade as string,
      createdAt: t.created_at as string,
    };
  });

  const totalUnrealized = positions.reduce((s, p) => s + p.unrealized, 0);
  const equity = wallet.usdtBalance + totalUnrealized;
  const pnlSinceStart = wallet.usdtBalance - wallet.startingBalance;
  const pnlPct = wallet.startingBalance > 0 ? (pnlSinceStart / wallet.startingBalance) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">가상 트레이딩</h1>
        <p className="text-sm text-muted-foreground">
          $10,000 가상 USDT로 시작하는 페이퍼 트레이딩 지갑. 실거래와 동일한 흐름(AI 분석 → 주문 검토 → 자동 정산)으로 학습할 수 있습니다.
        </p>
      </div>

      {/* Wallet hero */}
      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <div className="grid gap-6 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" />
                자산 (Equity = 잔액 + 미실현)
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-4xl font-bold tabular-nums">
                  {formatCurrency(equity, "USD")}
                </span>
                <span
                  className={cn(
                    "font-mono text-sm font-medium tabular-nums",
                    pnlSinceStart >= 0 ? "text-grade-a" : "text-grade-d",
                  )}
                >
                  {pnlSinceStart >= 0 ? "+" : ""}
                  {formatCurrency(pnlSinceStart, "USD")} ({pnlSinceStart >= 0 ? "+" : ""}
                  {pnlPct.toFixed(2)}%)
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                시작 자금 {formatCurrency(wallet.startingBalance, "USD")} 대비
              </div>
            </div>
            <Stat label="USDT 잔액 (실현)" value={formatCurrency(wallet.usdtBalance, "USD")} />
            <Stat
              label="사용 가능 잔액"
              value={formatCurrency(wallet.available, "USD")}
              sub={`사용 중 마진 ${formatCurrency(wallet.usedMargin, "USD")}`}
            />
          </div>

          <div className="mt-6 border-t border-border/60 pt-4">
            <VirtualTradeClient currentBalance={wallet.usdtBalance} />
          </div>
        </CardContent>
      </Card>

      {/* Open positions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Layers className="h-3.5 w-3.5" />
            진행 중 포지션 ({positions.length})
          </h2>
          <span className="text-xs text-muted-foreground">
            미실현 {totalUnrealized >= 0 ? "+" : ""}
            {formatCurrency(totalUnrealized, "USD")}
          </span>
        </div>

        {positions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-8 text-sm text-muted-foreground">
              <span>아직 진행 중 가상 포지션이 없습니다.</span>
              <Link
                href="/app/analyze"
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                AI 분석으로 시작 <ArrowRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {positions.map((p) => (
              <PositionCard key={p.id} pos={p} />
            ))}
          </div>
        )}
      </section>

      {/* Wallet history */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <History className="h-3.5 w-3.5" />
          최근 지갑 활동
        </h2>
        {!logs || logs.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-xs text-muted-foreground">
              지갑 활동이 없습니다.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border/60">
                {logs.map((l) => {
                  const isInflow = l.action === "deposit" || l.action === "reset" || (l.action === "settle" && Number(l.amount) > 0);
                  return (
                    <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                      <ActionBadge action={l.action as string} />
                      <div className="flex-1 min-w-0 text-xs">
                        <div className="text-foreground">{l.note ?? l.action}</div>
                        <div className="text-muted-foreground">
                          {new Date(l.created_at as string).toLocaleString("ko-KR")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={cn(
                            "font-mono text-sm tabular-nums",
                            isInflow ? "text-grade-a" : "text-muted-foreground",
                          )}
                        >
                          {Number(l.amount) > 0 ? "+" : ""}
                          {formatCurrency(Number(l.amount), "USD")}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          잔액 {formatCurrency(Number(l.balance_after), "USD")}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function PositionCard({ pos }: { pos: { id: string; symbol: string; direction: "long" | "short"; entryActual: number; qty: number; margin: number; last: number | null; unrealized: number; movePct: number; grade: string; createdAt: string } }) {
  const isLong = pos.direction === "long";
  const inProfit = pos.unrealized > 0;
  const noPrice = pos.last == null;
  const baseSym = pos.symbol.replace("USDT", "");
  return (
    <Link
      href={`/app/journal/${pos.id}`}
      className={cn(
        "block rounded-lg border bg-card/70 p-4 transition-colors hover:bg-card",
        inProfit ? "border-grade-a/40" : noPrice ? "border-border" : "border-grade-d/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-md text-white",
              isLong ? "bg-grade-a" : "bg-grade-d",
            )}
          >
            {isLong ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-semibold">{pos.symbol}</span>
              <Badge
                className={cn(
                  "border text-[10px]",
                  isLong ? "border-grade-a/40 bg-grade-a/10 text-grade-a" : "border-grade-d/40 bg-grade-d/10 text-grade-d",
                )}
              >
                {isLong ? "롱" : "숏"}
              </Badge>
              <Badge className="border border-border bg-background/40 text-[10px]">{pos.grade}</Badge>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {new Date(pos.createdAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3">
        {noPrice ? (
          <div className="text-xs text-muted-foreground">가격 가져오기 실패 — 새로고침으로 재시도</div>
        ) : (
          <div className="flex flex-wrap items-baseline gap-3">
            <span
              className={cn(
                "font-mono text-xl font-bold tabular-nums",
                inProfit ? "text-grade-a" : "text-grade-d",
              )}
            >
              {pos.unrealized >= 0 ? "+" : ""}
              {formatCurrency(pos.unrealized, "USD")}
            </span>
            <span
              className={cn(
                "font-mono text-xs tabular-nums",
                inProfit ? "text-grade-a/80" : "text-grade-d/80",
              )}
            >
              {pos.movePct >= 0 ? "+" : ""}
              {pos.movePct.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <Cell label="진입 체결" value={`$${formatNumber(pos.entryActual)}`} />
        <Cell label="현재가" value={pos.last != null ? `$${formatNumber(pos.last)}` : "—"} />
        <Cell label="수량" value={`${formatNumber(pos.qty, { maximumFractionDigits: 4 })} ${baseSym}`} sub={`마진 ${formatCurrency(pos.margin, "USD")}`} />
      </div>
    </Link>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 px-2 py-1.5">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-xs font-semibold tabular-nums">{value}</div>
      {sub ? <div className="text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, { label: string; color: string }> = {
    deposit: { label: "입금", color: "border-grade-a/40 bg-grade-a/10 text-grade-a" },
    reset: { label: "리셋", color: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
    lock: { label: "마진 lock", color: "border-primary/40 bg-primary/10 text-primary" },
    settle: { label: "정산", color: "border-grade-b/40 bg-grade-b/10 text-grade-b" },
  };
  const m = map[action] ?? { label: action, color: "border-border bg-background/40 text-muted-foreground" };
  return <Badge className={cn("border text-[10px]", m.color)}>{m.label}</Badge>;
}
