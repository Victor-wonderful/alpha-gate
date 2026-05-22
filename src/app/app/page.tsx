import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  BookOpen,
  Coins,
  Gamepad2,
  HelpCircle,
  LineChart as LineChartIcon,
  Sparkles,
  Wallet,
} from "lucide-react";
import { GradeBadge } from "@/components/trade/grade-badge";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getOrCreateWallet } from "@/lib/paper-wallet";
import { cn, formatNumber } from "@/lib/utils";
import { fetchTicker24h } from "@/lib/analysis/binance";
import type { Grade } from "@/types/trade";

export const dynamic = "force-dynamic";

const QUICK_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"];

async function getQuickTickers() {
  return Promise.all(
    QUICK_SYMBOLS.map(async (s) => {
      try {
        const t = await fetchTicker24h(s);
        return { symbol: s, last: t.lastPrice, change: t.priceChangePercent, ok: true as const };
      } catch {
        return { symbol: s, ok: false as const };
      }
    }),
  );
}

/** Returns the UTC timestamp at the start of the current KST month — used to
 *  count analyses run since the 1st of this calendar month (KST). */
function kstMonthStartUtc(): Date {
  const now = new Date();
  // Shift "now" forward by 9h so the date math runs in KST time.
  const kst = new Date(now.getTime() + 9 * 60 * 60_000);
  const monthStartKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1);
  // Shift back by 9h to express the same moment in UTC.
  return new Date(monthStartKst - 9 * 60 * 60_000);
}

export default async function HomePage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const displayName = user?.email?.split("@")[0] ?? "트레이더";
  const userId = user?.id;

  const monthStart = kstMonthStartUtc();

  const [walletResult, recentRes, tickers, openRes, monthlyAnalysesRes] = await Promise.all([
    userId ? getOrCreateWallet(userId).catch(() => null) : Promise.resolve(null),
    supabase
      .from("trades")
      .select(
        "id, symbol, direction, timeframe, pre_grade, pre_rr, result_r, closed_at, created_at, order_status, order_type",
      )
      .order("created_at", { ascending: false })
      .limit(5),
    getQuickTickers(),
    supabase
      .from("trades")
      .select("id, account_size, position_quantity, entry, entry_actual, order_status, order_type")
      .is("closed_at", null)
      .neq("mode", "backtest"),
    userId
      ? supabase
          .from("analyses")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", monthStart.toISOString())
      : Promise.resolve({ count: 0 }),
  ]);

  const wallet = walletResult;
  const balance = wallet?.usdtBalance ?? 0;
  const available = wallet?.available ?? 0;
  const usedMargin = wallet?.usedMargin ?? 0;
  const aiCredits = wallet?.aiCredits ?? 0;
  const monthlyAnalyses = (monthlyAnalysesRes as { count?: number | null }).count ?? 0;

  const recent = recentRes.data ?? [];
  const openTrades = openRes.data ?? [];
  const openCount = openTrades.filter(
    (t) => (t as { order_status?: string }).order_status !== "pending",
  ).length;
  const pendingCount = openTrades.filter(
    (t) => (t as { order_status?: string }).order_status === "pending",
  ).length;
  // Exposure: sum of (entry_actual or entry) × quantity over open (filled) positions,
  // divided by account size of the first one (assume same wallet).
  const exposure = openTrades.reduce((acc, t) => {
    if ((t as { order_status?: string }).order_status === "pending") return acc;
    const entry = Number(t.entry_actual ?? t.entry ?? 0);
    const qty = Number(t.position_quantity ?? 0);
    return acc + entry * qty;
  }, 0);
  const exposurePct = balance > 0 ? (exposure / balance) * 100 : 0;

  const creditTone = aiCredits === 0 ? "danger" : aiCredits <= 5 ? "warn" : "ok";

  return (
    <div className="space-y-10">
      {/* 1. Hero — 차분하게, 한 줄 인사 + 진행 상황 + 2 CTA */}
      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/30 px-6 py-8 sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 0% 0%, rgba(34,211,238,0.06), transparent 35%), radial-gradient(circle at 100% 0%, rgba(34,211,238,0.03), transparent 40%)",
          }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              매매 전 점검
            </div>
            <h1 className="mt-3 text-3xl font-bold leading-[1.1] tracking-tight">
              안녕하세요, <span className="text-primary">{displayName}</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {openCount > 0
                ? `진행 중 ${openCount}건`
                : pendingCount > 0
                  ? `대기 중 지정가 ${pendingCount}건`
                  : "오늘 새 분석으로 시작해보세요."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/app/guide"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:border-border/80 hover:bg-card/80"
            >
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
              사용 방법
            </Link>
            <Link
              href="/app/analyze"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              AI 분석 시작
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* 2. 리소스 3 카드 — divide + 통일 보더 */}
      <section>
        <div className="grid divide-y divide-border/60 rounded-xl border border-border/60 bg-card/40 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {/* vUSDT */}
          <ResourceCard
            icon={<Coins className="h-4 w-4 text-primary" />}
            label="vUSDT 잔액"
            value={formatNumber(balance, { maximumFractionDigits: 0 })}
            unit="vUSDT"
            footer={
              <div className="grid grid-cols-2 gap-x-4 text-[11px]">
                <Stat label="사용 가능" value={formatNumber(available, { maximumFractionDigits: 0 })} />
                <Stat label="사용 중" value={formatNumber(usedMargin, { maximumFractionDigits: 0 })} />
              </div>
            }
            cta={{ href: "/app/deposit", label: "AAG 충전하기" }}
            ctaTone="muted"
          />

          {/* AI 크레딧 */}
          <ResourceCard
            icon={<Sparkles className={cn(
              "h-4 w-4",
              creditTone === "danger" && "text-grade-d",
              creditTone === "warn" && "text-amber-400",
              creditTone === "ok" && "text-amber-400",
            )} />}
            label="AI 크레딧"
            value={String(aiCredits)}
            unit="회 남음"
            valueColor={
              creditTone === "danger" ? "text-grade-d" : creditTone === "warn" ? "text-amber-400" : undefined
            }
            footer={
              <div className="text-[11px] leading-relaxed text-muted-foreground">
                분석 1회 = 크레딧 1개. <br />
                이번 달 <span className="font-mono font-semibold tabular-nums text-foreground">{monthlyAnalyses}회</span> 사용.
              </div>
            }
            cta={{ href: "/app/credits", label: "크레딧 구매하기" }}
            ctaTone={creditTone === "ok" ? "muted" : "warn"}
          />

          {/* 진행 중 거래 */}
          <ResourceCard
            icon={<Wallet className="h-4 w-4 text-grade-b" />}
            label="진행 중 거래"
            value={String(openCount)}
            unit="건"
            footer={
              <div className="grid grid-cols-2 gap-x-4 text-[11px]">
                <Stat label="대기 중" value={`${pendingCount}건`} />
                <Stat label="노출" value={`${exposurePct.toFixed(1)}%`} />
              </div>
            }
            cta={{ href: "/app/journal", label: "내 거래로" }}
            ctaTone="muted"
          />
        </div>
      </section>

      {/* 3. 처음이세요? 슬림 배너 */}
      <section>
        <Link
          href="/app/guide"
          className="group flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/30 px-6 py-4 transition-colors hover:bg-card/60"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">처음이세요?</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                4단계 사이클 · 등급 시스템 · vUSDT · AI 크레딧 — 한 번에 정리
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-primary">
            사용 방법 보기
            <ArrowRight className="h-3 w-3" />
          </span>
        </Link>
      </section>

      {/* 4. 빠른 진입 — 4 카드 미니멀 */}
      <section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <QuickCard href="/app/analyze" label="AI 분석" Icon={Sparkles} accent="primary" />
          <QuickCard href="/app/virtual-trade" label="트레이딩" Icon={Wallet} accent="grade-b" />
          <QuickCard href="/app/game" label="예측 게임" Icon={Gamepad2} accent="grade-c" />
          <QuickCard href="/app/journal" label="내 결과" Icon={LineChartIcon} accent="grade-a" />
        </div>
      </section>

      {/* 5. 최근 거래 + 주요 종목 */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              최근 거래
            </h3>
            <Link
              href="/app/journal"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              전체 보기
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/30">
            {recent.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                아직 저장한 거래가 없습니다.{" "}
                <Link href="/app/analyze" className="text-primary underline-offset-2 hover:underline">
                  AI 분석
                </Link>
                으로 시작하세요.
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {recent.map((t) => {
                  const status = (t as { order_status?: string }).order_status;
                  const isPending = status === "pending";
                  return (
                    <li key={t.id}>
                      <Link
                        href={`/app/journal/${t.id}`}
                        className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/30"
                      >
                        <div className="flex items-center gap-3">
                          <GradeBadge grade={t.pre_grade as Grade} size="sm" />
                          <span className="font-mono text-sm font-medium">{t.symbol}</span>
                          <span className="text-xs text-muted-foreground">
                            {t.direction === "long" ? "롱" : "숏"} · {t.timeframe}
                          </span>
                          {isPending ? (
                            <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                              대기
                            </span>
                          ) : !t.closed_at ? (
                            <span className="rounded bg-grade-b/15 px-1.5 py-0.5 text-[10px] font-medium text-grade-b">
                              진행
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-4 text-xs">
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
                          <span className="text-muted-foreground">
                            {new Date(t.created_at).toLocaleDateString("ko-KR", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <LineChartIcon className="h-4 w-4 text-muted-foreground" />
              주요 종목
            </h3>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-grade-a" />
              LIVE
            </span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/30">
            <ul className="divide-y divide-border/40">
              {tickers.map((t) => (
                <li key={t.symbol}>
                  {t.ok ? (
                    <Link
                      href={`/app/analyze?symbol=${t.symbol}`}
                      className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/30"
                    >
                      <span className="font-mono text-sm font-medium">{t.symbol.replace("USDT", "")}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm">${formatNumber(t.last)}</span>
                        <span
                          className={cn(
                            "inline-flex w-14 items-center justify-end gap-0.5 font-mono text-xs font-medium",
                            t.change >= 0 ? "text-grade-a" : "text-grade-d",
                          )}
                        >
                          {t.change >= 0 ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {Math.abs(t.change).toFixed(2)}%
                        </span>
                      </div>
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between px-5 py-3 text-muted-foreground">
                      <span className="font-mono text-sm">{t.symbol}</span>
                      <span className="text-xs">조회 실패</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function ResourceCard({
  icon,
  label,
  value,
  unit,
  valueColor,
  footer,
  cta,
  ctaTone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  valueColor?: string;
  footer: React.ReactNode;
  cta: { href: string; label: string };
  ctaTone: "muted" | "warn";
}) {
  return (
    <div className="group px-6 py-5">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-[34px] font-bold leading-none tracking-tight tabular-nums",
            valueColor,
          )}
        >
          {value}
        </span>
        {unit ? <span className="text-[11px] text-muted-foreground">{unit}</span> : null}
      </div>
      <div className="mt-3">{footer}</div>
      <Link
        href={cta.href}
        className={cn(
          "mt-4 inline-flex items-center gap-1 text-[11px] transition-colors",
          ctaTone === "warn" ? "text-amber-400 hover:underline" : "text-muted-foreground hover:text-primary",
        )}
      >
        {cta.label}
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function QuickCard({
  href,
  label,
  Icon,
  accent,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: "primary" | "grade-a" | "grade-b" | "grade-c";
}) {
  const accentStyles = {
    primary: { icon: "text-primary", border: "hover:border-primary/30" },
    "grade-a": { icon: "text-grade-a", border: "hover:border-grade-a/30" },
    "grade-b": { icon: "text-grade-b", border: "hover:border-grade-b/30" },
    "grade-c": { icon: "text-grade-c", border: "hover:border-grade-c/30" },
  } as const;
  const a = accentStyles[accent];
  return (
    <Link
      href={href}
      className={cn(
        "group rounded-xl border border-border/60 bg-card/30 px-5 py-4 transition-colors hover:bg-card/60",
        a.border,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <Icon className={cn("h-5 w-5", a.icon)} />
        <ArrowRight className={cn("h-3.5 w-3.5 text-muted-foreground/40 transition-colors group-hover:", a.icon.replace("text-", "group-hover:text-"))} />
      </div>
      <div className="text-sm font-semibold">{label}</div>
    </Link>
  );
}
