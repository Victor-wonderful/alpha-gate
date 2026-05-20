import Link from "next/link";
import { Activity, ArrowRight, Layers, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradeBadge } from "@/components/trade/grade-badge";
import type { Grade } from "@/types/trade";
import { FlowStepper } from "@/components/app/flow-stepper";
import { ResolveTradesButton } from "./resolve-button";
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
}

export default async function JournalListPage() {
  const supabase = await getSupabaseServer();
  const { data: tradesRaw } = await supabase
    .from("trades")
    .select(
      "id, symbol, direction, timeframe, pre_grade, pre_rr, result_r, closed_at, created_at, entry, entry_actual, stop, target, position_quantity, account_size, fees_pct, exit_reason",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const trades = (tradesRaw ?? []) as TradeRow[];
  const open = trades.filter((t) => !t.closed_at);
  const closed = trades.filter((t) => t.closed_at);

  // Batch fetch current prices for all unique open-position symbols.
  const symbols = Array.from(new Set(open.map((t) => t.symbol)));
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

  return (
    <div className="space-y-6">
      <FlowStepper current="journal" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">내 거래</h1>
          <p className="text-sm text-muted-foreground">
            5분마다 자동 정산되며, 즉시 확인하려면 우측 버튼을 누르세요. 가격은 페이지 새로고침으로 갱신됩니다.
          </p>
        </div>
        <ResolveTradesButton />
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      </div>

      {/* Open positions board */}
      {positions.length > 0 ? (
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

      {/* Closed trades table */}
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
                  <th className="px-4 py-2 text-left">사유</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((t) => (
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
