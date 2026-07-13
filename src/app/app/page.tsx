import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  BookOpen,
  CircleCheck,
  Coins,
  HelpCircle,
  Sparkles,
  Timer,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { GradeBadge } from "@/components/trade/grade-badge";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getOrCreateWallet } from "@/lib/paper-wallet";
import { getMoneyContext } from "@/lib/money-management";
import { loadLatestRadar } from "@/lib/analysis/radar-persist";
import { entrySuitability } from "@/lib/analysis/sessions";
import type { TradingStyle } from "@/lib/analysis/style";
import { cn, formatNumber } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n/messages";
import type { Grade } from "@/types/trade";
import { TodayMarketStrip } from "@/components/market/today-strip";
import { ExpiryBanner } from "@/components/trade/expiry-banner";

export const dynamic = "force-dynamic";

/* ── 라벨 맵 ──────────────────────────────────────────── */

const STRATEGY_KEYS: Record<string, string> = {
  trend_pullback: "home.strategy.trend_pullback",
  breakout: "home.strategy.breakout",
  range_fade: "home.strategy.range_fade",
  reversal: "home.strategy.reversal",
  liquidity_grab: "home.strategy.liquidity_grab",
  funding_squeeze: "home.strategy.funding_squeeze",
  session_open_drive: "home.strategy.session_open_drive",
  wait: "home.strategy.wait",
};

const STYLE_KEYS: Record<TradingStyle, string> = {
  scalp: "home.style.scalp",
  day: "home.style.day",
  swing: "home.style.swing",
  position: "home.style.position",
};

const STYLE_BADGE: Record<TradingStyle, string> = {
  scalp: "border-grade-c/40 text-grade-c",
  day: "border-grade-b/40 text-grade-b",
  swing: "border-ring/40 text-primary",
  position: "border-grade-a/40 text-grade-a",
};

/** 일일 손실 한도 (시스템 기준 -2R, grading.ts와 동일) */
const DAILY_LIMIT_R = 2;

function kstMonthStartUtc(): Date {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60_000);
  const monthStartKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1);
  return new Date(monthStartKst - 9 * 60 * 60_000);
}

/** 진행 중 포지션 카드용 현재가 (Binance Futures). 실패 시 null. */
async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  const unique = [...new Set(symbols)].slice(0, 10);
  const out: Record<string, number> = {};
  await Promise.all(
    unique.map(async (s) => {
      try {
        const res = await fetch(
          `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${encodeURIComponent(s)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const j = (await res.json()) as { price?: string };
        const p = Number(j.price);
        if (Number.isFinite(p) && p > 0) out[s] = p;
      } catch {
        /* 시세 실패는 카드에서 현재가 미표시로 처리 */
      }
    }),
  );
  return out;
}

export default async function HomePage() {
  const t = await getT();
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const displayName = user?.email?.split("@")[0] ?? t("home.defaultName");
  const userId = user?.id;

  const monthStart = kstMonthStartUtc();
  const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [walletResult, profileRes, recentRes, openRes, monthlyAnalysesRes, statsRes, analysesRes, radar] =
    await Promise.all([
      userId ? getOrCreateWallet(userId).catch(() => null) : Promise.resolve(null),
      supabase.from("profiles").select("default_account_size").eq("id", userId ?? "").maybeSingle(),
      supabase
        .from("trades")
        .select(
          "id, symbol, direction, timeframe, pre_grade, result_r, closed_at, created_at, order_status, order_type, context_flags",
        )
        .neq("mode", "backtest")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("trades")
        .select(
          "id, symbol, direction, entry, stop, target, position_quantity, order_status, order_type, limit_price, context_flags, created_at",
        )
        .is("closed_at", null)
        .neq("mode", "backtest")
        .order("created_at", { ascending: false })
        .limit(8),
      userId
        ? supabase
            .from("analyses")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .gte("created_at", monthStart.toISOString())
        : Promise.resolve({ count: 0 }),
      supabase
        .from("trades")
        .select("result_r")
        .neq("mode", "backtest")
        .not("result_r", "is", null)
        .gte("closed_at", d30),
      supabase
        .from("analyses")
        .select("id, symbol, style, primary_strategy, strategy_direction, created_at")
        .order("created_at", { ascending: false })
        .limit(3),
      loadLatestRadar().catch(() => ({ candidates: [], scannedAt: null })),
    ]);

  const wallet = walletResult;
  const balance = wallet?.usdtBalance ?? 0;
  const aiCredits = wallet?.aiCredits ?? 0;
  const monthlyAnalyses = (monthlyAnalysesRes as { count?: number | null }).count ?? 0;
  const accountSize = Number(profileRes.data?.default_account_size) || balance || 10_000;

  const moneyCtx = await getMoneyContext(accountSize);

  // 30일 성과
  const rs = (statsRes.data ?? []).map((r) => Number(r.result_r) || 0);
  const closed30 = rs.length;
  const wins30 = rs.filter((r) => r > 0).length;
  const winRate30 = closed30 > 0 ? Math.round((wins30 / closed30) * 100) : null;
  const cumR30 = rs.reduce((s, r) => s + r, 0);

  const recent = recentRes.data ?? [];
  const openRows = openRes.data ?? [];
  // 진행 중 포지션 = 실제 진입(체결)된 것만. 미체결(pending)·취소(canceled)·만료(expired) 주문은
  // 포지션이 아니다. (취소된 STOP 주문이 마진 $0 유령 포지션으로 잘못 표시되던 버그)
  const positions = openRows.filter(
    (t) => t.order_status === "filled" || t.order_status == null,
  );
  const pendings = openRows.filter(
    (t) => t.order_status === "pending" && (t.order_type === "limit" || t.order_type === "stop"),
  );
  const prices = await fetchPrices(openRows.map((t) => t.symbol as string));

  // 리스크 게이지
  const usedR = Math.min(Math.max(-moneyCtx.todayCumulativeR, 0), DAILY_LIMIT_R);
  const usedPct = Math.round((usedR / DAILY_LIMIT_R) * 100);
  const remainR = DAILY_LIMIT_R - usedR;
  const limitHit = moneyCtx.todayCumulativeR <= -DAILY_LIMIT_R;
  const limitNear = !limitHit && moneyCtx.todayCumulativeR <= -(DAILY_LIMIT_R - 0.5);

  // 다음 액션 — 세션 기반 타이밍 힌트
  const kstNow = new Date(Date.now() + 9 * 60 * 60_000);
  const suit = entrySuitability(kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes(), kstNow.getUTCDay(), t);
  const topPicks = radar.candidates.slice(0, 2);

  const isEmpty = recent.length === 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      {/* ════════ 메인 컬럼 ════════ */}
      <div className="min-w-0 space-y-6">
        {/* 1. Hero */}
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold leading-[1.15]">
              {t("home.greeting")} <span className="text-primary">{displayName}</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {positions.length > 0
                ? pendings.length > 0
                  ? t("home.heroPositionsPendings", { p: positions.length, q: pendings.length })
                  : t("home.heroPositions", { p: positions.length })
                : pendings.length > 0
                  ? t("home.heroPendings", { q: pendings.length })
                  : t("home.heroEmpty")}
            </p>
          </div>
          <Link
            href="/app/guide"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card shadow-card px-4 py-2 text-sm text-foreground transition-colors hover:border-border/80 hover:shadow-card-hover hover:-translate-y-0.5"
          >
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            {t("home.howToUse")}
          </Link>
        </section>

        <Suspense fallback={null}>
          <ExpiryBanner />
        </Suspense>

        {/* 2. 리소스 + 30일 성과 4카드 */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            href="/app/wallet"
            label={t("home.metric.balance")}
            value={formatNumber(balance, { maximumFractionDigits: 0 })}
            sub={balance < 100 ? t("home.metric.balanceNeedCharge") : t("home.metric.balanceAvailable")}
            alert={balance < 100}
          />
          <MetricCard
            href="/app/credits"
            label={t("home.metric.credits")}
            value={String(aiCredits)}
            sub={aiCredits === 0 ? t("home.metric.creditsNeedBuy") : t("home.metric.creditsUsedThisMonth", { n: monthlyAnalyses })}
            alert={aiCredits === 0}
          />
          <MetricCard
            href="/app/dashboard"
            label={t("home.metric.winRate")}
            value={winRate30 != null ? `${winRate30}%` : "—"}
            sub={closed30 > 0 ? t("home.metric.winRateBasis", { n: closed30 }) : t("home.metric.winRateNoData")}
          />
          <MetricCard
            href="/app/dashboard"
            label={t("home.metric.cumR")}
            value={`${cumR30 >= 0 ? "+" : ""}${cumR30.toFixed(1)}R`}
            sub={t("home.metric.cumRRecord", { w: wins30, l: closed30 - wins30 })}
            tone={closed30 === 0 ? undefined : cumR30 >= 0 ? "good" : "bad"}
          />
        </section>

        {/* 3. 오늘의 시장 한 줄 */}
        <Suspense fallback={<TodaySkeleton t={t} />}>
          <TodayMarketStrip />
        </Suspense>

        {/* 4. 일일 리스크 게이지 */}
        <section
          className={cn(
            "flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border bg-card shadow-card px-5 py-4",
            limitHit ? "border-grade-d/50" : limitNear ? "border-grade-c/50" : "border-border/60",
          )}
        >
          <div className="min-w-[150px]">
            <div className="text-sm font-semibold">{t("home.risk.title")}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {t("home.risk.subtitle", { r: DAILY_LIMIT_R })}
            </div>
          </div>
          <div className="min-w-[180px] flex-1">
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  limitHit ? "bg-grade-d" : limitNear ? "bg-grade-c" : usedR > 0 ? "bg-grade-c/80" : "bg-grade-a/60",
                )}
                style={{ width: `${Math.max(usedPct, usedR > 0 ? 6 : 0)}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
              <span>
                {t("home.risk.todayStat", {
                  r: `${moneyCtx.todayCumulativeR >= 0 ? "+" : ""}${moneyCtx.todayCumulativeR.toFixed(1)}`,
                  n: moneyCtx.todayClosedCount,
                })}
              </span>
              <span>{t("home.risk.remaining", { r: remainR.toFixed(1), limit: DAILY_LIMIT_R })}</span>
            </div>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
              limitHit
                ? "bg-grade-d/15 text-grade-d"
                : limitNear
                  ? "bg-grade-c/15 text-grade-c"
                  : "bg-grade-a/15 text-grade-a",
            )}
          >
            {limitHit ? (
              <>
                <TriangleAlert className="h-3.5 w-3.5" />
                {t("home.risk.hold")}
              </>
            ) : limitNear ? (
              <>
                <TriangleAlert className="h-3.5 w-3.5" />
                {t("home.risk.near")}
              </>
            ) : (
              <>
                <CircleCheck className="h-3.5 w-3.5" />
                {t("home.risk.ok")}
              </>
            )}
          </span>
        </section>

        {/* 5. 진행 중 포지션 · 대기 주문 */}
        {positions.length > 0 || pendings.length > 0 ? (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">{t("home.openSection.title")}</h2>
              <Link
                href="/app/virtual-trade"
                className="group inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 hover:text-primary"
              >
                {t("home.quick.virtualTrade")}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {positions.slice(0, 3).map((row) => (
                <PositionCard key={row.id as string} trade={row} current={prices[row.symbol as string]} t={t} />
              ))}
              {pendings.slice(0, 3 - Math.min(positions.length, 3) || 1).map((row) => (
                <PendingCard key={row.id as string} trade={row} current={prices[row.symbol as string]} t={t} />
              ))}
            </div>
          </section>
        ) : null}

        {/* 6. 처음이세요? */}
        {isEmpty ? (
          <Link
            href="/app/guide"
            className="group flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card shadow-card px-6 py-4 transition-all hover:border-ring/40 hover:shadow-card-hover hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ring/10 text-primary">
                <HelpCircle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold">{t("home.firstTime.title")}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  {t("home.firstTime.desc")}
                </div>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors group-hover:text-primary">
              {t("home.howToUse")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ) : null}

        {/* 7. 최근 거래 */}
        {!isEmpty ? (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                {t("home.recent.title")}
              </h2>
              <Link
                href="/app/journal"
                className="group inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 hover:text-primary"
              >
                {t("home.recent.viewAll")}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <ul className="divide-y divide-border/40 rounded-2xl border border-border/60 bg-card shadow-card">
              {recent.map((tr) => {
                const status = (tr as { order_status?: string }).order_status;
                const orderType = (tr as { order_type?: string }).order_type;
                const ctxLeverage = (tr as { context_flags?: { leverage?: number } }).context_flags
                  ?.leverage;
                const isPending = !tr.closed_at && status === "pending" && tr.result_r == null;
                const isOpen = !tr.closed_at && !isPending;
                const dateStr = new Date(tr.closed_at ?? tr.created_at).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                });
                return (
                  <li key={tr.id}>
                    <Link
                      href={`/app/journal/${tr.id}`}
                      className="group flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <GradeBadge grade={tr.pre_grade as Grade} size="sm" />
                        <span className="font-mono text-sm font-medium">{tr.symbol}</span>
                        <span className="text-sm text-muted-foreground">
                          {tr.direction === "long" ? t("common.long") : t("common.short")} · {tr.timeframe}
                        </span>
                        {ctxLeverage ? (
                          <span
                            className={cn(
                              "rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums",
                              ctxLeverage >= 20
                                ? "border-grade-d/40 text-grade-d"
                                : ctxLeverage >= 10
                                  ? "border-grade-c/40 text-grade-c"
                                  : "border-border text-muted-foreground",
                            )}
                            title={t("home.recent.leverageTitle", { n: ctxLeverage })}
                          >
                            {ctxLeverage}x
                          </span>
                        ) : null}
                        {orderType === "limit" ? (
                          <span className="rounded-md bg-grade-b/10 px-1.5 py-0.5 text-[10px] font-semibold text-grade-b">
                            {t("home.orderType.limit")}
                          </span>
                        ) : orderType === "stop" ? (
                          <span className="rounded-md bg-grade-c/10 px-1.5 py-0.5 text-[10px] font-semibold text-grade-c">
                            {t("home.orderType.stop")}
                          </span>
                        ) : null}
                        {isPending ? (
                          <span className="rounded-md bg-grade-c/10 px-2 py-0.5 text-xs font-medium text-grade-c">
                            {t("home.status.pending")}
                          </span>
                        ) : isOpen ? (
                          <span className="rounded-md bg-grade-b/15 px-2 py-0.5 text-xs font-medium text-grade-b">
                            {t("home.status.open")}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        {tr.result_r != null ? (
                          <span
                            className={cn(
                              "font-mono font-medium",
                              Number(tr.result_r) >= 0 ? "text-grade-a" : "text-grade-d",
                            )}
                          >
                            {Number(tr.result_r) >= 0 ? "+" : ""}
                            {Number(tr.result_r).toFixed(2)}R
                          </span>
                        ) : null}
                        <span className="text-muted-foreground">{dateStr}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>

      {/* ════════ 우측 레일 ════════ */}
      <aside className="min-w-0 space-y-4">
        {/* 다음 액션 */}
        <section className="rounded-2xl border border-ring/40 bg-card shadow-card p-4">
          <div className="flex items-center gap-1.5 text-[15px] font-semibold">
            <Zap className="h-4 w-4 text-primary" />
            {t("home.nextAction.title")}
          </div>
          <div
            className={cn(
              "mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs",
              suit.tier === "optimal"
                ? "bg-grade-a/10 text-grade-a"
                : suit.tier === "good"
                  ? "bg-ring/10 text-primary"
                  : suit.tier === "caution"
                    ? "bg-grade-c/10 text-grade-c"
                    : "bg-grade-d/10 text-grade-d",
            )}
          >
            <Timer className="mt-0.5 h-3.5 w-3.5 flex-none" />
            <span>
              {suit.label} — {suit.advice}
            </span>
          </div>
          {topPicks.length > 0 ? (
            <>
              <div className="mt-3 text-[11px] text-muted-foreground/70">{t("home.nextAction.topPicks")}</div>
              <ul className="mt-1.5 space-y-1.5">
                {topPicks.map((c) => (
                  <li key={c.symbol}>
                    <Link
                      href={`/app/analyze?symbol=${encodeURIComponent(c.symbol)}&style=${c.bestStyle}`}
                      className="group flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-xs font-semibold">{c.symbol}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {c.signals
                            .slice(0, 2)
                            .map((s) => s.label)
                            .join(" · ") || t("home.nextAction.observing")}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                          STYLE_BADGE[c.bestStyle],
                        )}
                      >
                        {t(STYLE_KEYS[c.bestStyle])}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <Link
            href="/app/analyze"
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Sparkles className="h-4 w-4" />
            {t("home.nextAction.startAnalysis")}
          </Link>
        </section>

        {/* 최근 AI 분석 */}
        <section className="rounded-2xl border border-border/60 bg-card shadow-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">{t("home.aiRecent.title")}</h2>
            <Link
              href="/app/analyze/history"
              className="text-xs font-medium text-primary/90 hover:text-primary"
            >
              {t("home.aiRecent.viewAll")}
            </Link>
          </div>
          {(analysesRes.data ?? []).length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">{t("home.aiRecent.empty")}</p>
          ) : (
            <ul className="mt-2.5 space-y-1.5">
              {(analysesRes.data ?? []).map((a) => {
                const stratKey = STRATEGY_KEYS[a.primary_strategy as string];
                const strat = stratKey ? t(stratKey) : a.primary_strategy;
                const dir =
                  a.strategy_direction === "long"
                    ? t("common.long")
                    : a.strategy_direction === "short"
                      ? t("common.short")
                      : t("home.aiRecent.bothWays");
                return (
                  <li key={a.id as string}>
                    <Link
                      href={`/app/analyze?load=${a.id}`}
                      className="group flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-xs font-semibold">{a.symbol}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {strat}
                          {a.primary_strategy !== "wait" ? ` · ${dir}` : ""} ·{" "}
                          {STYLE_KEYS[a.style as TradingStyle] ? t(STYLE_KEYS[a.style as TradingStyle]) : a.style}
                        </span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 시장 현황 바로가기 */}
        <Link
          href="/app/market"
          className="group flex items-center justify-between rounded-2xl border border-border/60 bg-card shadow-card px-4 py-3.5 transition-all hover:border-ring/40 hover:shadow-card-hover hover:-translate-y-0.5"
        >
          <div>
            <div className="text-sm font-semibold">{t("home.marketLink.title")}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {t("home.marketLink.desc")}
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>

        {/* 빠른 메뉴 */}
        <div className="grid grid-cols-2 gap-2">
          <QuickLink href="/app/virtual-trade" label={t("home.quick.virtualTrade")} />
          <QuickLink href="/app/analyze" label={t("home.quick.analyze")} />
          <QuickLink href="/app/journal" label={t("home.quick.journal")} />
          <QuickLink href="/app/dashboard" label={t("home.quick.dashboard")} />
        </div>
      </aside>
    </div>
  );
}

/* ── 보조 컴포넌트 ────────────────────────────────────── */

function MetricCard({
  href,
  label,
  value,
  sub,
  alert,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-2 rounded-2xl border bg-card shadow-card px-5 py-4 transition-all hover:shadow-card-hover hover:-translate-y-0.5",
        alert ? "border-grade-d/40 hover:border-grade-d/70" : "border-border/60 hover:border-ring/40",
      )}
    >
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
        {label}
        <ArrowRight className="h-3 w-3 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <span
        className={cn(
          "font-mono text-2xl font-bold leading-[1.15] tabular-nums",
          alert && "text-grade-d",
          tone === "good" && "text-grade-a",
          tone === "bad" && "text-grade-d",
        )}
      >
        {value}
      </span>
      {sub ? (
        <p className={cn("text-[11px]", alert ? "text-grade-d" : "text-muted-foreground")}>{sub}</p>
      ) : null}
    </Link>
  );
}

type OpenTradeRow = {
  id: string;
  symbol: string;
  direction: string;
  entry: number | string | null;
  stop: number | string | null;
  target: number | string | null;
  position_quantity: number | string | null;
  order_type: string | null;
  limit_price: number | string | null;
  context_flags: { leverage?: number } | null;
};

function fmtPx(n: number): string {
  return formatNumber(n, { maximumFractionDigits: n >= 100 ? 1 : n >= 1 ? 2 : 4 });
}

function PositionCard({ trade, current, t }: { trade: OpenTradeRow; current?: number; t: TFunction }) {
  const entry = Number(trade.entry) || 0;
  const stop = Number(trade.stop) || 0;
  const target = Number(trade.target) || 0;
  const dir = trade.direction === "long" ? 1 : -1;
  const lev = trade.context_flags?.leverage;

  const riskPerUnit = Math.abs(entry - stop);
  const unrealR =
    current != null && riskPerUnit > 0 ? ((current - entry) * dir) / riskPerUnit : null;
  const progress =
    current != null && target !== entry
      ? Math.min(Math.max(((current - entry) / (target - entry)) * 100, 0), 100)
      : 0;
  const toTargetPct = current != null && current > 0 ? ((target - current) / current) * 100 : null;

  return (
    <Link
      href="/app/journal"
      className="group rounded-2xl border border-border/60 bg-card shadow-card p-4 transition-all hover:border-ring/40 hover:shadow-card-hover hover:-translate-y-0.5"
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-bold">{trade.symbol}</span>
        <span
          className={cn(
            "rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold",
            trade.direction === "long" ? "text-grade-a" : "text-grade-d",
          )}
        >
          {trade.direction === "long" ? t("common.long") : t("common.short")}
          {lev ? ` ${lev}x` : ""}
        </span>
        <span
          className={cn(
            "ml-auto font-mono text-base font-bold tabular-nums",
            unrealR == null ? "text-muted-foreground" : unrealR >= 0 ? "text-grade-a" : "text-grade-d",
          )}
        >
          {unrealR == null ? "—" : `${unrealR >= 0 ? "+" : ""}${unrealR.toFixed(2)}R`}
        </span>
      </div>
      <div className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
        {t("home.posCard.entryToCurrent", { entry: fmtPx(entry), current: current != null ? fmtPx(current) : "—" })}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", (unrealR ?? 0) >= 0 ? "bg-grade-a" : "bg-grade-d")}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1.5 text-[10px] text-muted-foreground/70">
        {toTargetPct != null
          ? t("home.posCard.toTarget", { pct: `${toTargetPct >= 0 ? "+" : ""}${toTargetPct.toFixed(1)}` })
          : t("home.posCard.priceFail")}
      </div>
    </Link>
  );
}

function PendingCard({ trade, current, t }: { trade: OpenTradeRow; current?: number; t: TFunction }) {
  const trigger = Number(trade.limit_price ?? trade.entry) || 0;
  const isStop = trade.order_type === "stop";
  const distPct =
    current != null && current > 0 ? ((trigger - current) / current) * 100 : null;

  return (
    <Link
      href="/app/journal"
      className="group rounded-2xl border border-grade-c/40 bg-card shadow-card p-4 transition-all hover:border-grade-c/70 hover:shadow-card-hover hover:-translate-y-0.5"
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-bold">{trade.symbol}</span>
        <span className="rounded-md bg-grade-c/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-grade-c">
          {trade.direction === "long" ? t("common.long") : t("common.short")} · {isStop ? t("home.orderType.stop") : t("home.orderType.limit")}
        </span>
        <span className="ml-auto text-xs font-semibold text-grade-c">{t("home.pendCard.waitingTrigger")}</span>
      </div>
      <div className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
        {t("home.pendCard.triggerCurrent", { trigger: fmtPx(trigger), current: current != null ? fmtPx(current) : "—" })}
        {distPct != null ? ` (${distPct >= 0 ? "+" : ""}${distPct.toFixed(1)}%)` : ""}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-grade-c"
          style={{
            width: `${distPct == null ? 0 : Math.min(Math.max(100 - Math.abs(distPct) * 12, 8), 96)}%`,
          }}
        />
      </div>
      <div className="mt-1.5 text-[10px] text-muted-foreground/70">{t("home.pendCard.autoFill")}</div>
    </Link>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-xl border border-border/60 bg-card shadow-card px-3.5 py-2.5 text-sm font-medium transition-all hover:border-ring/40 hover:shadow-card-hover hover:-translate-y-0.5"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}

function TodaySkeleton({ t }: { t: TFunction }) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-2xl border border-border/60 bg-card shadow-card px-6 py-4">
      <span className="text-sm text-muted-foreground">{t("home.todaySkeleton.checking")}</span>
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        {t("home.todaySkeleton.viewMarket")}
        <ArrowRight className="h-4 w-4" />
      </span>
    </div>
  );
}
