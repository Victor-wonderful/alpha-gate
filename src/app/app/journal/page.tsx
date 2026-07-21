import Link from "next/link";
import { ArrowRight, History, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { GradeBadge } from "@/components/trade/grade-badge";
import type { Grade } from "@/types/trade";
import { FlowStepper } from "@/components/app/flow-stepper";
import { ResolveTradesButton } from "./resolve-button";
import { CancelPendingButton } from "./cancel-pending-button";
import { HelpLink } from "@/components/app/help-link";
import { parseMode, type TradeMode } from "@/components/app/mode-filter";
import { ExpiryBanner } from "@/components/trade/expiry-banner";
import { Suspense } from "react";
import { ClosedTradesTable, type ClosedTradeRow } from "./closed-trades-table";
import { fetchTicker24h } from "@/lib/analysis/binance";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

type Direction = "long" | "short";

interface TradeRow {
  id: string;
  symbol: string;
  direction: Direction;
  timeframe: string;
  pre_grade: string;
  pre_rr: number | null;
  result_r: number | null;
  closed_at: string | null;
  created_at: string;
  entry: number;
  entry_actual: number | null;
  stop: number;
  target: number;
  position_quantity: number | null;
  account_size: number | null;
  fees_pct: number | null;
  context_flags: { leverage?: number } | null;
  order_type: string | null;
  exit_reason: "target" | "stop" | "manual" | "timeout" | null;
  paper_realized_pnl: number | null;
  exit_price: number | null;
  exit_actual: number | null;
  mode: "live" | "backtest" | null;
}

export default async function JournalListPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const sp = await searchParams;
  const t = await getT();
  const tr = t; // 일부 .map((t) => ...) 콜백에서 t가 거래 변수로 가려져 사용하는 별칭
  const tradeMode: TradeMode = parseMode(sp.mode);
  const supabase = await getSupabaseServer();

  const TRADE_COLS =
    "id, symbol, direction, timeframe, pre_grade, pre_rr, result_r, closed_at, created_at, entry, entry_actual, stop, target, position_quantity, account_size, fees_pct, context_flags, exit_reason, order_type, order_status, limit_price, paper_realized_pnl, exit_price, exit_actual, mode";
  // 진행 중/미체결(closed_at null)은 건수가 적어 절대 잘리지 않게, 종료된 거래는 최근 청산 순으로
  // 별도 캡을 둔다. (이전엔 open+pending+closed를 한 쿼리 .limit(100)로 묶어, 종료 거래가
  // 100건을 넘으면 오래된 게 아예 안 불러와지고 탭/섹션 카운트도 틀어졌다.)
  const [openRes, closedRes] = await Promise.all([
    supabase
      .from("trades")
      .select(TRADE_COLS)
      .is("closed_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("trades")
      .select(TRADE_COLS)
      .not("closed_at", "is", null)
      .order("closed_at", { ascending: false })
      .limit(500), // 현재 65건 대비 넉넉. 수천 건 규모가 되면 서버 페이지네이션으로 전환.
  ]);
  const tradesRaw = [...(openRes.data ?? []), ...(closedRes.data ?? [])];

  const trades = (tradesRaw ?? []) as (TradeRow & {
    order_type?: "market" | "limit" | "stop" | null;
    order_status?: "pending" | "filled" | "canceled" | "expired" | null;
    limit_price?: number | null;
  })[];
  // 탭: 가상거래(live) / 백테스트(backtest). 실거래(real exchange)는 아직 없음(Bybit 연동 예정).
  // ?mode=backtest → 백테스트 탭, 그 외(없음/live/all) → 가상거래 탭.
  const activeTab: "live" | "backtest" = tradeMode === "backtest" ? "backtest" : "live";
  const tabOf = (m: "live" | "backtest" | null | undefined) => (m === "backtest" ? "backtest" : "live");

  // Pending limit/stop orders + 진행 중 포지션은 라이브(가상거래)에만 존재 — 백테스트는 즉시 청산됨.
  const pendingLimits = trades.filter(
    (t) =>
      !t.closed_at &&
      t.order_status === "pending" &&
      (t.order_type === "limit" || t.order_type === "stop") &&
      tabOf(t.mode) === activeTab,
  );
  const open = trades.filter(
    (t) =>
      !t.closed_at &&
      t.order_status !== "pending" &&
      t.order_status !== "canceled" &&
      t.order_status !== "expired" &&
      tabOf(t.mode) === activeTab,
  );
  const closedAll = trades.filter((t) => t.closed_at);
  // 모든 KPI/통계/리스트는 활성 탭(live/backtest)으로 필터된 데이터 사용.
  const closed = closedAll.filter((t) => tabOf(t.mode) === activeTab);
  const liveCount = closedAll.filter((t) => t.mode !== "backtest").length;
  const backtestCount = closedAll.filter((t) => t.mode === "backtest").length;

  // Pre-compute pnl + roi for closed trades (used by ClosedTradesTable)
  const closedRows: ClosedTradeRow[] = closed.map((t) => {
    let pnl: number | null =
      t.paper_realized_pnl != null ? Number(t.paper_realized_pnl) : null;
    if (pnl == null && t.position_quantity != null) {
      const e = Number(t.entry_actual ?? t.entry ?? 0);
      const ex = Number(t.exit_actual ?? t.exit_price ?? 0);
      const q = Number(t.position_quantity);
      const fp = Number(t.fees_pct ?? 0.12);
      if (e > 0 && ex > 0 && q > 0) {
        const move = t.direction === "long" ? ex - e : e - ex;
        pnl = move * q - e * (fp / 100) * q;
      }
    }
    const acct = t.account_size != null ? Number(t.account_size) : null;
    const roiPct = pnl != null && acct && acct > 0 ? (pnl / acct) * 100 : null;
    return {
      id: t.id,
      symbol: t.symbol,
      direction: t.direction,
      timeframe: t.timeframe,
      pre_grade: t.pre_grade,
      pre_rr: t.pre_rr,
      result_r: t.result_r,
      closed_at: t.closed_at,
      created_at: t.created_at,
      entry: t.entry,
      entry_actual: t.entry_actual,
      stop: t.stop,
      exit_actual: t.exit_actual,
      exit_price: t.exit_price,
      position_quantity: t.position_quantity,
      fees_pct: t.fees_pct,
      leverage: t.context_flags?.leverage ?? null,
      order_type: t.order_type,
      exit_reason: t.exit_reason,
      mode: (t.mode === "backtest" ? "backtest" : "live") as "live" | "backtest",
      pnl,
      roiPct,
    };
  });

  // Batch fetch current prices for all unique open-position + pending-limit symbols.
  const symbols = Array.from(new Set([...open, ...pendingLimits].map((t) => t.symbol)));
  const priceMap = new Map<string, number>();
  await Promise.all(
    symbols.map(async (s) => {
      try {
        const t = await fetchTicker24h(s);
        priceMap.set(s, t.lastPrice);
      } catch {
        /* skip — card will show "가격 가져오기 실패" */
      }
    }),
  );

  // Compute open-position metrics
  const positions = open.map((t) => {
    const entryActual = Number(t.entry_actual ?? t.entry);
    const stop = Number(t.stop);
    const target = Number(t.target);
    const qty = Number(t.position_quantity ?? 0);
    const feesPct = Number(t.fees_pct ?? 0.12);
    const last = priceMap.get(t.symbol) ?? null;

    const stopDist = Math.abs(entryActual - stop);
    const targetDist = Math.abs(target - entryActual);
    const movement = last != null ? (t.direction === "long" ? last - entryActual : entryActual - last) : 0;
    const grossR = stopDist > 0 ? movement / stopDist : 0;
    const feesR = stopDist > 0 ? (entryActual * (feesPct / 100)) / stopDist : 0;
    const netR = grossR - feesR;
    const pnlUsd = last != null ? movement * qty : 0;
    const movePct = entryActual > 0 && last != null ? (movement / entryActual) * 100 : 0;
    const notional = entryActual * qty;
    const exposurePct = t.account_size && Number(t.account_size) > 0 ? (notional / Number(t.account_size)) * 100 : 0;
    const distToStopPct = last != null && entryActual > 0 ? (Math.abs(last - stop) / entryActual) * 100 : 0;
    const distToTargetPct = last != null && entryActual > 0 ? (Math.abs(last - target) / entryActual) * 100 : 0;
    const stopProgress =
      last != null && stopDist > 0
        ? Math.min(100, Math.max(0, ((stopDist - Math.abs(last - stop)) / stopDist) * 100))
        : 0;
    const targetProgress =
      last != null && targetDist > 0
        ? Math.min(100, Math.max(0, ((targetDist - Math.abs(target - last)) / targetDist) * 100))
        : 0;

    return {
      trade: t,
      last,
      entryActual,
      stop,
      target,
      qty,
      feesPct,
      netR,
      pnlUsd,
      movePct,
      notional,
      exposurePct,
      distToStopPct,
      distToTargetPct,
      stopProgress,
      targetProgress,
    };
  });

  // KPIs
  const totalUnrealizedR = positions.reduce((s, p) => s + p.netR, 0);
  const totalUnrealizedUsd = positions.reduce((s, p) => s + p.pnlUsd, 0);
  const totalNotional = positions.reduce((s, p) => s + p.notional, 0);
  const accountSize = positions[0]?.trade.account_size ? Number(positions[0].trade.account_size) : 0;
  const totalExposurePct = accountSize > 0 ? (totalNotional / accountSize) * 100 : 0;

  // Today's realized R (KST midnight)
  const kstNow = new Date();
  const kstOffsetMs = 9 * 60 * 60_000;
  const kstStartUtc = new Date(
    Date.UTC(
      kstNow.getUTCFullYear(),
      kstNow.getUTCMonth(),
      kstNow.getUTCDate(),
    ) - kstOffsetMs,
  );
  const todayClosed = closed.filter((t) => t.closed_at && new Date(t.closed_at) >= kstStartUtc);
  const todayR = todayClosed
    .filter((t) => t.result_r != null)
    .reduce((s, t) => s + Number(t.result_r ?? 0), 0);

  // 대기 주문 유형 분해 (역지정/지정)
  const pendingStopCount = pendingLimits.filter((t) => t.order_type === "stop").length;
  const pendingLimitCount = pendingLimits.length - pendingStopCount;
  const pendingSub =
    pendingLimits.length === 0
      ? t("journal.page.none")
      : [
          pendingStopCount ? t("journal.page.pendingStopN", { n: pendingStopCount }) : null,
          pendingLimitCount ? t("journal.page.pendingLimitN", { n: pendingLimitCount }) : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="space-y-5">
      <FlowStepper current="journal" />
      <Suspense fallback={null}>
        <ExpiryBanner />
      </Suspense>

      {/* 페이지 헤더 — 제목 + 액션 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("journal.page.title")}</h1>
          <p className="text-xs text-muted-foreground">
            {t("journal.page.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HelpLink href="/app/guide/results" />
          <ResolveTradesButton />
        </div>
      </div>

      {/* 실거래 / 가상거래 / 백테스트 탭 */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 실거래 — Bybit 연동 예정 (비활성) */}
        <div
          title={t("journal.page.bybitSoon")}
          className="flex cursor-default items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 opacity-50"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-grade-a" />
          <span className="text-sm font-medium text-muted-foreground">{t("journal.page.realTrade")}</span>
          <span className="text-[10px] text-muted-foreground/60">{t("journal.page.bybitSoon")}</span>
        </div>
        {/* 가상거래 (live) */}
        <Link
          href="/app/journal?mode=live"
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors",
            activeTab === "live"
              ? "border-ring bg-primary/10 font-bold"
              : "border-border bg-card font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          <Wallet className={cn("h-3.5 w-3.5", activeTab === "live" && "text-primary")} />
          {t("journal.page.virtualTrade")}
          <span className="rounded-full bg-card-2 px-1.5 py-px font-mono text-[10px] tabular-nums text-primary">
            {liveCount}
          </span>
        </Link>
        {/* 백테스트 */}
        <Link
          href="/app/journal?mode=backtest"
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors",
            activeTab === "backtest"
              ? "border-amber-500/60 bg-amber-500/10 font-bold text-amber-300"
              : "border-border bg-card font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          <History className={cn("h-3.5 w-3.5", activeTab === "backtest" && "text-amber-300")} />
          {t("journal.page.backtest")}
          <span className="rounded-full bg-card-2 px-1.5 py-px font-mono text-[10px] tabular-nums text-amber-300/90">
            {backtestCount}
          </span>
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t("journal.page.kpiTodayR")}
          value={todayClosed.length > 0 ? `${todayR >= 0 ? "+" : ""}${todayR.toFixed(2)}R` : "—"}
          sub={todayClosed.length > 0 ? t("journal.page.kpiClosedN", { n: todayClosed.length }) : t("journal.page.kpiNoCloseToday")}
          tone={todayR > 0 ? "good" : todayR < 0 ? "bad" : "neutral"}
        />
        <KpiCard
          label={t("journal.page.kpiOpenPositions")}
          value={t("journal.page.countUnit", { n: positions.length })}
          sub={
            positions.length > 0
              ? t("journal.page.kpiUnrealized", {
                  r: `${totalUnrealizedR >= 0 ? "+" : ""}${totalUnrealizedR.toFixed(2)}`,
                  usd: `${totalUnrealizedUsd >= 0 ? "+" : ""}${formatCurrency(totalUnrealizedUsd, "USD")}`,
                })
              : t("journal.page.none")
          }
          tone={positions.length > 0 ? (totalUnrealizedR > 0 ? "good" : totalUnrealizedR < 0 ? "bad" : "neutral") : "neutral"}
        />
        <KpiCard
          label={t("journal.page.kpiPendingOrders")}
          value={t("journal.page.countUnit", { n: pendingLimits.length })}
          sub={pendingSub}
        />
        <KpiCard
          label={t("journal.page.kpiTotalExposure")}
          value={positions.length > 0 ? `${totalExposurePct.toFixed(1)}%` : "—"}
          sub={
            positions.length > 0
              ? `${formatCurrency(totalNotional, "USD")} / ${formatCurrency(accountSize, "USD")}`
              : t("journal.page.kpiNoOpen")
          }
        />
      </div>

      {/* Pending limit orders */}
      {pendingLimits.length > 0 ? (
        <section className="space-y-2.5">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            {t("journal.page.pendingSectionTitle")}
          </h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-popover">
            <table className="w-full text-sm">
              <thead className="bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">{t("journal.page.colRegisteredAt")}</th>
                  <th className="px-4 py-2 text-left">{t("journal.page.colCoin")}</th>
                  <th className="px-4 py-2 text-left">{t("journal.page.colDirection")}</th>
                  <th className="px-4 py-2 text-left">{t("journal.page.colType")}</th>
                  <th className="px-4 py-2 text-right">{t("journal.page.colTrigger")}</th>
                  <th className="px-4 py-2 text-right">{t("journal.page.colStop")}</th>
                  <th className="px-4 py-2 text-right">{t("journal.page.colTarget")}</th>
                  <th className="px-4 py-2 text-right">{t("journal.page.colCurrent")}</th>
                  <th className="px-4 py-2 text-right">{t("journal.page.colToEntry")}</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {pendingLimits.map((t) => {
                  const limit = Number(t.limit_price ?? t.entry);
                  const last = priceMap.get(t.symbol) ?? null;
                  const diffPct = last != null && limit > 0 ? ((last - limit) / limit) * 100 : null;
                  return (
                    <tr key={t.id} className="border-t border-border hover:bg-accent/40">
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(t.created_at).toLocaleString("ko-KR", { hour12: false })}
                      </td>
                      <td className="px-4 py-2 font-mono">{t.symbol}</td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                            t.direction === "long" ? "bg-grade-a/15 text-grade-a" : "bg-grade-d/15 text-grade-d",
                          )}
                        >
                          {t.direction === "long" ? tr("common.long") : tr("common.short")}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-[11px] text-muted-foreground">
                        {t.order_type === "stop" ? tr("journal.page.stopOrder") : tr("journal.page.limitOrder")}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{formatNumber(limit)}</td>
                      <td className="px-4 py-2 text-right font-mono text-grade-d">{formatNumber(Number(t.stop))}</td>
                      <td className="px-4 py-2 text-right font-mono text-grade-a">{formatNumber(Number(t.target))}</td>
                      <td className="px-4 py-2 text-right font-mono">
                        {last != null ? formatNumber(last) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {diffPct != null ? (
                          <span className={Math.abs(diffPct) < 0.1 ? "text-grade-a" : "text-muted-foreground"}>
                            {diffPct >= 0 ? "+" : ""}
                            {diffPct.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <CancelPendingButton tradeId={t.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("journal.page.pendingFootnote")}
          </p>
        </section>
      ) : null}

      {/* Open positions board */}
      {positions.length > 0 ? (
        <section className="space-y-2.5">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-grade-a" />
            {t("journal.page.openSectionTitle", { n: positions.length })}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {positions.map((p) => (
              <OpenPositionCard key={p.trade.id} p={p} t={t} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Closed trades table */}
      <section className="space-y-2.5">
        <h2 className="text-[13px] font-semibold text-muted-foreground">
          {t("journal.page.closedSectionTitle", { n: closed.length })}
        </h2>
        {closed.length === 0 ? (
          <div className="rounded-2xl border border-border bg-popover p-10 text-center text-sm text-muted-foreground">
            {t("journal.page.noClosed")}
          </div>
        ) : (
          <ClosedTradesTable rows={closedRows} />
        )}
      </section>

    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-grade-a"
      : tone === "bad"
        ? "text-grade-d"
        : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono text-xl font-bold tabular-nums", toneClass)}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

type Position = {
  trade: TradeRow;
  last: number | null;
  entryActual: number;
  stop: number;
  target: number;
  qty: number;
  feesPct: number;
  netR: number;
  pnlUsd: number;
  movePct: number;
  notional: number;
  exposurePct: number;
  distToStopPct: number;
  distToTargetPct: number;
  stopProgress: number;
  targetProgress: number;
};

function OpenPositionCard({ p, t: tr }: { p: Position; t: TFunction }) {
  const t = p.trade;
  const isLong = t.direction === "long";
  const inProfit = p.netR > 0;
  const noPrice = p.last == null;
  const baseSymbol = t.symbol.replace("USDT", "");

  return (
    <Link
      href={`/app/journal/${t.id}`}
      className={cn(
        "block overflow-hidden rounded-lg border bg-card shadow-card p-4 transition-colors hover:bg-card",
        inProfit ? "border-grade-a/40" : noPrice ? "border-border" : "border-grade-d/40",
      )}
    >
      {/* Header */}
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
              <span className="font-mono text-base font-semibold">{t.symbol}</span>
              <Badge
                className={cn(
                  "border text-[10px]",
                  isLong
                    ? "border-grade-a/40 bg-grade-a/10 text-grade-a"
                    : "border-grade-d/40 bg-grade-d/10 text-grade-d",
                )}
              >
                {isLong ? tr("common.long") : tr("common.short")}
              </Badge>
              <Badge className="border border-border bg-background/40 text-[10px]">{t.timeframe}</Badge>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {new Date(t.created_at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GradeBadge grade={t.pre_grade as Grade} size="sm" />
        </div>
      </div>

      {/* PnL block */}
      <div className="mt-4">
        {noPrice ? (
          <div className="text-sm text-muted-foreground">{tr("journal.page.priceFetchFailed")}</div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-3">
              <span
                className={cn(
                  "font-mono text-2xl font-bold tabular-nums",
                  inProfit ? "text-grade-a" : "text-grade-d",
                )}
              >
                {inProfit ? "+" : ""}
                {p.netR.toFixed(2)}R
              </span>
              <span
                className={cn(
                  "font-mono text-base tabular-nums",
                  inProfit ? "text-grade-a" : "text-grade-d",
                )}
              >
                {p.pnlUsd >= 0 ? "+" : ""}
                {formatCurrency(p.pnlUsd, "USD")}
              </span>
              <span
                className={cn(
                  "font-mono text-xs tabular-nums",
                  inProfit ? "text-grade-a/80" : "text-grade-d/80",
                )}
              >
                {p.movePct >= 0 ? "+" : ""}
                {p.movePct.toFixed(2)}%
              </span>
            </div>
          </>
        )}
      </div>

      {/* Price/qty row */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <PriceCell label={tr("journal.page.cellEntryFill")} value={`$${formatNumber(p.entryActual)}`} />
        <PriceCell
          label={tr("journal.page.cellCurrent")}
          value={p.last != null ? `$${formatNumber(p.last)}` : "—"}
          tone={
            p.last == null
              ? "neutral"
              : (isLong && p.last > p.entryActual) || (!isLong && p.last < p.entryActual)
                ? "good"
                : "bad"
          }
        />
        <PriceCell
          label={tr("journal.page.cellQty")}
          value={`${formatNumber(p.qty, { maximumFractionDigits: 4 })} ${baseSymbol}`}
          sub={tr("journal.page.cellExposure", { pct: p.exposurePct.toFixed(1) })}
        />
      </div>

      {/* Stop / target progress */}
      {!noPrice ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between text-[10px] uppercase text-muted-foreground">
              <span className="flex items-center gap-1 text-grade-d">
                <TrendingDown className="h-3 w-3" />
                {tr("journal.page.toStop")}
              </span>
              <span className="font-mono tabular-nums">
                {p.distToStopPct.toFixed(2)}% · ${formatNumber(p.stop)}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/30">
              <div
                className="h-full bg-grade-d/60"
                style={{ width: `${p.stopProgress}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-[10px] uppercase text-muted-foreground">
              <span className="flex items-center gap-1 text-grade-a">
                <TrendingUp className="h-3 w-3" />
                {tr("journal.page.toTarget")}
              </span>
              <span className="font-mono tabular-nums">
                {p.distToTargetPct.toFixed(2)}% · ${formatNumber(p.target)}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/30">
              <div
                className="h-full bg-grade-a/60"
                style={{ width: `${p.targetProgress}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-end text-[11px] text-primary">
        {tr("journal.page.viewDetail")} <ArrowRight className="ml-1 h-3 w-3" />
      </div>
    </Link>
  );
}

function PriceCell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-grade-a"
      : tone === "bad"
        ? "text-grade-d"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-mono text-sm font-semibold tabular-nums", toneClass)}>
        {value}
      </div>
      {sub ? <div className="text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
