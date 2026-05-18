import { notFound } from "next/navigation";
import { Clock, Target, TrendingDown, TrendingUp, Timer, CheckCircle2, XCircle } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GradeBadge } from "@/components/trade/grade-badge";
import { OutcomeForm } from "./outcome-form";
import { CoachCard } from "./coach-card";
import { DeleteTradeButton } from "./delete-button";
import {
  MARKET_CHECK_KEYS,
  MARKET_CHECK_LABELS,
  TRIGGER_CHECK_KEYS,
  TRIGGER_CHECK_LABELS,
  type Grade,
} from "@/types/trade";
import { cn, formatNumber } from "@/lib/utils";

interface SimulationMeta {
  entryCandleTime: string | null;
  exitCandleTime: string | null;
  barsHeld: number;
  mfePct: number;
  maePct: number;
  interval: string;
  candleCount: number;
  barsToEntry: number;
  exitReason?: "target" | "stop" | "time" | "no_entry";
}

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {trade.symbol} · {trade.direction === "long" ? "롱" : "숏"} · {trade.timeframe}
            </h1>
            {trade.mode === "backtest" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                <Clock className="h-3 w-3" />
                백테스트
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {trade.mode === "backtest" && trade.simulated_at ? (
              <>
                분석 시점: {new Date(trade.simulated_at).toLocaleString("ko-KR")}
                {ctx.leverage ? ` · ${ctx.leverage}x` : ""}
              </>
            ) : (
              <>
                {new Date(trade.created_at).toLocaleString("ko-KR")}
                {ctx.leverage ? ` · ${ctx.leverage}x` : ""}
              </>
            )}
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
            <Row label="진입가" value={`$${formatNumber(Number(trade.entry))}`} />
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

        {trade.mode === "backtest" ? (
          <BacktestResultCard
            entry={Number(trade.entry)}
            stop={Number(trade.stop)}
            target={Number(trade.target)}
            direction={trade.direction}
            exitPrice={trade.exit_price != null ? Number(trade.exit_price) : null}
            resultR={trade.result_r != null ? Number(trade.result_r) : null}
            exitReason={trade.exit_reason}
            closedAt={trade.closed_at}
            simulatedAt={trade.simulated_at}
            meta={trade.simulation_meta as SimulationMeta | null}
          />
        ) : (
          <OutcomeForm
            id={trade.id}
            initial={{
              exit_price: trade.exit_price,
              result_r: trade.result_r,
              exit_reason: trade.exit_reason,
              mistake_tags: trade.mistake_tags,
              note: trade.note,
            }}
            closed={Boolean(trade.closed_at)}
          />
        )}
      </div>

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

function BacktestResultCard({
  entry,
  stop,
  target,
  direction,
  exitPrice,
  resultR,
  exitReason,
  closedAt,
  simulatedAt,
  meta,
}: {
  entry: number;
  stop: number;
  target: number;
  direction: "long" | "short";
  exitPrice: number | null;
  resultR: number | null;
  exitReason: "target" | "stop" | "manual" | null;
  closedAt: string | null;
  simulatedAt: string | null;
  meta: SimulationMeta | null;
}) {
  const isFilled = resultR != null && exitPrice != null;
  // 청산 사유는 simulation_meta.exitReason이 더 정확 (no_entry/time 구분)
  const detailReason = meta?.exitReason ?? exitReason ?? "manual";

  const isWin = (resultR ?? 0) > 0;
  const isLoss = (resultR ?? 0) < 0;
  const isNeutral = (resultR ?? 0) === 0;

  // 보유 시간 환산
  const holdHours = computeHoldHours(meta);

  // 청산 사유 라벨
  const reasonLabel: Record<string, { text: string; tone: "good" | "bad" | "warn" }> = {
    target: { text: "목표 도달", tone: "good" },
    stop: { text: "손절 체결", tone: "bad" },
    time: { text: "시간 만료 — 종가 청산", tone: "warn" },
    no_entry: { text: "진입 미체결", tone: "warn" },
    manual: { text: "수동 청산", tone: "warn" },
  };
  const reasonInfo = reasonLabel[detailReason] ?? reasonLabel.manual;

  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
      />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          백테스트 시뮬 결과
        </CardTitle>
      </CardHeader>
      <CardContent className="relative space-y-4">
        {/* 큰 결과 */}
        <div className="rounded-lg border border-border bg-background/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                실현 R
              </div>
              <div
                className={cn(
                  "mt-1 font-mono text-3xl font-bold leading-none",
                  isWin && "text-grade-a",
                  isLoss && "text-grade-d",
                  isNeutral && "text-muted-foreground",
                )}
              >
                {isFilled
                  ? `${(resultR ?? 0) >= 0 ? "+" : ""}${(resultR ?? 0).toFixed(2)}R`
                  : "—"}
              </div>
            </div>
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold",
                reasonInfo.tone === "good" && "border-grade-a/40 bg-grade-a/10 text-grade-a",
                reasonInfo.tone === "bad" && "border-grade-d/40 bg-grade-d/10 text-grade-d",
                reasonInfo.tone === "warn" && "border-grade-b/40 bg-grade-b/10 text-grade-b",
              )}
            >
              {detailReason === "target" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : detailReason === "stop" ? (
                <XCircle className="h-3.5 w-3.5" />
              ) : (
                <Timer className="h-3.5 w-3.5" />
              )}
              {reasonInfo.text}
            </div>
          </div>
        </div>

        {/* 진입/청산 */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-border bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">진입가</div>
            <div className="mt-1 font-mono text-base">${formatNumber(entry)}</div>
            {meta?.entryCandleTime && (
              <div className="mt-1 text-[10px] text-muted-foreground">
                체결: {formatKst(meta.entryCandleTime)}
              </div>
            )}
            {!meta?.entryCandleTime && meta?.barsToEntry === -1 && (
              <div className="mt-1 text-[10px] text-grade-b">미체결</div>
            )}
          </div>
          <div className="rounded-md border border-border bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">청산가</div>
            <div className="mt-1 font-mono text-base">
              {exitPrice != null ? `$${formatNumber(exitPrice)}` : "—"}
            </div>
            {(meta?.exitCandleTime ?? closedAt) && (
              <div className="mt-1 text-[10px] text-muted-foreground">
                청산: {formatKst(meta?.exitCandleTime ?? closedAt!)}
              </div>
            )}
          </div>
        </div>

        {/* 시뮬 메타 */}
        {meta && (
          <div className="space-y-2 rounded-md border border-border bg-background/30 p-3 text-xs">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              시뮬레이션 상세
            </div>
            <MetaRow
              icon={<Timer className="h-3 w-3" />}
              label="보유 시간"
              value={
                holdHours != null
                  ? holdHours < 24
                    ? `${holdHours.toFixed(1)}h (${meta.barsHeld}봉 · ${meta.interval})`
                    : `${(holdHours / 24).toFixed(1)}일 (${meta.barsHeld}봉 · ${meta.interval})`
                  : `${meta.barsHeld}봉 · ${meta.interval}`
              }
            />
            <MetaRow
              icon={<TrendingUp className="h-3 w-3 text-grade-a" />}
              label="최대 유리 변동 (MFE)"
              value={`${meta.mfePct >= 0 ? "+" : ""}${meta.mfePct.toFixed(2)}%`}
              hint="진입 후 가격이 내 방향으로 얼마나 갔는지"
            />
            <MetaRow
              icon={<TrendingDown className="h-3 w-3 text-grade-d" />}
              label="최대 불리 변동 (MAE)"
              value={`-${meta.maePct.toFixed(2)}%`}
              hint="진입 후 가격이 반대 방향으로 얼마나 갔는지"
            />
            <MetaRow
              icon={<Target className="h-3 w-3" />}
              label="진입까지 대기"
              value={
                meta.barsToEntry === -1
                  ? "미체결"
                  : meta.barsToEntry === 0
                    ? "즉시 (분석 시점 봉)"
                    : `${meta.barsToEntry}봉 후`
              }
            />
          </div>
        )}

        {/* 안내 */}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          시뮬은 캔들 봉 단위 walk-forward로 계산됩니다 — 같은 봉에서 손절·목표가 모두 도달하면 <strong className="text-foreground">보수적으로 손절 가정</strong>합니다. 실제 거래 시 호가창·체결흐름 차이로 결과가 달라질 수 있습니다.
        </p>

        {direction && entry && stop && target && (
          <div className="rounded-md border border-border bg-background/30 p-3 text-[11px] text-muted-foreground">
            <span className="text-foreground">계획</span> · {direction === "long" ? "롱" : "숏"} ·
            진입 ${formatNumber(entry)} / 손절 ${formatNumber(stop)} / 목표 ${formatNumber(target)}
            {simulatedAt && <> · 분석 {formatKst(simulatedAt)}</>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetaRow({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-1.5">
        <span className="mt-0.5 flex-none text-muted-foreground">{icon}</span>
        <div className="min-w-0">
          <div className="text-foreground/80">{label}</div>
          {hint && <div className="text-[10px] text-muted-foreground/80">{hint}</div>}
        </div>
      </div>
      <span className="flex-none font-mono text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

function formatKst(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function computeHoldHours(meta: SimulationMeta | null): number | null {
  if (!meta?.entryCandleTime || !meta?.exitCandleTime) return null;
  const e = new Date(meta.entryCandleTime).getTime();
  const x = new Date(meta.exitCandleTime).getTime();
  return (x - e) / (1000 * 60 * 60);
}
