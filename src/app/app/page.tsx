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
import type { Grade } from "@/types/trade";
import { TodayMarketStrip } from "@/components/market/today-strip";
import { ExpiryBanner } from "@/components/trade/expiry-banner";

export const dynamic = "force-dynamic";

/* ── 라벨 맵 ──────────────────────────────────────────── */

const STRATEGY_LABELS: Record<string, string> = {
  trend_pullback: "추세 눌림목",
  breakout: "돌파",
  range_fade: "박스권 매매",
  reversal: "추세 반전",
  liquidity_grab: "유동성 사냥",
  funding_squeeze: "펀딩 압착",
  session_open_drive: "세션 개장 추세",
  wait: "관망",
};

const STYLE_LABELS: Record<TradingStyle, string> = {
  scalp: "스캘핑",
  day: "데이",
  swing: "스윙",
  position: "포지션",
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
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const displayName = user?.email?.split("@")[0] ?? "트레이더";
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
  const positions = openRows.filter((t) => t.order_status !== "pending");
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
  const suit = entrySuitability(kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes(), kstNow.getUTCDay());
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
              안녕하세요, <span className="text-primary">{displayName}</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {positions.length > 0
                ? `진행 중 ${positions.length}건${pendings.length > 0 ? ` · 대기 주문 ${pendings.length}건` : ""}`
                : pendings.length > 0
                  ? `대기 중 주문 ${pendings.length}건`
                  : "오늘 새 분석으로 시작해보세요."}
            </p>
          </div>
          <Link
            href="/app/guide"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/40 px-4 py-2 text-sm text-foreground transition-colors hover:border-border/80 hover:bg-card/80"
          >
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            사용 방법
          </Link>
        </section>

        <Suspense fallback={null}>
          <ExpiryBanner />
        </Suspense>

        {/* 2. 리소스 + 30일 성과 4카드 */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            href="/app/wallet"
            label="vUSDT 잔액"
            value={formatNumber(balance, { maximumFractionDigits: 0 })}
            sub={balance < 100 ? "충전 필요" : "사용 가능"}
            alert={balance < 100}
          />
          <MetricCard
            href="/app/credits"
            label="AI 크레딧"
            value={String(aiCredits)}
            sub={aiCredits === 0 ? "구매 필요" : `이번 달 ${monthlyAnalyses}회 사용`}
            alert={aiCredits === 0}
          />
          <MetricCard
            href="/app/dashboard"
            label="승률 (30일)"
            value={winRate30 != null ? `${winRate30}%` : "—"}
            sub={closed30 > 0 ? `${closed30}건 청산 기준` : "청산 기록 없음"}
          />
          <MetricCard
            href="/app/dashboard"
            label="누적 R (30일)"
            value={`${cumR30 >= 0 ? "+" : ""}${cumR30.toFixed(1)}R`}
            sub={`${wins30}승 ${closed30 - wins30}패`}
            tone={closed30 === 0 ? undefined : cumR30 >= 0 ? "good" : "bad"}
          />
        </section>

        {/* 3. 오늘의 시장 한 줄 */}
        <Suspense fallback={<TodaySkeleton />}>
          <TodayMarketStrip />
        </Suspense>

        {/* 4. 일일 리스크 게이지 */}
        <section
          className={cn(
            "flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border bg-card/40 px-5 py-4",
            limitHit ? "border-grade-d/50" : limitNear ? "border-grade-c/50" : "border-border/60",
          )}
        >
          <div className="min-w-[150px]">
            <div className="text-sm font-semibold">오늘의 리스크 한도</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              일일 -{DAILY_LIMIT_R}R 도달 시 신규 진입 자제
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
                오늘 {moneyCtx.todayCumulativeR >= 0 ? "+" : ""}
                {moneyCtx.todayCumulativeR.toFixed(1)}R · {moneyCtx.todayClosedCount}건 청산
              </span>
              <span>여유 {remainR.toFixed(1)}R · 한도 -{DAILY_LIMIT_R}R</span>
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
                오늘은 보류
              </>
            ) : limitNear ? (
              <>
                <TriangleAlert className="h-3.5 w-3.5" />
                한도 근접
              </>
            ) : (
              <>
                <CircleCheck className="h-3.5 w-3.5" />
                신규 진입 가능
              </>
            )}
          </span>
        </section>

        {/* 5. 진행 중 포지션 · 대기 주문 */}
        {positions.length > 0 || pendings.length > 0 ? (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">진행 중 포지션 · 대기 주문</h2>
              <Link
                href="/app/virtual-trade"
                className="group inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 hover:text-primary"
              >
                가상 거래
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {positions.slice(0, 3).map((t) => (
                <PositionCard key={t.id as string} trade={t} current={prices[t.symbol as string]} />
              ))}
              {pendings.slice(0, 3 - Math.min(positions.length, 3) || 1).map((t) => (
                <PendingCard key={t.id as string} trade={t} current={prices[t.symbol as string]} />
              ))}
            </div>
          </section>
        ) : null}

        {/* 6. 처음이세요? */}
        {isEmpty ? (
          <Link
            href="/app/guide"
            className="group flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card/40 px-6 py-4 transition-all hover:border-ring/40 hover:bg-card/60"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ring/10 text-primary">
                <HelpCircle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold">처음이세요?</div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  4단계 사이클과 등급 시스템을 한 번에 정리.
                </div>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors group-hover:text-primary">
              사용 방법
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
                최근 거래
              </h2>
              <Link
                href="/app/journal"
                className="group inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 hover:text-primary"
              >
                전체 보기
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <ul className="divide-y divide-border/40 rounded-2xl border border-border/60 bg-card/40">
              {recent.map((t) => {
                const status = (t as { order_status?: string }).order_status;
                const orderType = (t as { order_type?: string }).order_type;
                const ctxLeverage = (t as { context_flags?: { leverage?: number } }).context_flags
                  ?.leverage;
                const isPending = !t.closed_at && status === "pending" && t.result_r == null;
                const isOpen = !t.closed_at && !isPending;
                const dateStr = new Date(t.closed_at ?? t.created_at).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                });
                return (
                  <li key={t.id}>
                    <Link
                      href={`/app/journal/${t.id}`}
                      className="group flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <GradeBadge grade={t.pre_grade as Grade} size="sm" />
                        <span className="font-mono text-sm font-medium">{t.symbol}</span>
                        <span className="text-sm text-muted-foreground">
                          {t.direction === "long" ? "롱" : "숏"} · {t.timeframe}
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
                            title={`레버리지 ${ctxLeverage}x`}
                          >
                            {ctxLeverage}x
                          </span>
                        ) : null}
                        {orderType === "limit" ? (
                          <span className="rounded-md bg-grade-b/10 px-1.5 py-0.5 text-[10px] font-semibold text-grade-b">
                            지정가
                          </span>
                        ) : orderType === "stop" ? (
                          <span className="rounded-md bg-grade-c/10 px-1.5 py-0.5 text-[10px] font-semibold text-grade-c">
                            역지정
                          </span>
                        ) : null}
                        {isPending ? (
                          <span className="rounded-md bg-grade-c/10 px-2 py-0.5 text-xs font-medium text-grade-c">
                            대기
                          </span>
                        ) : isOpen ? (
                          <span className="rounded-md bg-grade-b/15 px-2 py-0.5 text-xs font-medium text-grade-b">
                            진행
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        {t.result_r != null ? (
                          <span
                            className={cn(
                              "font-mono font-medium",
                              Number(t.result_r) >= 0 ? "text-grade-a" : "text-grade-d",
                            )}
                          >
                            {Number(t.result_r) >= 0 ? "+" : ""}
                            {Number(t.result_r).toFixed(2)}R
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
        <section className="rounded-2xl border border-ring/40 bg-card/50 p-4">
          <div className="flex items-center gap-1.5 text-[15px] font-semibold">
            <Zap className="h-4 w-4 text-primary" />
            다음 액션
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
              <div className="mt-3 text-[11px] text-muted-foreground/70">후보 레이더 Top 픽</div>
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
                            .join(" · ") || "신호 관찰 중"}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                          STYLE_BADGE[c.bestStyle],
                        )}
                      >
                        {STYLE_LABELS[c.bestStyle]}
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
            <Sparkles className="h-4 w-4" />새 분석 시작
          </Link>
        </section>

        {/* 최근 AI 분석 */}
        <section className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">최근 AI 분석</h2>
            <Link
              href="/app/analyze/history"
              className="text-xs font-medium text-primary/90 hover:text-primary"
            >
              전체 →
            </Link>
          </div>
          {(analysesRes.data ?? []).length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">아직 분석 기록이 없습니다.</p>
          ) : (
            <ul className="mt-2.5 space-y-1.5">
              {(analysesRes.data ?? []).map((a) => {
                const strat = STRATEGY_LABELS[a.primary_strategy as string] ?? a.primary_strategy;
                const dir =
                  a.strategy_direction === "long"
                    ? "롱"
                    : a.strategy_direction === "short"
                      ? "숏"
                      : "양방향";
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
                          {STYLE_LABELS[a.style as TradingStyle] ?? a.style}
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
          className="group flex items-center justify-between rounded-2xl border border-border/60 bg-card/40 px-4 py-3.5 transition-all hover:border-ring/40 hover:bg-card/60"
        >
          <div>
            <div className="text-sm font-semibold">시장 현황</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              세션 · 심리 지표 · 김프 · 매크로 일정
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>

        {/* 빠른 메뉴 */}
        <div className="grid grid-cols-2 gap-2">
          <QuickLink href="/app/virtual-trade" label="가상 거래" />
          <QuickLink href="/app/game" label="예측 게임" />
          <QuickLink href="/app/journal" label="거래 일지" />
          <QuickLink href="/app/dashboard" label="성과 분석" />
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
        "group flex flex-col gap-2 rounded-2xl border bg-card/40 px-5 py-4 transition-all hover:bg-card/70",
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

function PositionCard({ trade, current }: { trade: OpenTradeRow; current?: number }) {
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
      className="group rounded-2xl border border-border/60 bg-card/40 p-4 transition-all hover:border-ring/40 hover:bg-card/70"
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-bold">{trade.symbol}</span>
        <span
          className={cn(
            "rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold",
            trade.direction === "long" ? "text-grade-a" : "text-grade-d",
          )}
        >
          {trade.direction === "long" ? "롱" : "숏"}
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
        진입 {fmtPx(entry)} → 현재 {current != null ? fmtPx(current) : "—"}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", (unrealR ?? 0) >= 0 ? "bg-grade-a" : "bg-grade-d")}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1.5 text-[10px] text-muted-foreground/70">
        {toTargetPct != null
          ? `목표까지 ${toTargetPct >= 0 ? "+" : ""}${toTargetPct.toFixed(1)}%`
          : "현재가 조회 실패"}
      </div>
    </Link>
  );
}

function PendingCard({ trade, current }: { trade: OpenTradeRow; current?: number }) {
  const trigger = Number(trade.limit_price ?? trade.entry) || 0;
  const isStop = trade.order_type === "stop";
  const distPct =
    current != null && current > 0 ? ((trigger - current) / current) * 100 : null;

  return (
    <Link
      href="/app/journal"
      className="group rounded-2xl border border-grade-c/40 bg-card/40 p-4 transition-all hover:border-grade-c/70 hover:bg-card/70"
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-bold">{trade.symbol}</span>
        <span className="rounded-md bg-grade-c/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-grade-c">
          {trade.direction === "long" ? "롱" : "숏"} · {isStop ? "역지정" : "지정가"}
        </span>
        <span className="ml-auto text-xs font-semibold text-grade-c">트리거 대기</span>
      </div>
      <div className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
        트리거 {fmtPx(trigger)} · 현재 {current != null ? fmtPx(current) : "—"}
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
      <div className="mt-1.5 text-[10px] text-muted-foreground/70">도달 시 자동 체결 · 알림 발송</div>
    </Link>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-xl border border-border/60 bg-card/40 px-3.5 py-2.5 text-sm font-medium transition-all hover:border-ring/40 hover:bg-card/70"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}

function TodaySkeleton() {
  return (
    <div className="flex items-center justify-between gap-6 rounded-2xl border border-border/60 bg-card/40 px-6 py-4">
      <span className="text-sm text-muted-foreground">시장 상태 확인 중…</span>
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        시장 보기
        <ArrowRight className="h-4 w-4" />
      </span>
    </div>
  );
}
