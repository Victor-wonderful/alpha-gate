import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getOrCreateWallet } from "@/lib/paper-wallet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GradeBadge } from "@/components/trade/grade-badge";
import { EquityCurve } from "./monthly-chart";
import { ArrowDownRight, ArrowUpRight, History, TrendingUp, Wallet } from "lucide-react";
import type { Grade } from "@/types/trade";
import { cn } from "@/lib/utils";
import { FlowStepper } from "@/components/app/flow-stepper";
import { PerfTabs } from "@/components/app/perf-tabs";
import { ClosedTradesTable, type ClosedTradeRow } from "../journal/closed-trades-table";
import { HelpLink } from "@/components/app/help-link";
import { parseMode, activeBucket, bucketOfTrade, type TradeMode } from "@/components/app/mode-filter";
import { getT } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n/messages";

interface ClosedRow {
  id: string;
  timeframe: string;
  pre_rr: number | null;
  created_at: string;
  stop: number;
  account_size: number | null;
  context_flags: { leverage?: number } | null;
  order_type: "market" | "limit" | "stop" | null;
  pre_grade: Grade;
  result_r: number;
  closed_at: string;
  symbol: string;
  direction: "long" | "short";
  exit_reason: "target" | "stop" | "manual" | "timeout" | null;
  mode: "live" | "backtest" | null;
  is_paper: boolean | null;
  paper_realized_pnl: number | null;
  entry: number | null;
  entry_actual: number | null;
  exit_price: number | null;
  exit_actual: number | null;
  position_quantity: number | null;
  fees_pct: number | null;
}

/** Realized PnL fallback for trades closed before paper-wallet system filled
 *  paper_realized_pnl. Uses entry/exit prices and quantity to recompute. */
function realizedPnlOrFallback(r: ClosedRow): number {
  if (r.paper_realized_pnl != null) return Number(r.paper_realized_pnl);
  const entry = Number(r.entry_actual ?? r.entry ?? 0);
  const exit = Number(r.exit_actual ?? r.exit_price ?? 0);
  const qty = Number(r.position_quantity ?? 0);
  const feesPct = Number(r.fees_pct ?? 0.12);
  if (entry <= 0 || exit <= 0 || qty <= 0) return 0;
  const move = r.direction === "long" ? exit - entry : entry - exit;
  return move * qty - entry * (feesPct / 100) * qty;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const sp = await searchParams;
  const t = await getT();
  const tradeMode: TradeMode = parseMode(sp.mode);
  // 탭: 실거래(real, is_paper=false) / 가상거래(paper) / 백테스트(backtest).
  const activeTab = activeBucket(tradeMode); // "real" | "paper" | "backtest"
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [tradesRes, wallet] = await Promise.all([
    supabase
      .from("trades")
      .select(
        "id, timeframe, pre_rr, created_at, stop, account_size, context_flags, order_type, pre_grade, result_r, closed_at, symbol, direction, exit_reason, mode, is_paper, paper_realized_pnl, entry, entry_actual, exit_price, exit_actual, position_quantity, fees_pct",
      )
      .not("closed_at", "is", null)
      .order("closed_at", { ascending: true }),
    user ? getOrCreateWallet(user.id).catch(() => null) : Promise.resolve(null),
  ]);

  const allClosed = ((tradesRes.data ?? []) as unknown as ClosedRow[]).filter((r) => r.result_r != null);
  const rows = allClosed.filter((r) => bucketOfTrade(r) === activeTab);
  const realCount = allClosed.filter((r) => bucketOfTrade(r) === "real").length;
  const paperCount = allClosed.filter((r) => bucketOfTrade(r) === "paper").length;
  const backtestCount = allClosed.filter((r) => bucketOfTrade(r) === "backtest").length;
  const startingBalance = wallet?.startingBalance ?? 10000;

  // ── Headline KPIs ────────────────────────────────────────
  const n = rows.length;
  const totalR = rows.reduce((s, r) => s + Number(r.result_r), 0);
  const wins = rows.filter((r) => Number(r.result_r) > 0).length;
  const losses = rows.filter((r) => Number(r.result_r) < 0).length;
  const breakeven = n - wins - losses;
  const winRate = n > 0 ? (wins / n) * 100 : 0;
  const avgR = n > 0 ? totalR / n : 0;
  const avgWin = wins > 0 ? rows.filter((r) => Number(r.result_r) > 0).reduce((s, r) => s + Number(r.result_r), 0) / wins : 0;
  const avgLoss = losses > 0 ? rows.filter((r) => Number(r.result_r) < 0).reduce((s, r) => s + Number(r.result_r), 0) / losses : 0;
  const profitFactor = avgLoss < 0 ? (wins * avgWin) / Math.abs(losses * avgLoss) : 0;
  const best = rows.reduce((b, r) => (Number(r.result_r) > b ? Number(r.result_r) : b), -Infinity);
  const worst = rows.reduce((w, r) => (Number(r.result_r) < w ? Number(r.result_r) : w), Infinity);

  // PnL · ROI — vUSDT 절대 금액 + 시작 잔액 대비 수익률
  // realizedPnlOrFallback handles trades closed before paper_realized_pnl existed.
  const totalPnl = rows.reduce((s, r) => s + realizedPnlOrFallback(r), 0);
  const roiPct = startingBalance > 0 ? (totalPnl / startingBalance) * 100 : 0;

  // ── Equity curve points ──────────────────────────────────
  let cum = 0;
  const equityData = rows.map((r, i) => {
    cum += Number(r.result_r);
    return { date: r.closed_at, cumR: cum, trade: i + 1 };
  });

  // ── Streak (current win/loss streak ending at latest trade) ──
  let streak = 0;
  let streakSign: "win" | "loss" | "none" = "none";
  if (n > 0) {
    const last = Number(rows[n - 1].result_r);
    streakSign = last > 0 ? "win" : last < 0 ? "loss" : "none";
    for (let i = n - 1; i >= 0; i--) {
      const r = Number(rows[i].result_r);
      if (streakSign === "win" && r > 0) streak++;
      else if (streakSign === "loss" && r < 0) streak++;
      else break;
    }
  }

  // ── Breakdown by grade ───────────────────────────────────
  const byGrade = new Map<Grade, { n: number; sumR: number; wins: number }>();
  for (const g of ["A", "B", "C", "D"] as Grade[]) byGrade.set(g, { n: 0, sumR: 0, wins: 0 });
  for (const r of rows) {
    const g = byGrade.get(r.pre_grade)!;
    g.n += 1;
    g.sumR += Number(r.result_r);
    if (Number(r.result_r) > 0) g.wins += 1;
  }

  // ── Breakdown by direction ───────────────────────────────
  const longStats = aggregateDir(rows, "long");
  const shortStats = aggregateDir(rows, "short");

  // ── Breakdown by exit reason ─────────────────────────────
  const exitStats = {
    target: rows.filter((r) => r.exit_reason === "target").length,
    stop: rows.filter((r) => r.exit_reason === "stop").length,
    manual: rows.filter((r) => r.exit_reason === "manual" || !r.exit_reason).length,
  };

  const hasData = n > 0;

  // 종료된 거래 테이블 — 거래 일지에서 이동. rows는 청산 오름차순이라 최신순으로 뒤집는다.
  const closedRows: ClosedTradeRow[] = [...rows].reverse().map((t) => {
    let pnl: number | null = t.paper_realized_pnl != null ? Number(t.paper_realized_pnl) : null;
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
      entry: Number(t.entry ?? 0),
      entry_actual: t.entry_actual,
      stop: Number(t.stop ?? 0),
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

  return (
    <div className="space-y-5">
      <FlowStepper current="dashboard" />
      <PerfTabs current="perf" />

      {/* 페이지 헤더 — 제목 + 액션 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.title")}</h1>
          <p className="text-xs text-muted-foreground">
            {activeTab === "backtest"
              ? t("dashboard.subtitleBacktest", { n })
              : t("dashboard.subtitleLive", { n })}
          </p>
        </div>
        <HelpLink href="/app/guide/results" />
      </div>

      {/* 실거래 / 가상거래 / 백테스트 탭 */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/app/dashboard?mode=real"
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors",
            activeTab === "real"
              ? "border-grade-a/60 bg-grade-a/10 font-bold text-grade-a"
              : "border-border bg-card font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", activeTab === "real" ? "bg-grade-a" : "bg-grade-a/50")} />
          {t("dashboard.tab.real")}
          <span className="rounded-full bg-card-2 px-1.5 py-px font-mono text-[10px] tabular-nums text-grade-a/90">
            {realCount}
          </span>
        </Link>
        <Link
          href="/app/dashboard?mode=live"
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors",
            activeTab === "paper"
              ? "border-ring bg-primary/10 font-bold"
              : "border-border bg-card font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          <Wallet className={cn("h-3.5 w-3.5", activeTab === "paper" && "text-primary")} />
          {t("dashboard.tab.live")}
          <span className="rounded-full bg-card-2 px-1.5 py-px font-mono text-[10px] tabular-nums text-primary">
            {paperCount}
          </span>
        </Link>
        <Link
          href="/app/dashboard?mode=backtest"
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors",
            activeTab === "backtest"
              ? "border-amber-500/60 bg-amber-500/10 font-bold text-amber-300"
              : "border-border bg-card font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          <History className={cn("h-3.5 w-3.5", activeTab === "backtest" && "text-amber-300")} />
          {t("dashboard.tab.backtest")}
          <span className="rounded-full bg-card-2 px-1.5 py-px font-mono text-[10px] tabular-nums text-amber-300/90">
            {backtestCount}
          </span>
        </Link>
      </div>

      {!hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 p-16 text-center">
            <TrendingUp className="h-8 w-8 text-muted-foreground/40" />
            <div className="text-sm text-muted-foreground">
              {t("dashboard.empty")}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Hero KPIs ────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <>
                <Kpi
                  label={t("dashboard.kpi.totalR")}
                  value={`${totalR >= 0 ? "+" : ""}${totalR.toFixed(2)}R`}
                  sub={t("dashboard.kpi.totalRSub", { n, avg: `${avgR >= 0 ? "+" : ""}${avgR.toFixed(2)}` })}
                  tone={totalR >= 0 ? "good" : "bad"}
                  icon={totalR >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                />
                <Kpi
                  label={t("dashboard.kpi.totalPnl")}
                  value={`${totalPnl >= 0 ? "+" : ""}${totalPnl.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}`}
                  sub={t("dashboard.kpi.totalPnlSub")}
                  tone={totalPnl >= 0 ? "good" : "bad"}
                  icon={totalPnl >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                />
                <Kpi
                  label={t("dashboard.kpi.roi")}
                  value={`${roiPct >= 0 ? "+" : ""}${roiPct.toFixed(2)}%`}
                  sub={t("dashboard.kpi.roiSub", { balance: startingBalance.toLocaleString("ko-KR") })}
                  tone={roiPct >= 0 ? "good" : "bad"}
                />
                <Kpi
                  label={t("dashboard.kpi.winRate")}
                  value={`${winRate.toFixed(1)}%`}
                  sub={`${t("dashboard.kpi.winRateSub", { wins, losses })}${breakeven ? ` · ${t("dashboard.kpi.breakeven", { be: breakeven })}` : ""}`}
                  tone={winRate >= 50 ? "good" : winRate >= 35 ? "neutral" : "bad"}
                />
                <Kpi
                  label={t("dashboard.kpi.profitFactor")}
                  value={profitFactor > 0 ? profitFactor.toFixed(2) : "—"}
                  sub={profitFactor >= 1 ? t("dashboard.kpi.pfPositive") : t("dashboard.kpi.pfNegative")}
                  tone={profitFactor >= 1.5 ? "good" : profitFactor >= 1 ? "neutral" : "bad"}
                />
                <Kpi
                  label={t("dashboard.kpi.streak")}
                  value={streak > 0 ? `${streakSign === "win" ? "🔥 " : streakSign === "loss" ? "🥶 " : ""}${streak}` : "—"}
                  sub={
                    streakSign === "win"
                      ? t("dashboard.kpi.streakWin", { streak })
                      : streakSign === "loss"
                        ? t("dashboard.kpi.streakLoss", { streak })
                        : t("dashboard.kpi.streakNone")
                  }
                  tone={streakSign === "win" ? "good" : streakSign === "loss" ? "bad" : "neutral"}
                />
              </>
          </div>

          {/* ── Equity Curve ─────────────────────────────────── */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
              <div>
                <CardTitle className="text-base">{t("dashboard.equity.title")}</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("dashboard.equity.desc")}</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{t("dashboard.equity.best")}</span>
                <span className="font-mono font-semibold text-grade-a tabular-nums">
                  {best === -Infinity ? "—" : `+${best.toFixed(2)}R`}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{t("dashboard.equity.worst")}</span>
                <span className="font-mono font-semibold text-grade-d tabular-nums">
                  {worst === Infinity ? "—" : `${worst.toFixed(2)}R`}
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <EquityCurve data={equityData} />
            </CardContent>
          </Card>

          {/* ── Breakdown row ────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* 등급별 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("dashboard.byGrade.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {(["A", "B", "C", "D"] as Grade[]).map((g) => {
                  const s = byGrade.get(g)!;
                  const pct = n > 0 ? (s.n / n) * 100 : 0;
                  return (
                    <div key={g} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <GradeBadge grade={g} size="sm" />
                          <span className="text-muted-foreground">{t("dashboard.byGrade.count", { n: s.n, pct: pct.toFixed(0) })}</span>
                        </div>
                        <div className="flex items-baseline gap-2 font-mono tabular-nums">
                          <span className={cn("font-semibold", s.sumR >= 0 ? "text-grade-a" : "text-grade-d")}>
                            {s.sumR >= 0 ? "+" : ""}{s.sumR.toFixed(2)}R
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {t("dashboard.byGrade.avg", { v: s.n > 0 ? (s.sumR / s.n).toFixed(2) : "—" })}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted/30">
                        <div
                          className={cn("h-full rounded-full", s.sumR >= 0 ? "bg-grade-a" : "bg-grade-d")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* 방향별 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("dashboard.byDir.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <DirectionRow label={t("dashboard.byDir.long")} stats={longStats} t={t} />
                <DirectionRow label={t("dashboard.byDir.short")} stats={shortStats} t={t} />
              </CardContent>
            </Card>

            {/* 청산 사유 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("dashboard.exit.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ExitStackedBar
                  target={exitStats.target}
                  stop={exitStats.stop}
                  manual={exitStats.manual}
                  total={n}
                  t={t}
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* 종료된 거래 — 거래 일지(현재 상황)에서 이동 */}
      <section className="space-y-2.5">
        <h2 className="text-[13px] font-semibold text-muted-foreground">
          {t("journal.page.closedSectionTitle", { n: closedRows.length })}
        </h2>
        {closedRows.length === 0 ? (
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

function aggregateDir(rows: ClosedRow[], dir: "long" | "short") {
  const filtered = rows.filter((r) => r.direction === dir);
  const n = filtered.length;
  const sumR = filtered.reduce((s, r) => s + Number(r.result_r), 0);
  const wins = filtered.filter((r) => Number(r.result_r) > 0).length;
  return {
    n,
    sumR,
    avgR: n > 0 ? sumR / n : 0,
    winRate: n > 0 ? (wins / n) * 100 : 0,
  };
}

function Kpi({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "neutral";
  icon?: React.ReactNode;
}) {
  const valueColor =
    tone === "good" ? "text-grade-a" : tone === "bad" ? "text-grade-d" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
          {icon ? <span className={valueColor}>{icon}</span> : null}
        </div>
        <div className={cn("mt-1.5 font-mono text-2xl font-bold tabular-nums", valueColor)}>{value}</div>
        {sub ? <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function DirectionRow({
  label,
  stats,
  t,
}: {
  label: string;
  stats: { n: number; sumR: number; avgR: number; winRate: number };
  t: TFunction;
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{t("dashboard.byDir.count", { n: stats.n })}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
        <div>
          <div className="text-[10px] text-muted-foreground">{t("dashboard.byDir.total")}</div>
          <div className={cn("font-semibold", stats.sumR >= 0 ? "text-grade-a" : "text-grade-d")}>
            {stats.sumR >= 0 ? "+" : ""}{stats.sumR.toFixed(2)}R
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">{t("dashboard.byDir.avg")}</div>
          <div className={cn("font-semibold", stats.avgR >= 0 ? "text-grade-a" : "text-grade-d")}>
            {stats.n > 0 ? `${stats.avgR >= 0 ? "+" : ""}${stats.avgR.toFixed(2)}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">{t("dashboard.byDir.winRate")}</div>
          <div className="font-semibold">{stats.n > 0 ? `${stats.winRate.toFixed(0)}%` : "—"}</div>
        </div>
      </div>
    </div>
  );
}

function ExitStackedBar({
  target,
  stop,
  manual,
  total,
  t,
}: {
  target: number;
  stop: number;
  manual: number;
  total: number;
  t: TFunction;
}) {
  const tPct = total > 0 ? (target / total) * 100 : 0;
  const sPct = total > 0 ? (stop / total) * 100 : 0;
  const mPct = total > 0 ? (manual / total) * 100 : 0;
  return (
    <div className="space-y-3">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-border bg-background/40">
        <div className="bg-grade-a transition-all" style={{ width: `${tPct}%` }} />
        <div className="bg-grade-d transition-all" style={{ width: `${sPct}%` }} />
        <div className="bg-muted-foreground/40 transition-all" style={{ width: `${mPct}%` }} />
      </div>
      <ul className="space-y-1.5 text-xs">
        <ExitRow color="bg-grade-a" label={t("dashboard.exit.target")} n={target} pct={tPct} t={t} />
        <ExitRow color="bg-grade-d" label={t("dashboard.exit.stop")} n={stop} pct={sPct} t={t} />
        <ExitRow color="bg-muted-foreground/40" label={t("dashboard.exit.manual")} n={manual} pct={mPct} t={t} />
      </ul>
    </div>
  );
}

function ExitRow({ color, label, n, pct, t }: { color: string; label: string; n: number; pct: number; t: TFunction }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", color)} />
        <span className="text-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-2 font-mono tabular-nums">
        <span className="text-muted-foreground">{t("dashboard.exit.count", { n })}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
    </li>
  );
}
