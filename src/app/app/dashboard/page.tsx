import { getSupabaseServer } from "@/lib/supabase/server";
import { getOrCreateWallet } from "@/lib/paper-wallet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradeBadge } from "@/components/trade/grade-badge";
import { EquityCurve } from "./monthly-chart";
import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from "lucide-react";
import type { Grade } from "@/types/trade";
import { cn } from "@/lib/utils";
import { FlowStepper } from "@/components/app/flow-stepper";
import { ClusterTabs } from "@/components/app/cluster-tabs";
import { clusters } from "@/components/app/cluster-tabs-config";
import { HelpLink } from "@/components/app/help-link";
import { ViewTabs, parseView, type View } from "@/components/app/view-tabs";

interface ClosedRow {
  pre_grade: Grade;
  result_r: number;
  closed_at: string;
  symbol: string;
  direction: "long" | "short";
  exit_reason: "target" | "stop" | "manual" | null;
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
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  const view: View = parseView(sp.view);
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [tradesRes, gamesRes, wallet] = await Promise.all([
    supabase
      .from("trades")
      .select(
        "pre_grade, result_r, closed_at, symbol, direction, exit_reason, mode, paper_realized_pnl, entry, entry_actual, exit_price, exit_actual, position_quantity, fees_pct",
      )
      .not("closed_at", "is", null)
      .neq("mode", "backtest")
      .order("closed_at", { ascending: true }),
    user
      ? supabase
          .from("binary_games")
          .select("won, pnl_points, bet_points, created_at, direction")
          .eq("user_id", user.id)
          .eq("status", "settled")
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as Array<{ won: boolean | null; pnl_points: number | null; bet_points: number; created_at: string; direction: "call" | "put" }> }),
    user ? getOrCreateWallet(user.id).catch(() => null) : Promise.resolve(null),
  ]);

  const rows = ((tradesRes.data ?? []) as unknown as ClosedRow[]).filter((r) => r.result_r != null);
  const games = (gamesRes.data ?? []) as Array<{
    won: boolean | null;
    pnl_points: number | null;
    bet_points: number;
    created_at: string;
    direction: "call" | "put";
  }>;
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

  // ── Game stats ──────────────────────────────────────────────
  const totalGames = games.length;
  const gameWins = games.filter((g) => g.won === true).length;
  const gameLosses = games.filter((g) => g.won === false).length;
  const gameWinRate = totalGames > 0 ? (gameWins / totalGames) * 100 : 0;
  const gamePnl = games.reduce((s, g) => s + (g.pnl_points != null ? Number(g.pnl_points) : 0), 0);
  const gameRoi = startingBalance > 0 ? (gamePnl / startingBalance) * 100 : 0;
  const totalBet = games.reduce((s, g) => s + Number(g.bet_points), 0);
  // Combined stats (전체)
  const combinedPnl = totalPnl + gamePnl;
  const combinedRoi = startingBalance > 0 ? (combinedPnl / startingBalance) * 100 : 0;
  const combinedWins = wins + gameWins;
  const combinedLosses = losses + gameLosses;
  const combinedN = n + totalGames;
  const combinedWinRate = combinedN > 0 ? (combinedWins / combinedN) * 100 : 0;

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

  const cluster = clusters.results({
    rightSlot: <HelpLink href="/app/guide/results" />,
  });

  // Empty state depends on view: 'games' needs games, others need trades
  const hasData = view === "games" ? totalGames > 0 : view === "all" ? combinedN > 0 : n > 0;

  return (
    <div className="space-y-5">
      <FlowStepper current="dashboard" />
      <ClusterTabs
        title={cluster.title}
        description={
          view === "games"
            ? `종료된 게임 ${totalGames}건 기준.`
            : view === "all"
              ? `종료된 거래 ${n}건 + 게임 ${totalGames}건 기준.`
              : `종료된 라이브 거래 ${n}건 기준. 백테스트 결과는 제외됩니다.`
        }
        tabs={cluster.tabs}
        rightSlot={cluster.rightSlot}
      />

      <ViewTabs
        basePath="/app/dashboard"
        current={view}
        counts={{ all: n + totalGames, trades: n, games: totalGames }}
      />

      {!hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 p-16 text-center">
            <TrendingUp className="h-8 w-8 text-muted-foreground/40" />
            <div className="text-sm text-muted-foreground">
              {view === "games"
                ? "아직 종료된 게임이 없습니다. 가격 예측 게임에서 베팅을 시작하세요."
                : "종료된 거래가 없습니다. 거래를 저장하고 손절·목표 도달 시 자동 정산되면 여기에 표시됩니다."}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Hero KPIs ────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {view === "games" ? (
              <>
                <Kpi
                  label="누적 게임 PnL"
                  value={`${gamePnl >= 0 ? "+" : ""}${gamePnl.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}`}
                  sub="vUSDT — 전체 게임 손익"
                  tone={gamePnl >= 0 ? "good" : "bad"}
                  icon={gamePnl >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                />
                <Kpi
                  label="ROI"
                  value={`${gameRoi >= 0 ? "+" : ""}${gameRoi.toFixed(2)}%`}
                  sub={`시작 잔액 ${startingBalance.toLocaleString("ko-KR")} vUSDT 기준`}
                  tone={gameRoi >= 0 ? "good" : "bad"}
                />
                <Kpi
                  label="승률"
                  value={`${gameWinRate.toFixed(1)}%`}
                  sub={`승 ${gameWins} · 패 ${gameLosses}`}
                  tone={gameWinRate >= 50 ? "good" : gameWinRate >= 35 ? "neutral" : "bad"}
                />
                <Kpi
                  label="총 베팅"
                  value={`${totalGames}판`}
                  sub={`누적 베팅 ${totalBet.toLocaleString("ko-KR")} vUSDT`}
                />
                <Kpi
                  label="평균 베팅"
                  value={totalGames > 0 ? Math.round(totalBet / totalGames).toLocaleString("ko-KR") : "—"}
                  sub="vUSDT / 판"
                />
                <Kpi
                  label="상승 vs 하락"
                  value={`${games.filter((g) => g.direction === "call").length} / ${games.filter((g) => g.direction === "put").length}`}
                  sub="콜(call) / 풋(put) 베팅 수"
                />
              </>
            ) : view === "all" ? (
              <>
                <Kpi
                  label="통합 PnL"
                  value={`${combinedPnl >= 0 ? "+" : ""}${combinedPnl.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}`}
                  sub={`vUSDT · 거래 ${formatSigned(totalPnl, 0)} · 게임 ${formatSigned(gamePnl, 0)}`}
                  tone={combinedPnl >= 0 ? "good" : "bad"}
                  icon={combinedPnl >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                />
                <Kpi
                  label="통합 ROI"
                  value={`${combinedRoi >= 0 ? "+" : ""}${combinedRoi.toFixed(2)}%`}
                  sub={`시작 잔액 ${startingBalance.toLocaleString("ko-KR")} vUSDT 기준`}
                  tone={combinedRoi >= 0 ? "good" : "bad"}
                />
                <Kpi
                  label="통합 승률"
                  value={`${combinedWinRate.toFixed(1)}%`}
                  sub={`승 ${combinedWins} · 패 ${combinedLosses} (거래+게임)`}
                  tone={combinedWinRate >= 50 ? "good" : combinedWinRate >= 35 ? "neutral" : "bad"}
                />
                <Kpi
                  label="거래 누적 R"
                  value={`${totalR >= 0 ? "+" : ""}${totalR.toFixed(2)}R`}
                  sub={`${n}건 · 거래당 평균 ${avgR >= 0 ? "+" : ""}${avgR.toFixed(2)}R`}
                  tone={totalR >= 0 ? "good" : "bad"}
                />
                <Kpi
                  label="Profit Factor (거래)"
                  value={profitFactor > 0 ? profitFactor.toFixed(2) : "—"}
                  sub={profitFactor >= 1 ? "장기 수익 우위" : "장기 손실 우위"}
                  tone={profitFactor >= 1.5 ? "good" : profitFactor >= 1 ? "neutral" : "bad"}
                />
                <Kpi
                  label="활동 수"
                  value={`${combinedN}건`}
                  sub={`거래 ${n} · 게임 ${totalGames}`}
                />
              </>
            ) : (
              <>
                <Kpi
                  label="누적 R"
                  value={`${totalR >= 0 ? "+" : ""}${totalR.toFixed(2)}R`}
                  sub={`${n}건 · 거래당 평균 ${avgR >= 0 ? "+" : ""}${avgR.toFixed(2)}R`}
                  tone={totalR >= 0 ? "good" : "bad"}
                  icon={totalR >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                />
                <Kpi
                  label="누적 PnL"
                  value={`${totalPnl >= 0 ? "+" : ""}${totalPnl.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}`}
                  sub="vUSDT — 종료된 거래의 실현 손익 합계"
                  tone={totalPnl >= 0 ? "good" : "bad"}
                  icon={totalPnl >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                />
                <Kpi
                  label="ROI"
                  value={`${roiPct >= 0 ? "+" : ""}${roiPct.toFixed(2)}%`}
                  sub={`시작 잔액 ${startingBalance.toLocaleString("ko-KR")} vUSDT 기준`}
                  tone={roiPct >= 0 ? "good" : "bad"}
                />
                <Kpi
                  label="승률"
                  value={`${winRate.toFixed(1)}%`}
                  sub={`승 ${wins} · 패 ${losses}${breakeven ? ` · BE ${breakeven}` : ""}`}
                  tone={winRate >= 50 ? "good" : winRate >= 35 ? "neutral" : "bad"}
                />
                <Kpi
                  label="Profit Factor"
                  value={profitFactor > 0 ? profitFactor.toFixed(2) : "—"}
                  sub={profitFactor >= 1 ? "장기 수익 우위" : "장기 손실 우위"}
                  tone={profitFactor >= 1.5 ? "good" : profitFactor >= 1 ? "neutral" : "bad"}
                />
                <Kpi
                  label="현재 연속"
                  value={streak > 0 ? `${streakSign === "win" ? "🔥 " : streakSign === "loss" ? "🥶 " : ""}${streak}` : "—"}
                  sub={
                    streakSign === "win"
                      ? `${streak}연승 진행 중`
                      : streakSign === "loss"
                        ? `${streak}연패 — 리스크 절반 권장`
                        : "기록 없음"
                  }
                  tone={streakSign === "win" ? "good" : streakSign === "loss" ? "bad" : "neutral"}
                />
              </>
            )}
          </div>

          {/* Equity Curve / Breakdowns are trade-based — hide in 'games' view */}
          {view !== "games" ? (
          <>
          {/* ── Equity Curve ─────────────────────────────────── */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
              <div>
                <CardTitle className="text-base">자본 곡선 (Equity Curve)</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">시간순 누적 R. 0선 위는 이익, 아래는 손실.</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">최고</span>
                <span className="font-mono font-semibold text-grade-a tabular-nums">
                  {best === -Infinity ? "—" : `+${best.toFixed(2)}R`}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">최저</span>
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
                <CardTitle className="text-base">진입 등급별 성과</CardTitle>
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
                          <span className="text-muted-foreground">{s.n}건 · {pct.toFixed(0)}%</span>
                        </div>
                        <div className="flex items-baseline gap-2 font-mono tabular-nums">
                          <span className={cn("font-semibold", s.sumR >= 0 ? "text-grade-a" : "text-grade-d")}>
                            {s.sumR >= 0 ? "+" : ""}{s.sumR.toFixed(2)}R
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            평균 {s.n > 0 ? (s.sumR / s.n).toFixed(2) : "—"}
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
                <CardTitle className="text-base">방향별 성과</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <DirectionRow label="롱 (매수)" stats={longStats} />
                <DirectionRow label="숏 (매도)" stats={shortStats} />
              </CardContent>
            </Card>

            {/* 청산 사유 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">청산 사유</CardTitle>
              </CardHeader>
              <CardContent>
                <ExitStackedBar
                  target={exitStats.target}
                  stop={exitStats.stop}
                  manual={exitStats.manual}
                  total={n}
                />
              </CardContent>
            </Card>
          </div>
          </>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Formats a number with sign prefix (used in KPI sub text). */
function formatSigned(n: number, digits = 2): string {
  const v = n.toLocaleString("ko-KR", { maximumFractionDigits: digits });
  return n >= 0 ? `+${v}` : v;
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
}: {
  label: string;
  stats: { n: number; sumR: number; avgR: number; winRate: number };
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{stats.n}건</span>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
        <div>
          <div className="text-[10px] text-muted-foreground">누적</div>
          <div className={cn("font-semibold", stats.sumR >= 0 ? "text-grade-a" : "text-grade-d")}>
            {stats.sumR >= 0 ? "+" : ""}{stats.sumR.toFixed(2)}R
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">평균</div>
          <div className={cn("font-semibold", stats.avgR >= 0 ? "text-grade-a" : "text-grade-d")}>
            {stats.n > 0 ? `${stats.avgR >= 0 ? "+" : ""}${stats.avgR.toFixed(2)}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">승률</div>
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
}: {
  target: number;
  stop: number;
  manual: number;
  total: number;
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
        <ExitRow color="bg-grade-a" label="목표 도달" n={target} pct={tPct} />
        <ExitRow color="bg-grade-d" label="손절 적중" n={stop} pct={sPct} />
        <ExitRow color="bg-muted-foreground/40" label="임의/타임아웃" n={manual} pct={mPct} />
      </ul>
    </div>
  );
}

function ExitRow({ color, label, n, pct }: { color: string; label: string; n: number; pct: number }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", color)} />
        <span className="text-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-2 font-mono tabular-nums">
        <span className="text-muted-foreground">{n}건</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
    </li>
  );
}
