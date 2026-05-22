import Link from "next/link";
import { Activity, ArrowRight, Layers, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradeBadge } from "@/components/trade/grade-badge";
import type { Grade } from "@/types/trade";
import { FlowStepper } from "@/components/app/flow-stepper";
import { ResolveTradesButton } from "./resolve-button";
import { CancelPendingButton } from "./cancel-pending-button";
import { ClusterTabs } from "@/components/app/cluster-tabs";
import { clusters } from "@/components/app/cluster-tabs-config";
import { HelpLink } from "@/components/app/help-link";
import { ViewTabs, parseView, type View } from "@/components/app/view-tabs";

interface GameRow {
  id: string;
  symbol: string;
  direction: "call" | "put";
  bet_points: number;
  entry_price: number;
  exit_price: number | null;
  won: boolean | null;
  pnl_points: number | null;
  status: "pending" | "settled";
  entry_time: string;
  created_at: string;
}
import { fetchTicker24h } from "@/lib/analysis/binance";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

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
  exit_reason: "target" | "stop" | "manual" | null;
  paper_realized_pnl: number | null;
  exit_price: number | null;
  exit_actual: number | null;
}

export default async function JournalListPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  const view: View = parseView(sp.view);
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [tradesRes, gamesRes] = await Promise.all([
    supabase
      .from("trades")
      .select(
        "id, symbol, direction, timeframe, pre_grade, pre_rr, result_r, closed_at, created_at, entry, entry_actual, stop, target, position_quantity, account_size, fees_pct, exit_reason, order_type, order_status, limit_price, paper_realized_pnl, exit_price, exit_actual",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    user
      ? supabase
          .from("binary_games")
          .select(
            "id, symbol, direction, bet_points, entry_price, exit_price, won, pnl_points, status, entry_time, created_at",
          )
          .eq("user_id", user.id)
          .eq("status", "settled")
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as GameRow[] }),
  ]);
  const tradesRaw = tradesRes.data;
  const games = (gamesRes.data ?? []) as GameRow[];

  const trades = (tradesRaw ?? []) as (TradeRow & {
    order_type?: "market" | "limit" | null;
    order_status?: "pending" | "filled" | "canceled" | "expired" | null;
    limit_price?: number | null;
  })[];
  // Pending limit orders: waiting for price to reach limit_price. Not yet a real position.
  const pendingLimits = trades.filter(
    (t) => !t.closed_at && t.order_status === "pending" && t.order_type === "limit",
  );
  const open = trades.filter(
    (t) => !t.closed_at && t.order_status !== "pending" && t.order_status !== "canceled" && t.order_status !== "expired",
  );
  const closed = trades.filter((t) => t.closed_at);

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
  const todayR = closed
    .filter((t) => t.closed_at && new Date(t.closed_at) >= kstStartUtc && t.result_r != null)
    .reduce((s, t) => s + Number(t.result_r ?? 0), 0);

  // ── Game stats ──────────────────────────────────────────────
  const totalGames = games.length;
  const gameWins = games.filter((g) => g.won === true).length;
  const gameLosses = games.filter((g) => g.won === false).length;
  const gamePnl = games.reduce((s, g) => s + (g.pnl_points != null ? Number(g.pnl_points) : 0), 0);
  const gameWinRate = totalGames > 0 ? (gameWins / totalGames) * 100 : 0;
  const todayGames = games.filter(
    (g) => new Date(g.created_at) >= kstStartUtc,
  );
  const todayGamePnl = todayGames.reduce(
    (s, g) => s + (g.pnl_points != null ? Number(g.pnl_points) : 0),
    0,
  );

  // Closed-trades realized PnL (for combined display in "all" view)
  function tradeRealizedPnl(t: typeof trades[number]): number {
    if (t.paper_realized_pnl != null) return Number(t.paper_realized_pnl);
    if (!t.position_quantity) return 0;
    const entry = Number(t.entry_actual ?? t.entry ?? 0);
    const exit = Number(t.exit_actual ?? t.exit_price ?? 0);
    const qty = Number(t.position_quantity);
    const feesPct = Number(t.fees_pct ?? 0.12);
    if (entry <= 0 || exit <= 0 || qty <= 0) return 0;
    const move = t.direction === "long" ? exit - entry : entry - exit;
    return move * qty - entry * (feesPct / 100) * qty;
  }
  const totalTradePnl = closed.reduce((s, t) => s + tradeRealizedPnl(t), 0);
  const todayTradePnl = closed
    .filter((t) => t.closed_at && new Date(t.closed_at) >= kstStartUtc)
    .reduce((s, t) => s + tradeRealizedPnl(t), 0);

  const cluster = clusters.results({
    openCount: open.length + pendingLimits.length,
    rightSlot: (
      <div className="flex items-center gap-2">
        <HelpLink href="/app/guide/results" />
        <ResolveTradesButton />
      </div>
    ),
  });
  return (
    <div className="space-y-5">
      <FlowStepper current="journal" />
      <ClusterTabs
        title={cluster.title}
        description="5분마다 자동 정산되며, 즉시 확인하려면 우측 버튼을 누르세요. 가격은 페이지 새로고침으로 갱신됩니다."
        tabs={cluster.tabs}
        rightSlot={cluster.rightSlot}
      />

      {/* View sub-tabs: 전체 / 거래 / 게임 */}
      <ViewTabs
        basePath="/app/journal"
        current={view}
        counts={{ all: closed.length + games.length, trades: closed.length, games: games.length }}
      />

      {/* KPI cards — content depends on view */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {view === "games" ? (
          <>
            <KpiCard
              icon={<Activity className="h-4 w-4" />}
              label="오늘 게임 PnL"
              value={
                todayGames.length > 0
                  ? `${todayGamePnl >= 0 ? "+" : ""}${formatNumber(todayGamePnl, { maximumFractionDigits: 0 })}`
                  : "—"
              }
              sub={`vUSDT · 오늘 ${todayGames.length}판`}
              tone={todayGamePnl > 0 ? "good" : todayGamePnl < 0 ? "bad" : "neutral"}
            />
            <KpiCard
              icon={<Layers className="h-4 w-4" />}
              label="총 게임"
              value={`${totalGames}판`}
              sub={`승 ${gameWins} · 패 ${gameLosses}`}
            />
            <KpiCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="승률"
              value={totalGames > 0 ? `${gameWinRate.toFixed(1)}%` : "—"}
              tone={gameWinRate >= 50 ? "good" : gameWinRate >= 35 ? "neutral" : "bad"}
            />
            <KpiCard
              icon={gamePnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              label="누적 게임 PnL"
              value={
                totalGames > 0
                  ? `${gamePnl >= 0 ? "+" : ""}${formatNumber(gamePnl, { maximumFractionDigits: 0 })}`
                  : "—"
              }
              sub="vUSDT — 전체 게임 합계"
              tone={gamePnl > 0 ? "good" : gamePnl < 0 ? "bad" : "neutral"}
            />
          </>
        ) : view === "trades" ? (
          <>
            <KpiCard
              icon={<Activity className="h-4 w-4" />}
              label="오늘 실현 R"
              value={
                closed.some((t) => t.closed_at && new Date(t.closed_at) >= kstStartUtc)
                  ? `${todayR >= 0 ? "+" : ""}${todayR.toFixed(2)}R`
                  : "—"
              }
              tone={todayR > 0 ? "good" : todayR < 0 ? "bad" : "neutral"}
            />
            <KpiCard
              icon={<Layers className="h-4 w-4" />}
              label="진행 중 포지션"
              value={`${positions.length}건`}
              sub={positions.length > 0 ? "아래 카드 참고" : "없음"}
            />
            <KpiCard
              icon={totalUnrealizedR >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              label="미실현 합계"
              value={
                positions.length > 0
                  ? `${totalUnrealizedR >= 0 ? "+" : ""}${totalUnrealizedR.toFixed(2)}R`
                  : "—"
              }
              sub={
                positions.length > 0
                  ? `${totalUnrealizedUsd >= 0 ? "+" : ""}${formatCurrency(totalUnrealizedUsd, "USD")}`
                  : "진행 중 없음"
              }
              tone={totalUnrealizedR > 0 ? "good" : totalUnrealizedR < 0 ? "bad" : "neutral"}
            />
            <KpiCard
              icon={<Wallet className="h-4 w-4" />}
              label="총 노출"
              value={positions.length > 0 ? `${totalExposurePct.toFixed(1)}%` : "—"}
              sub={
                positions.length > 0
                  ? `${formatCurrency(totalNotional, "USD")} / ${formatCurrency(accountSize, "USD")}`
                  : "—"
              }
            />
          </>
        ) : (
          /* all view — combined */
          <>
            <KpiCard
              icon={<Activity className="h-4 w-4" />}
              label="오늘 통합 PnL"
              value={
                todayGames.length > 0 || closed.some((t) => t.closed_at && new Date(t.closed_at) >= kstStartUtc)
                  ? `${todayTradePnl + todayGamePnl >= 0 ? "+" : ""}${formatNumber(todayTradePnl + todayGamePnl, { maximumFractionDigits: 0 })}`
                  : "—"
              }
              sub={`vUSDT · 거래 ${todayTradePnl >= 0 ? "+" : ""}${formatNumber(todayTradePnl, { maximumFractionDigits: 0 })} · 게임 ${todayGamePnl >= 0 ? "+" : ""}${formatNumber(todayGamePnl, { maximumFractionDigits: 0 })}`}
              tone={todayTradePnl + todayGamePnl > 0 ? "good" : todayTradePnl + todayGamePnl < 0 ? "bad" : "neutral"}
            />
            <KpiCard
              icon={<Layers className="h-4 w-4" />}
              label="진행 중 포지션"
              value={`${positions.length}건`}
              sub={positions.length > 0 ? "거래만 (게임은 즉시 정산)" : "없음"}
            />
            <KpiCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="누적 통합 PnL"
              value={`${totalTradePnl + gamePnl >= 0 ? "+" : ""}${formatNumber(totalTradePnl + gamePnl, { maximumFractionDigits: 0 })}`}
              sub={`vUSDT · 거래 ${formatNumber(totalTradePnl, { maximumFractionDigits: 0 })} · 게임 ${formatNumber(gamePnl, { maximumFractionDigits: 0 })}`}
              tone={totalTradePnl + gamePnl > 0 ? "good" : totalTradePnl + gamePnl < 0 ? "bad" : "neutral"}
            />
            <KpiCard
              icon={<Wallet className="h-4 w-4" />}
              label="활동 횟수"
              value={`${closed.length + totalGames}건`}
              sub={`거래 ${closed.length} · 게임 ${totalGames}`}
            />
          </>
        )}
      </div>

      {/* Pending limit orders — trades only */}
      {view !== "games" && pendingLimits.length > 0 ? (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            대기 중 지정가 주문 ({pendingLimits.length})
          </h2>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">등록 시각</th>
                  <th className="px-4 py-2 text-left">코인</th>
                  <th className="px-4 py-2 text-left">방향</th>
                  <th className="px-4 py-2 text-right">지정가</th>
                  <th className="px-4 py-2 text-right">손절</th>
                  <th className="px-4 py-2 text-right">목표</th>
                  <th className="px-4 py-2 text-right">현재가</th>
                  <th className="px-4 py-2 text-right">진입까지</th>
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
                          {t.direction === "long" ? "롱" : "숏"}
                        </span>
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
            5분마다 가격 확인 후 자동 체결됩니다. 24시간 안에 도달하지 않으면 만료됩니다.
          </p>
        </section>
      ) : null}

      {/* Open positions board — trades only */}
      {view !== "games" && positions.length > 0 ? (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-grade-a" />
            진행 중 포지션 ({positions.length})
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {positions.map((p) => (
              <OpenPositionCard key={p.trade.id} p={p} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Closed trades table — hidden in 'games' view */}
      {view !== "games" ? (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          종료된 거래 ({closed.length})
        </h2>
        {closed.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              아직 종료된 거래가 없습니다.
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">날짜</th>
                  <th className="px-4 py-2 text-left">코인</th>
                  <th className="px-4 py-2 text-left">방향</th>
                  <th className="px-4 py-2 text-left">TF</th>
                  <th className="px-4 py-2 text-left">등급</th>
                  <th className="px-4 py-2 text-right">진입 R:R</th>
                  <th className="px-4 py-2 text-right">실현 R</th>
                  <th className="px-4 py-2 text-right">실현 PnL</th>
                  <th className="px-4 py-2 text-right">ROI</th>
                  <th className="px-4 py-2 text-left">사유</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((t) => {
                  // Prefer the value stored by resolve-trades cron / closeVirtualPositionAction.
                  // For older trades (pre-paper-wallet) compute from price fields as a fallback
                  // so PnL/ROI never show "—" if we have the underlying data.
                  let pnl: number | null = t.paper_realized_pnl != null ? Number(t.paper_realized_pnl) : null;
                  if (pnl == null && t.position_quantity != null) {
                    const entry = Number(t.entry_actual ?? t.entry ?? 0);
                    const exit = Number(t.exit_actual ?? t.exit_price ?? 0);
                    const qty = Number(t.position_quantity);
                    const feesPct = Number(t.fees_pct ?? 0.12);
                    if (entry > 0 && exit > 0 && qty > 0) {
                      const move = t.direction === "long" ? exit - entry : entry - exit;
                      const fees = entry * (feesPct / 100) * qty;
                      pnl = move * qty - fees;
                    }
                  }
                  const acct = t.account_size != null ? Number(t.account_size) : null;
                  const roiPct = pnl != null && acct && acct > 0 ? (pnl / acct) * 100 : null;
                  return (
                    <tr key={t.id} className="border-t border-border hover:bg-accent/40">
                      <td className="px-4 py-2">
                        <Link href={`/app/journal/${t.id}`} className="text-foreground hover:underline">
                          {new Date(t.created_at).toLocaleDateString("ko-KR")}
                        </Link>
                      </td>
                      <td className="px-4 py-2 font-mono">{t.symbol}</td>
                      <td className="px-4 py-2">{t.direction === "long" ? "롱" : "숏"}</td>
                      <td className="px-4 py-2">{t.timeframe}</td>
                      <td className="px-4 py-2">
                        <GradeBadge grade={t.pre_grade as Grade} size="sm" />
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{Number(t.pre_rr ?? 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-mono">
                        {t.result_r != null ? (
                          <span className={Number(t.result_r) >= 0 ? "text-grade-a" : "text-grade-d"}>
                            {Number(t.result_r) >= 0 ? "+" : ""}
                            {Number(t.result_r).toFixed(2)}R
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {pnl != null ? (
                          <span className={pnl >= 0 ? "text-grade-a" : "text-grade-d"}>
                            {pnl >= 0 ? "+" : ""}
                            {formatNumber(pnl, { maximumFractionDigits: 2 })}{" "}
                            <span className="text-[10px] text-muted-foreground">vUSDT</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {roiPct != null ? (
                          <span className={roiPct >= 0 ? "text-grade-a" : "text-grade-d"}>
                            {roiPct >= 0 ? "+" : ""}
                            {roiPct.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {t.exit_reason === "target" ? (
                          <span className="text-grade-a">목표 도달</span>
                        ) : t.exit_reason === "stop" ? (
                          <span className="text-grade-d">손절 적중</span>
                        ) : t.exit_reason === "manual" ? (
                          <span className="text-muted-foreground">수동</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}

      {/* Game history table — shown in 'games' or 'all' view */}
      {view !== "trades" && games.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            종료된 게임 ({games.length})
          </h2>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">시각</th>
                  <th className="px-4 py-2 text-left">코인</th>
                  <th className="px-4 py-2 text-left">방향</th>
                  <th className="px-4 py-2 text-right">베팅</th>
                  <th className="px-4 py-2 text-right">진입가</th>
                  <th className="px-4 py-2 text-right">종가</th>
                  <th className="px-4 py-2 text-right">PnL</th>
                  <th className="px-4 py-2 text-right">ROI</th>
                  <th className="px-4 py-2 text-left">결과</th>
                </tr>
              </thead>
              <tbody>
                {games.map((g) => {
                  const bet = Number(g.bet_points);
                  const pnl = g.pnl_points != null ? Number(g.pnl_points) : null;
                  const roiPct = pnl != null && bet > 0 ? (pnl / bet) * 100 : null;
                  return (
                    <tr key={g.id} className="border-t border-border hover:bg-accent/40">
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(g.entry_time).toLocaleString("ko-KR", { hour12: false })}
                      </td>
                      <td className="px-4 py-2 font-mono">{g.symbol}</td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                            g.direction === "call" ? "bg-grade-a/15 text-grade-a" : "bg-grade-d/15 text-grade-d",
                          )}
                        >
                          {g.direction === "call" ? "상승" : "하락"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{formatNumber(bet, { maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-2 text-right font-mono">{formatNumber(Number(g.entry_price))}</td>
                      <td className="px-4 py-2 text-right font-mono">
                        {g.exit_price != null ? formatNumber(Number(g.exit_price)) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {pnl != null ? (
                          <span className={pnl >= 0 ? "text-grade-a" : "text-grade-d"}>
                            {pnl >= 0 ? "+" : ""}
                            {formatNumber(pnl, { maximumFractionDigits: 2 })}{" "}
                            <span className="text-[10px] text-muted-foreground">vUSDT</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {roiPct != null ? (
                          <span className={roiPct >= 0 ? "text-grade-a" : "text-grade-d"}>
                            {roiPct >= 0 ? "+" : ""}
                            {roiPct.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {g.won === true ? (
                          <span className="text-grade-a font-semibold">WIN</span>
                        ) : g.won === false ? (
                          <span className="text-grade-d font-semibold">LOSE</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {view === "games" && games.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            아직 종료된 게임이 없습니다.{" "}
            <Link href="/app/game" className="text-primary underline-offset-2 hover:underline">
              가격 예측 게임
            </Link>
            에서 첫 베팅을 해보세요.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
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
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
          <span className="text-muted-foreground/60">{icon}</span>
        </div>
        <div className={cn("mt-1 font-mono text-2xl font-bold tabular-nums", toneClass)}>
          {value}
        </div>
        {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
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

function OpenPositionCard({ p }: { p: Position }) {
  const t = p.trade;
  const isLong = t.direction === "long";
  const inProfit = p.netR > 0;
  const noPrice = p.last == null;
  const baseSymbol = t.symbol.replace("USDT", "");

  return (
    <Link
      href={`/app/journal/${t.id}`}
      className={cn(
        "block overflow-hidden rounded-lg border bg-card/70 p-4 transition-colors hover:bg-card",
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
                {isLong ? "롱" : "숏"}
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
          <div className="text-sm text-muted-foreground">가격 가져오기 실패 — 새로고침으로 재시도</div>
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
        <PriceCell label="진입 체결" value={`$${formatNumber(p.entryActual)}`} />
        <PriceCell
          label="현재가"
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
          label="수량"
          value={`${formatNumber(p.qty, { maximumFractionDigits: 4 })} ${baseSymbol}`}
          sub={`노출 ${p.exposurePct.toFixed(1)}%`}
        />
      </div>

      {/* Stop / target progress */}
      {!noPrice ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between text-[10px] uppercase text-muted-foreground">
              <span className="flex items-center gap-1 text-grade-d">
                <TrendingDown className="h-3 w-3" />
                손절까지
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
                목표까지
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
        상세 보기 <ArrowRight className="ml-1 h-3 w-3" />
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
