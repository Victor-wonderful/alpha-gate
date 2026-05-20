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
  MARKET_CHECK_LABELS,
  TRIGGER_CHECK_KEYS,
  TRIGGER_CHECK_LABELS,
  type Grade,
} from "@/types/trade";
import { formatNumber } from "@/lib/utils";

export default async function JournalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const autoResolved = Boolean(trade.closed_at) && typeof trade.note === "string" && trade.note.startsWith("자동 정산");
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
                <span className="font-semibold text-primary">자동 정산 대기 중</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">
                  5분마다 자동 확인 / 즉시 확인하려면 우측 버튼. (만료까지 약 {remainingHours.toFixed(0)}시간)
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
        <div className={`rounded-lg border px-4 py-2.5 text-sm ${trade.exit_reason === "target" ? "border-grade-a/40 bg-grade-a/10" : "border-grade-d/40 bg-grade-d/10"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={trade.exit_reason === "target" ? "text-grade-a" : "text-grade-d"}>
              {trade.exit_reason === "target" ? "🎯" : "✕"}
            </span>
            <span className={`font-semibold ${trade.exit_reason === "target" ? "text-grade-a" : "text-grade-d"}`}>
              자동 정산됨 — {trade.exit_reason === "target" ? "목표 도달" : "손절 적중"}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              결과 {Number(trade.result_r) >= 0 ? "+" : ""}{Number(trade.result_r).toFixed(2)}R · {new Date(trade.closed_at as string).toLocaleString("ko-KR")}
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {trade.symbol} · {trade.direction === "long" ? "롱" : "숏"} · {trade.timeframe}
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
            <CardTitle>진입 시 평가</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row
              label="의도 진입가"
              value={`$${formatNumber(Number(trade.entry))}`}
              sub="사용자 입력"
            />
            {trade.entry_actual != null ? (
              <Row
                label="실제 체결가"
                value={`$${formatNumber(Number(trade.entry_actual))}`}
                sub={
                  trade.entry_slippage_pct != null
                    ? `슬리피지 ${Number(trade.entry_slippage_pct) >= 0 ? "+" : ""}${Number(trade.entry_slippage_pct).toFixed(3)}%`
                    : "시장가 체결"
                }
              />
            ) : null}
            <Row
              label="손절가"
              value={`$${formatNumber(Number(trade.stop))}`}
              sub={`${stopPct.toFixed(2)}% · 1R`}
            />
            <Row
              label="목표가"
              value={`$${formatNumber(Number(trade.target))}`}
              sub={`${targetPct >= 0 ? "+" : ""}${targetPct.toFixed(2)}% · ${Number(trade.pre_rr).toFixed(2)}R`}
            />
            {trade.exit_actual != null && trade.closed_at ? (
              <Row
                label="실제 청산가"
                value={`$${formatNumber(Number(trade.exit_actual))}`}
                sub={trade.exit_reason === "target" ? "목표 적중" : trade.exit_reason === "stop" ? "손절 적중" : "수동"}
              />
            ) : null}
            <div className="border-t border-border pt-3">
              <Row label="진입 R:R" value={`${Number(trade.pre_rr).toFixed(2)}R`} />
              <Row label="점수" value={`${trade.pre_score}점`} />
              <Row
                label="수량"
                value={`${formatNumber(Number(trade.position_quantity), { maximumFractionDigits: 4 })} ${trade.symbol.replace("USDT", "")}`}
                sub={`노출 $${formatNumber(notional, { maximumFractionDigits: 0 })}`}
              />
              <Row label="계좌" value={`$${formatNumber(Number(trade.account_size), { maximumFractionDigits: 0 })}`} />
              <Row label="허용 손실률" value={`${Number(trade.allowed_loss_pct)}%`} />
              {ctx.leverage ? <Row label="레버리지" value={`${ctx.leverage}x`} /> : null}
            </div>
            <div className="border-t border-border pt-3">
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">점수 내역</div>
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
        <MonteCarloForecastSection meta={trade.simulation_meta as MonteCarloForecastMeta} />
      ) : null}

      {/* 진입 시 시장 체크 + 트리거 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {Object.keys(market).length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>진입 시 시장 구조 체크</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {MARKET_CHECK_KEYS.map((k) => {
                const v = market[k];
                return (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{MARKET_CHECK_LABELS[k]}</span>
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
              <CardTitle>진입 시 트리거 검증</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {TRIGGER_CHECK_KEYS.map((k) => {
                const v = trigger[k];
                return (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{TRIGGER_CHECK_LABELS[k]}</span>
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
                <CardTitle>진입 시 시장 컨텍스트</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row
                  label="BTC 가격"
                  value={mctx.btcPrice ? `$${mctx.btcPrice.toLocaleString()}` : "—"}
                  sub={
                    mctx.btc24hChangePct !== null && mctx.btc24hChangePct !== undefined
                      ? `24h ${mctx.btc24hChangePct >= 0 ? "+" : ""}${mctx.btc24hChangePct.toFixed(2)}%`
                      : undefined
                  }
                />
                <Row
                  label="펀딩비"
                  value={
                    mctx.fundingRate !== null && mctx.fundingRate !== undefined
                      ? `${(mctx.fundingRate * 100).toFixed(4)}%`
                      : "—"
                  }
                  sub={
                    mctx.fundingRate !== null && mctx.fundingRate !== undefined
                      ? mctx.fundingRate > 0
                        ? "롱이 숏에 지급"
                        : "숏이 롱에 지급"
                      : undefined
                  }
                />
                <Row
                  label="다음 펀딩 정산"
                  value={
                    mctx.minutesToFunding !== null && mctx.minutesToFunding !== undefined
                      ? `${mctx.minutesToFunding}분 후`
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

function MonteCarloForecastSection({ meta }: { meta: MonteCarloForecastMeta }) {
  const winPct = (meta.winRate ?? 0) * 100;
  const lossPct = (meta.lossRate ?? 0) * 100;
  const timeoutPct = (meta.timeoutRate ?? 0) * 100;
  const ev = meta.expectedR ?? 0;
  const evTone = ev > 0.3 ? "text-grade-a" : ev < -0.3 ? "text-grade-d" : "text-muted-foreground";
  return (
    <Card>
      <CardHeader>
        <CardTitle>저장 시점 결과 시뮬레이션 (Monte Carlo)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-border bg-background/40">
          <div className="bg-grade-a" style={{ width: `${winPct}%` }} />
          <div className="bg-grade-d" style={{ width: `${lossPct}%` }} />
          <div className="bg-muted-foreground/40" style={{ width: `${timeoutPct}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ForecastStat label="목표 도달" value={`${winPct.toFixed(1)}%`} sub={meta.medianBarsToWin != null ? `평균 ${meta.medianBarsToWin}봉` : "—"} tone="good" />
          <ForecastStat label="손절 적중" value={`${lossPct.toFixed(1)}%`} sub={meta.medianBarsToLoss != null ? `평균 ${meta.medianBarsToLoss}봉` : "—"} tone="bad" />
          <ForecastStat label="시간 만료" value={`${timeoutPct.toFixed(1)}%`} sub={`${meta.barLimit ?? 0}봉 한도`} />
          <ForecastStat label="기대 결과" value={`${ev >= 0 ? "+" : ""}${ev.toFixed(2)}R`} sub={`R:R ${(meta.rrRatio ?? 0).toFixed(2)}`} tone={ev > 0 ? "good" : ev < 0 ? "bad" : undefined} />
        </div>
        <p className={`text-xs ${evTone}`}>
          저장 시점 변동성 {meta.atrPctPerBar?.toFixed(2) ?? "?"}% / 봉 기준 {(meta.runs ?? 0).toLocaleString()}회 무작위 경로 시뮬. 실제 시장은 본 시뮬과 다를 수 있습니다.
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
