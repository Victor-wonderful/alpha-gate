import { notFound } from "next/navigation";
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

  return (
    <div className="space-y-6">
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
