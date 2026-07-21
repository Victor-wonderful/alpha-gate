import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GradeBadge } from "@/components/trade/grade-badge";
import { OutcomeForm } from "./outcome-form";
import { CoachCard } from "./coach-card";
import { DeleteTradeButton } from "./delete-button";
import { ResolveTradesButton } from "../resolve-button";
import { UnrealizedPnl } from "./unrealized-pnl";
import {
  MARKET_CHECK_KEYS,
  TRIGGER_CHECK_KEYS,
  type Grade,
} from "@/types/trade";
import { formatNumber } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n/messages";

export const maxDuration = 60;

export default async function JournalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getT();
  const supabase = await getSupabaseServer();
  const { data: trade } = await supabase.from("trades").select("*").eq("id", id).maybeSingle();
  if (!trade) notFound();

  const market = (trade.market_checks ?? {}) as Record<string, boolean>;
  const ctx = (trade.context_flags ?? {}) as {
    leverage?: number;
    trigger?: Record<string, boolean>;
    marketCtx?: {
      btcPrice?: number | null;
      btc24hChangePct?: number | null;
      fundingRate?: number | null;
      minutesToFunding?: number | null;
    };
  };
  const trigger = ctx.trigger ?? {};
  const mctx = ctx.marketCtx ?? {};
  const hasTrigger = Object.keys(trigger).length > 0;
  const hasMctx = mctx.btcPrice !== undefined && mctx.btcPrice !== null;

  const notional = Number(trade.entry) * Number(trade.position_quantity);
  const stopPct =
    Number(trade.entry) > 0
      ? ((Number(trade.stop) - Number(trade.entry)) / Number(trade.entry)) * 100
      : 0;
  const targetPct =
    Number(trade.entry) > 0
      ? ((Number(trade.target) - Number(trade.entry)) / Number(trade.entry)) * 100
      : 0;

  // 자동 정산(목표/손절) + 자동 청산(만료) 둘 다 자동 처리로 본다.
  const autoResolved =
    Boolean(trade.closed_at) &&
    (trade.exit_reason === "target" || trade.exit_reason === "stop" || trade.exit_reason === "timeout");
  const isTimeout = trade.exit_reason === "timeout";
  const isOpen = !trade.closed_at;
  const tfHrs: Record<string, number> = { "15m": 48, "1h": 7 * 24, "4h": 14 * 24, "1D": 30 * 24 };
  const timeoutHours = tfHrs[trade.timeframe] ?? 168;
  const ageHours = (Date.now() - new Date(trade.created_at).getTime()) / 3_600_000;
  const remainingHours = Math.max(0, timeoutHours - ageHours);

  return (
    <div className="space-y-6">
      {isOpen ? (
        <>
          <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-primary">🕐</span>
                <span className="font-semibold text-primary">{t("journal.detail.autoResolveWaiting")}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">
                  {t("journal.detail.autoResolveHint", { hours: remainingHours.toFixed(0) })}
                </span>
              </div>
              <ResolveTradesButton />
            </div>
          </div>
          <UnrealizedPnl
            symbol={trade.symbol}
            direction={trade.direction as "long" | "short"}
            entryActual={Number(trade.entry_actual ?? trade.entry)}
            stop={Number(trade.stop)}
            target={Number(trade.target)}
            positionQuantity={Number(trade.position_quantity)}
            feesPct={Number(trade.fees_pct ?? 0.12)}
          />
        </>
      ) : autoResolved ? (
        <div className={`rounded-lg border px-4 py-2.5 text-sm ${trade.exit_reason === "target" ? "border-grade-a/40 bg-grade-a/10" : isTimeout ? "border-amber-500/40 bg-amber-500/10" : "border-grade-d/40 bg-grade-d/10"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={trade.exit_reason === "target" ? "text-grade-a" : isTimeout ? "text-amber-500" : "text-grade-d"}>
              {trade.exit_reason === "target" ? "🎯" : isTimeout ? "⏰" : "✕"}
            </span>
            <span className={`font-semibold ${trade.exit_reason === "target" ? "text-grade-a" : isTimeout ? "text-amber-500" : "text-grade-d"}`}>
              {trade.exit_reason === "target" ? t("journal.detail.autoResolvedTarget") : isTimeout ? t("journal.detail.autoResolvedTimeout") : t("journal.detail.autoResolvedStop")}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              {t("journal.detail.resultR", { value: `${Number(trade.result_r) >= 0 ? "+" : ""}${Number(trade.result_r).toFixed(2)}` })} · {new Date(trade.closed_at as string).toLocaleString("ko-KR")}
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {trade.symbol} · {trade.direction === "long" ? t("common.long") : t("common.short")} · {trade.timeframe}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(trade.created_at).toLocaleString("ko-KR")}
            {ctx.leverage ? ` · ${ctx.leverage}x` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <GradeBadge grade={trade.pre_grade as Grade} />
          <DeleteTradeButton id={trade.id} symbol={trade.symbol} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 진입 시 평가 */}
        <Card>
          <CardHeader>
            <CardTitle>{t("journal.detail.entryEvalTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row
              label={t("journal.detail.intendedEntry")}
              value={`$${formatNumber(Number(trade.entry))}`}
              sub={t("journal.detail.userInput")}
            />
            {trade.entry_actual != null ? (
              <Row
                label={t("journal.detail.actualFill")}
                value={`$${formatNumber(Number(trade.entry_actual))}`}
                sub={
                  trade.entry_slippage_pct != null && Number(trade.entry_slippage_pct) !== 0
                    ? t("journal.detail.slippage", { value: `${Number(trade.entry_slippage_pct) >= 0 ? "+" : ""}${Number(trade.entry_slippage_pct).toFixed(3)}` })
                    : t("journal.detail.marketFill")
                }
              />
            ) : null}
            <Row
              label={t("journal.detail.stopPrice")}
              value={`$${formatNumber(Number(trade.stop))}`}
              sub={`${stopPct.toFixed(2)}% · 1R`}
            />
            <Row
              label={t("journal.detail.targetPrice")}
              value={`$${formatNumber(Number(trade.target))}`}
              sub={`${targetPct >= 0 ? "+" : ""}${targetPct.toFixed(2)}% · ${Number(trade.pre_rr).toFixed(2)}R`}
            />
            {trade.exit_actual != null && trade.closed_at ? (
              <Row
                label={t("journal.detail.actualExit")}
                value={`$${formatNumber(Number(trade.exit_actual))}`}
                sub={trade.exit_reason === "target" ? t("journal.detail.targetHit") : trade.exit_reason === "stop" ? t("journal.detail.stopHit") : trade.exit_reason === "timeout" ? t("journal.detail.timeoutHit") : t("journal.detail.manual")}
              />
            ) : null}
            <div className="border-t border-border pt-3">
              <Row label={t("journal.detail.entryRR")} value={`${Number(trade.pre_rr).toFixed(2)}R`} />
              <Row label={t("journal.detail.score")} value={t("journal.detail.scorePoints", { n: trade.pre_score })} />
              <Row
                label={t("journal.detail.quantity")}
                value={`${formatNumber(Number(trade.position_quantity), { maximumFractionDigits: 4 })} ${trade.symbol.replace("USDT", "")}`}
                sub={t("journal.detail.exposure", { value: formatNumber(notional, { maximumFractionDigits: 0 }) })}
              />
              <Row label={t("journal.detail.account")} value={`$${formatNumber(Number(trade.account_size), { maximumFractionDigits: 0 })}`} />
              <Row label={t("journal.detail.allowedLoss")} value={`${Number(trade.allowed_loss_pct)}%`} />
              {ctx.leverage ? <Row label={t("journal.detail.leverage")} value={`${ctx.leverage}x`} /> : null}
            </div>
            <div className="border-t border-border pt-3">
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t("journal.detail.scoreBreakdown")}</div>
              <ul className="space-y-1">
                {(trade.pre_score_breakdown as Array<{ label: string; points: number }>).map((r, i) => (
                  <li key={i} className="flex justify-between">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className={r.points > 0 ? "text-grade-a" : r.points < 0 ? "text-grade-d" : ""}>
                      {r.points > 0 ? `+${r.points}` : r.points}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <OutcomeForm
          id={trade.id}
          initial={{
            exit_price: trade.exit_price,
            result_r: trade.result_r,
            exit_reason: trade.exit_reason,
            note: trade.note,
          }}
          closed={Boolean(trade.closed_at)}
        />
      </div>

      {/* Monte Carlo 시뮬레이션 (저장 시점 스냅샷) */}
      {trade.simulation_meta && (trade.simulation_meta as { kind?: string }).kind === "monte_carlo_forecast" ? (
        <MonteCarloForecastSection meta={trade.simulation_meta as MonteCarloForecastMeta} t={t} />
      ) : null}

      {/* 진입 시 시장 체크 + 트리거 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {Object.keys(market).length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("journal.detail.marketCheckTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {MARKET_CHECK_KEYS.map((k) => {
                const v = market[k];
                return (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{t(`check.market.${k}`)}</span>
                    <CheckIcon v={v} />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null}

        {hasTrigger ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("journal.detail.triggerCheckTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {TRIGGER_CHECK_KEYS.map((k) => {
                const v = trigger[k];
                return (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{t(`check.trigger.${k}`)}</span>
                    <CheckIcon v={v} />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* 시장 컨텍스트 스냅샷 */}
      {hasMctx ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {hasMctx ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("journal.detail.marketCtxTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row
                  label={t("journal.detail.btcPrice")}
                  value={mctx.btcPrice ? `$${mctx.btcPrice.toLocaleString()}` : "—"}
                  sub={
                    mctx.btc24hChangePct !== null && mctx.btc24hChangePct !== undefined
                      ? `24h ${mctx.btc24hChangePct >= 0 ? "+" : ""}${mctx.btc24hChangePct.toFixed(2)}%`
                      : undefined
                  }
                />
                <Row
                  label={t("journal.detail.fundingRate")}
                  value={
                    mctx.fundingRate !== null && mctx.fundingRate !== undefined
                      ? `${(mctx.fundingRate * 100).toFixed(4)}%`
                      : "—"
                  }
                  sub={
                    mctx.fundingRate !== null && mctx.fundingRate !== undefined
                      ? mctx.fundingRate > 0
                        ? t("journal.detail.fundingLongPays")
                        : t("journal.detail.fundingShortPays")
                      : undefined
                  }
                />
                <Row
                  label={t("journal.detail.nextFunding")}
                  value={
                    mctx.minutesToFunding !== null && mctx.minutesToFunding !== undefined
                      ? t("journal.detail.minutesLater", { n: mctx.minutesToFunding })
                      : "—"
                  }
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      <CoachCard
        tradeId={trade.id}
        comment={trade.ai_coach_comment}
        generatedAt={trade.ai_coach_generated_at}
        closed={Boolean(trade.closed_at)}
      />
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <div className="text-right">
        <div className="font-mono">{value}</div>
        {sub ? <div className="text-[11px] text-muted-foreground/80">{sub}</div> : null}
      </div>
    </div>
  );
}

function CheckIcon({ v }: { v: boolean | undefined }) {
  if (v === undefined) return <span className="text-xs text-muted-foreground">—</span>;
  return v ? (
    <span className="font-mono text-sm font-bold text-grade-a">✓</span>
  ) : (
    <span className="font-mono text-sm font-bold text-grade-d">✕</span>
  );
}

type MonteCarloForecastMeta = {
  kind: "monte_carlo_forecast";
  at?: string;
  runs?: number;
  winRate?: number;
  lossRate?: number;
  timeoutRate?: number;
  expectedR?: number;
  medianBarsToWin?: number | null;
  medianBarsToLoss?: number | null;
  rrRatio?: number;
  barLimit?: number;
  atrPctPerBar?: number;
};

function MonteCarloForecastSection({ meta, t }: { meta: MonteCarloForecastMeta; t: TFunction }) {
  const winPct = (meta.winRate ?? 0) * 100;
  const lossPct = (meta.lossRate ?? 0) * 100;
  const timeoutPct = (meta.timeoutRate ?? 0) * 100;
  const ev = meta.expectedR ?? 0;
  const evTone = ev > 0.3 ? "text-grade-a" : ev < -0.3 ? "text-grade-d" : "text-muted-foreground";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("journal.detail.monteCarloTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-border bg-background/40">
          <div className="bg-grade-a" style={{ width: `${winPct}%` }} />
          <div className="bg-grade-d" style={{ width: `${lossPct}%` }} />
          <div className="bg-muted-foreground/40" style={{ width: `${timeoutPct}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ForecastStat label={t("journal.detail.reachTarget")} value={`${winPct.toFixed(1)}%`} sub={meta.medianBarsToWin != null ? t("journal.detail.avgBars", { n: meta.medianBarsToWin }) : "—"} tone="good" />
          <ForecastStat label={t("journal.detail.hitStop")} value={`${lossPct.toFixed(1)}%`} sub={meta.medianBarsToLoss != null ? t("journal.detail.avgBars", { n: meta.medianBarsToLoss }) : "—"} tone="bad" />
          <ForecastStat label={t("journal.detail.timeout")} value={`${timeoutPct.toFixed(1)}%`} sub={t("journal.detail.barLimit", { n: meta.barLimit ?? 0 })} />
          <ForecastStat label={t("journal.detail.expectedResult")} value={`${ev >= 0 ? "+" : ""}${ev.toFixed(2)}R`} sub={`R:R ${(meta.rrRatio ?? 0).toFixed(2)}`} tone={ev > 0 ? "good" : ev < 0 ? "bad" : undefined} />
        </div>
        <p className={`text-xs ${evTone}`}>
          {t("journal.detail.monteCarloNote", { atr: meta.atrPctPerBar?.toFixed(2) ?? "?", runs: (meta.runs ?? 0).toLocaleString() })}
        </p>
      </CardContent>
    </Card>
  );
}

function ForecastStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-lg font-bold tabular-nums ${tone === "good" ? "text-grade-a" : tone === "bad" ? "text-grade-d" : ""}`}>{value}</div>
      {sub ? <div className="text-[10px] text-muted-foreground/80">{sub}</div> : null}
    </div>
  );
}
