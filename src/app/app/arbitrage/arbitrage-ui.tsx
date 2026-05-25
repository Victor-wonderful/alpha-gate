"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight, Wallet, X, Clock, Repeat, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatNumber } from "@/lib/utils";
import type { KimchiOpportunity } from "@/lib/arbitrage/constants";
import type { KimchiVolatility } from "@/lib/arbitrage/volatility";
import {
  enterArbitrageAction,
  closeArbitrageAction,
  runArbitrageCronAction,
} from "./_actions";

interface WalletInfo {
  usdtBalance: number;
  available: number;
  usedMargin: number;
}

interface OpenPosition {
  id: string;
  kind: "kimchi";
  symbol: string;
  notional_usd: number;
  long_entry_price: number; // = upbit USD 가격 (진입)
  short_entry_price: number; // = binance USD 가격 (진입)
  entry_premium_pct: number | null;
  inventory_coin_upbit: number;
  inventory_coin_binance: number;
  inventory_usdt_upbit: number;
  inventory_usdt_binance: number;
  target_threshold_pct: number;
  cycles_count: number;
  accrued_cycle_pnl: number;
  coin_price_at_entry_usd: number | null;
  expires_at: string;
  created_at: string;
}

interface ClosedPosition {
  id: string;
  kind: "kimchi";
  symbol: string;
  notional_usd: number;
  entry_premium_pct: number | null;
  target_threshold_pct: number | null;
  cycles_count: number | null;
  accrued_cycle_pnl: number | null;
  long_entry_price: number;
  short_entry_price: number;
  long_exit_price: number | null;
  short_exit_price: number | null;
  realized_pnl: number | null;
  close_reason: string | null;
  created_at: string;
  closed_at: string | null;
}

export interface CycleEvent {
  id: string;
  executed_at: string;
  direction: string;
  premium_at_cycle: number;
  coin_moved: number;
  profit_usdt: number;
}

interface Props {
  wallet: WalletInfo | null;
  kimchi: KimchiOpportunity[];
  currentPremiums: Record<string, number>;
  volatility: KimchiVolatility[];
  volatilityThreshold: number;
  openPositions: OpenPosition[];
  closedPositions: ClosedPosition[];
  cyclesByPosition: Record<string, CycleEvent[]>;
}

export function ArbitrageUI({
  wallet,
  kimchi,
  currentPremiums,
  volatility,
  volatilityThreshold,
  openPositions,
  closedPositions,
  cyclesByPosition,
}: Props) {
  const [entryTarget, setEntryTarget] = useState<KimchiOpportunity | null>(null);

  // symbol → 현재 시세 (Upbit USD / Binance USD)
  const priceMap = new Map<string, { upbitUsd: number; binanceUsd: number }>();
  for (const k of kimchi) {
    priceMap.set(k.symbol, {
      upbitUsd: k.upbitKrw / k.usdKrwRate,
      binanceUsd: k.binanceUsd,
    });
  }

  return (
    <div className="space-y-6">
      {/* 헤더 + 잔액 */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold leading-[1.15]">차익거래</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            🇰🇷 김프 리밸런싱 — 양쪽 거래소에 진입 코인 + USDT 보유. 김프가 ±임계값 도달 시 자동 리밸런싱으로 사이클마다 수익 누적.
          </p>
        </div>
        {wallet ? (
          <div className="rounded-md border border-border bg-card/40 px-3 py-2 text-xs">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              사용 가능 잔액
            </div>
            <div className="font-mono text-base font-bold tabular-nums">
              {formatNumber(wallet.available, { maximumFractionDigits: 0 })}{" "}
              <span className="text-[10px] text-muted-foreground">vUSDT</span>
            </div>
          </div>
        ) : null}
      </header>

      {/* 리밸런싱 사이클 랭킹 (현재 김프 + 7일 변동성 + 시뮬레이션) */}
      <VolatilitySection
        rows={volatility}
        threshold={volatilityThreshold}
        kimchi={kimchi}
        onEnter={setEntryTarget}
      />

      {/* 진행 중 포지션 */}
      {openPositions.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">
              진행 중 리밸런싱 포지션 ({openPositions.length})
            </h2>
            <RunCronButton />
          </div>
          <div className="space-y-3">
            {openPositions.map((p) => (
              <ActivePositionCard
                key={p.id}
                pos={p}
                currentPremium={currentPremiums[p.symbol] ?? null}
                currentPrices={priceMap.get(p.symbol) ?? null}
                cycles={cyclesByPosition[p.id] ?? []}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* 종료된 포지션 */}
      {closedPositions.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">
            종료된 차익 포지션 ({closedPositions.length})
          </h2>
          <ClosedPositionsList rows={closedPositions} />
        </section>
      ) : null}

      {/* 진입 모달 */}
      {entryTarget ? (
        <EntryModal
          target={entryTarget}
          wallet={wallet}
          onClose={() => setEntryTarget(null)}
        />
      ) : null}
    </div>
  );
}

function VolatilitySection({
  rows,
  threshold,
  kimchi,
  onEnter,
}: {
  rows: KimchiVolatility[];
  threshold: number;
  kimchi: KimchiOpportunity[];
  onEnter: (k: KimchiOpportunity) => void;
}) {
  const PREVIEW_COUNT = 8;
  const [expanded, setExpanded] = useState(false);
  const volBySymbol = new Map(rows.map((r) => [r.symbol, r]));

  // kimchi 스냅샷 베이스. 사이클 통계가 있으면 어그멘트. 정렬: 백테스트 예상 수익 큰 순 → 사이클 → 현재 김프 절댓값.
  const merged = kimchi
    .map((k) => ({ symbol: k.symbol, opp: k, vol: volBySymbol.get(k.symbol) ?? null }))
    .sort((a, b) => {
      const aProfit = a.vol?.simProfit ?? Number.NEGATIVE_INFINITY;
      const bProfit = b.vol?.simProfit ?? Number.NEGATIVE_INFINITY;
      if (aProfit !== bProfit) return bProfit - aProfit;
      const aCycles = a.vol?.cyclesPerDay ?? -1;
      const bCycles = b.vol?.cyclesPerDay ?? -1;
      if (aCycles !== bCycles) return bCycles - aCycles;
      return Math.abs(b.opp.premiumPct) - Math.abs(a.opp.premiumPct);
    });

  const canCollapse = merged.length > PREVIEW_COUNT;
  const visible = expanded || !canCollapse ? merged : merged.slice(0, PREVIEW_COUNT);
  const minSamples = rows.length > 0 ? Math.min(...rows.map((r) => r.samples)) : 0;
  const lowConfidence = rows.length === 0 || minSamples < 100;
  const maxSpan = rows.length > 0 ? Math.max(...rows.map((r) => r.spanHours)) : 0;

  const THRESHOLDS = [0.2, 0.3, 0.5, 1.0];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">
            기대 수익 랭킹 (백테스트)
            {merged.length > 0 ? <span className="ml-2 text-muted-foreground">({merged.length}개)</span> : null}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            최근 7일 김프 시계열에 실제 cron 로직을 그대로 돌린 결과 — $1000 노출 + 임계값 ±{threshold}% 가정. 인벤토리 고갈/코인 가격 변동까지 반영됨.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground mr-1">임계값</span>
          {THRESHOLDS.map((t) => {
            const active = t === threshold;
            return (
              <a
                key={t}
                href={`?threshold=${t}`}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-mono tabular-nums transition-colors",
                  active
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60",
                )}
              >
                ±{t}%
              </a>
            );
          })}
        </div>
      </div>

      {merged.length === 0 ? (
        <EmptyMessage text="김프 데이터를 불러올 수 없습니다. 잠시 후 다시 시도해주세요." />
      ) : (
        <div className="space-y-2">
          {lowConfidence ? (
            <p className="text-[11px] text-amber-400">
              ⚠️ 사이클 통계 표본 적음
              {rows.length > 0
                ? ` (최소 ${minSamples}개 · 측정 ${maxSpan.toFixed(1)}시간)`
                : " (데이터 누적 중)"}
              . 24시간 이후 의미 있는 추정, 일주일 후 신뢰도 충분.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              측정 구간 {maxSpan.toFixed(1)}시간 · 5분마다 김프 ≥ ±임계값 인 tick 을 사이클로 카운트
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 text-left">순위</th>
                  <th className="px-3 py-3 text-left">코인</th>
                  <th className="px-3 py-3 text-right">현재 김프</th>
                  <th className="px-3 py-3 text-right" title="$1000 노출 가정, 7일 시뮬레이션 누적 PnL (인벤토리 고갈 + 코인가 변동 반영)">
                    예상 수익 ($)
                  </th>
                  <th className="px-3 py-3 text-right">일환산</th>
                  <th className="px-3 py-3 text-right">실효 사이클</th>
                  <th className="px-3 py-3 text-right">단순 사이클</th>
                  <th className="px-3 py-3 text-right">표준편차</th>
                  <th className="px-3 py-3 text-right">평균</th>
                  <th className="px-3 py-3 text-right">표본</th>
                  <th className="px-3 py-3 text-center">액션</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ symbol, opp, vol }, i) => {
                  const positive = opp.premiumPct > 0;
                  const profit = vol?.simProfit;
                  const profitClass =
                    profit == null
                      ? "text-muted-foreground"
                      : profit >= 0
                        ? "text-grade-a"
                        : "text-grade-d";
                  return (
                  <tr
                    key={symbol}
                    className="border-t border-border/60 hover:bg-accent/30 transition-colors"
                  >
                    <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2.5 font-mono font-bold">{symbol}</td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right font-mono tabular-nums font-bold",
                        Math.abs(opp.premiumPct) < 0.1
                          ? "text-sky-400"
                          : positive
                            ? "text-amber-400"
                            : "text-sky-300",
                      )}
                    >
                      {positive ? "+" : ""}
                      {opp.premiumPct.toFixed(3)}%
                    </td>
                    <td className={cn("px-3 py-2.5 text-right font-mono tabular-nums font-bold", profitClass)}>
                      {profit == null ? "—" : `${profit >= 0 ? "+" : ""}$${profit.toFixed(2)}`}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right font-mono tabular-nums text-xs", profitClass)}>
                      {vol == null
                        ? "—"
                        : `${vol.simProfitPerDay >= 0 ? "+" : ""}$${vol.simProfitPerDay.toFixed(2)}`}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-400">
                      {vol ? vol.simEffectiveCycles : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {vol ? vol.cyclesTotal : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-amber-400">
                      {vol ? `${vol.stdev.toFixed(3)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {vol ? `${vol.avg >= 0 ? "+" : ""}${vol.avg.toFixed(3)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {vol ? vol.samples : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Button size="sm" className="h-7 px-3 text-xs" onClick={() => onEnter(opp)}>
                        진입
                      </Button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canCollapse ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex w-full items-center justify-center gap-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  접기
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  전체 보기 ({merged.length - PREVIEW_COUNT}개 더)
                </>
              )}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="p-10 text-center text-sm text-muted-foreground">
        {text}
      </CardContent>
    </Card>
  );
}

function RunCronButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function onRun() {
    startTransition(async () => {
      const r = await runArbitrageCronAction();
      if (!r.ok) {
        toast.error(r.error ?? "실행 실패");
        return;
      }
      toast.success(
        `cron 완료 — 체크 ${r.checked}건, 사이클 ${r.cycles}회, 청산 ${r.closed}건`,
      );
      router.refresh();
    });
  }
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onRun}
      disabled={pending}
      className="text-xs"
      title="resolve-arbitrage cron 즉시 호출 (테스트용)"
    >
      <Repeat className="mr-1 h-3 w-3" />
      {pending ? "실행 중…" : "지금 cron 실행"}
    </Button>
  );
}

function ActivePositionCard({
  pos,
  currentPremium,
  currentPrices,
  cycles,
}: {
  pos: OpenPosition;
  currentPremium: number | null;
  currentPrices: { upbitUsd: number; binanceUsd: number } | null;
  cycles: CycleEvent[];
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const router = useRouter();
  const [closing, startClose] = useTransition();

  const notional = Number(pos.notional_usd);
  const coinUpbit = Number(pos.inventory_coin_upbit);
  const coinBinance = Number(pos.inventory_coin_binance);
  const usdtUpbit = Number(pos.inventory_usdt_upbit);
  const usdtBinance = Number(pos.inventory_usdt_binance);
  const cyclesCount = Number(pos.cycles_count);
  const accrued = Number(pos.accrued_cycle_pnl);
  const threshold = Number(pos.target_threshold_pct);
  const entryPct = pos.entry_premium_pct != null ? Number(pos.entry_premium_pct) : null;
  const entryCoinPrice = pos.coin_price_at_entry_usd != null ? Number(pos.coin_price_at_entry_usd) : null;

  // 현재 자산 가치 계산
  const upbitCoinValueUsd = currentPrices ? coinUpbit * currentPrices.upbitUsd : 0;
  const binanceCoinValueUsd = currentPrices ? coinBinance * currentPrices.binanceUsd : 0;
  const totalAssetUsd = currentPrices
    ? upbitCoinValueUsd + binanceCoinValueUsd + usdtUpbit + usdtBinance
    : null;
  const unrealizedPnl =
    totalAssetUsd != null ? totalAssetUsd - 2 * notional : null;

  const totalCoin = coinUpbit + coinBinance;
  const coinPriceDelta =
    entryCoinPrice && currentPrices
      ? (((currentPrices.upbitUsd + currentPrices.binanceUsd) / 2 - entryCoinPrice) /
          entryCoinPrice) *
        100
      : null;

  const expiry = new Date(pos.expires_at);
  const msToExpiry = expiry.getTime() - Date.now();
  const expiryText =
    msToExpiry > 0
      ? `${Math.floor(msToExpiry / 86400000)}일 ${Math.floor((msToExpiry % 86400000) / 3600000)}h`
      : "만료";

  function onClose() {
    if (!currentPrices) {
      toast.error("현재 가격을 가져올 수 없습니다.");
      return;
    }
    if (!confirm(
      `${pos.symbol} 리밸런싱 포지션 청산하시겠습니까? (현재 자산 $${totalAssetUsd?.toFixed(2) ?? "—"}, 손익 ${unrealizedPnl != null ? (unrealizedPnl >= 0 ? "+" : "") + unrealizedPnl.toFixed(2) : "—"})`,
    ))
      return;
    startClose(async () => {
      const r = await closeArbitrageAction(
        pos.id,
        currentPrices.upbitUsd,
        currentPrices.binanceUsd,
      );
      if (!r.ok) {
        toast.error(r.error ?? "청산 실패");
        return;
      }
      toast.success(`청산 완료 — PnL ${(r.pnl ?? 0).toFixed(2)} vUSDT`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              리밸런싱
            </span>
            <span className="font-mono text-base font-bold">{pos.symbol}</span>
            <span className="text-xs text-muted-foreground">
              노출 ${formatNumber(notional, { maximumFractionDigits: 0 })} × 2 · 임계값 ±
              {threshold.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              만료까지 {expiryText}
            </span>
            <Button size="sm" variant="outline" onClick={onClose} disabled={closing}>
              <X className="mr-1 h-3 w-3" />
              {closing ? "청산 중…" : "청산"}
            </Button>
          </div>
        </div>

        {/* 김프 상태 + 사이클 통계 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <StatBox
            label="진입 김프"
            value={
              entryPct != null
                ? `${entryPct >= 0 ? "+" : ""}${entryPct.toFixed(3)}%`
                : "—"
            }
          />
          <StatBox
            label="현재 김프"
            value={
              currentPremium != null
                ? `${currentPremium >= 0 ? "+" : ""}${currentPremium.toFixed(3)}%`
                : "—"
            }
            highlight={
              currentPremium != null && Math.abs(currentPremium) >= threshold
                ? "primary"
                : undefined
            }
          />
          <StatBox
            label={
              <span className="inline-flex items-center gap-1">
                <Repeat className="h-3 w-3" />
                사이클
              </span>
            }
            value={`${cyclesCount}회`}
          />
          <StatBox
            label="누적 사이클 수익"
            value={`${accrued >= 0 ? "+" : ""}${accrued.toFixed(2)}`}
            valueClass={
              accrued > 0 ? "text-grade-a" : accrued < 0 ? "text-grade-d" : ""
            }
          />
        </div>

        {/* 인벤토리 양쪽 */}
        <div className="grid gap-3 sm:grid-cols-2">
          <InventoryBox
            label="Upbit (KRW 환산)"
            tone="upbit"
            symbol={pos.symbol}
            coin={coinUpbit}
            usdt={usdtUpbit}
            currentCoinUsd={currentPrices?.upbitUsd}
          />
          <InventoryBox
            label="Binance (USDT)"
            tone="binance"
            symbol={pos.symbol}
            coin={coinBinance}
            usdt={usdtBinance}
            currentCoinUsd={currentPrices?.binanceUsd}
          />
        </div>

        {/* 미실현 손익 합계 */}
        <div className="space-y-1 border-t border-border/60 pt-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">현재 자산 합계 (USDT)</span>
            <span className="font-mono tabular-nums font-semibold">
              ${totalAssetUsd != null ? totalAssetUsd.toFixed(2) : "—"} /{" "}
              <span className="text-muted-foreground">시작 ${(2 * notional).toFixed(0)}</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">미실현 손익 (사이클 + {pos.symbol} 가격)</span>
            {unrealizedPnl != null ? (
              <span
                className={cn(
                  "font-mono text-base font-bold tabular-nums",
                  unrealizedPnl >= 0 ? "text-grade-a" : "text-grade-d",
                )}
              >
                {unrealizedPnl >= 0 ? "+" : ""}
                {unrealizedPnl.toFixed(2)} vUSDT
              </span>
            ) : (
              <span className="text-muted-foreground">데이터 없음</span>
            )}
          </div>
          {coinPriceDelta != null ? (
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                진입 후 {pos.symbol} 평균가 변동
              </span>
              <span className="font-mono tabular-nums">
                {coinPriceDelta >= 0 ? "+" : ""}
                {coinPriceDelta.toFixed(2)}% · {totalCoin.toFixed(6)} {pos.symbol} 보유
              </span>
            </div>
          ) : null}
        </div>

        {/* 사이클 이력 펼치기 */}
        <div className="border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={() => setHistoryOpen(!historyOpen)}
            className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              <Repeat className="h-3 w-3" />
              사이클 이력 {cycles.length}건
            </span>
            <span className="text-[10px]">{historyOpen ? "▴ 접기" : "▾ 펼치기"}</span>
          </button>
          {historyOpen ? (
            cycles.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground text-center py-3">
                아직 사이클 이력 없음. 김프가 ±임계값 도달하면 cron 이 자동 실행.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-md border border-border/60">
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">시간</th>
                      <th className="px-3 py-2 text-left">방향</th>
                      <th className="px-3 py-2 text-right">김프</th>
                      <th className="px-3 py-2 text-right">이동 {pos.symbol}</th>
                      <th className="px-3 py-2 text-right">수익 (USDT)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycles.map((c) => {
                      const t = new Date(c.executed_at);
                      const isPositive = c.direction === "positive";
                      return (
                        <tr key={c.id} className="border-t border-border/40">
                          <td className="px-3 py-2 font-mono">
                            {t.toLocaleString("ko-KR", {
                              month: "numeric",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                                isPositive
                                  ? "bg-amber-500/10 text-amber-400"
                                  : "bg-sky-500/10 text-sky-300",
                              )}
                              title={
                                isPositive
                                  ? "Upbit 매도 + Binance 매수"
                                  : "Upbit 매수 + Binance 매도"
                              }
                            >
                              {isPositive ? "↗ +" : "↘ -"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {c.premium_at_cycle >= 0 ? "+" : ""}
                            {c.premium_at_cycle.toFixed(3)}%
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {c.coin_moved.toFixed(6)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right font-mono tabular-nums font-semibold",
                              c.profit_usdt >= 0 ? "text-grade-a" : "text-grade-d",
                            )}
                          >
                            {c.profit_usdt >= 0 ? "+" : ""}
                            {c.profit_usdt.toFixed(3)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function StatBox({
  label,
  value,
  highlight,
  valueClass,
}: {
  label: React.ReactNode;
  value: string;
  highlight?: "primary";
  valueClass?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-2 space-y-0.5",
        highlight === "primary"
          ? "border-primary/40 bg-primary/5"
          : "border-border/60 bg-background/40",
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("font-mono text-sm font-semibold tabular-nums", valueClass)}>
        {value}
      </div>
    </div>
  );
}

function InventoryBox({
  label,
  tone,
  symbol,
  coin,
  usdt,
  currentCoinUsd,
}: {
  label: string;
  tone: "upbit" | "binance";
  symbol: string;
  coin: number;
  usdt: number;
  currentCoinUsd?: number;
}) {
  const coinUsd = currentCoinUsd ? coin * currentCoinUsd : null;
  const total = coinUsd != null ? coinUsd + usdt : null;
  return (
    <div
      className={cn(
        "rounded-md border p-3 space-y-1.5",
        tone === "upbit"
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-sky-500/30 bg-sky-500/5",
      )}
    >
      <div
        className={cn(
          "text-[10px] uppercase tracking-wider font-semibold",
          tone === "upbit" ? "text-amber-400" : "text-sky-300",
        )}
      >
        {label}
      </div>
      <div className="space-y-0.5 font-mono text-xs tabular-nums">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{symbol}</span>
          <span>
            {coin.toFixed(6)}{" "}
            {coinUsd != null ? (
              <span className="text-muted-foreground">≈ ${coinUsd.toFixed(2)}</span>
            ) : null}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">USDT</span>
          <span>${usdt.toFixed(2)}</span>
        </div>
        {total != null ? (
          <div className="flex justify-between border-t border-border/40 pt-1 font-semibold">
            <span className="text-muted-foreground">합계</span>
            <span>${total.toFixed(2)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ClosedPositionsList({ rows }: { rows: ClosedPosition[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left">종료</th>
            <th className="px-4 py-3 text-left">코인</th>
            <th className="px-4 py-3 text-right">노출</th>
            <th className="px-4 py-3 text-right">진입 김프</th>
            <th className="px-4 py-3 text-right">임계값</th>
            <th className="px-4 py-3 text-right">사이클</th>
            <th className="px-4 py-3 text-right">PnL</th>
            <th className="px-4 py-3 text-left">사유</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const closeAt = r.closed_at ? new Date(r.closed_at) : null;
            const entryPct = r.entry_premium_pct != null ? Number(r.entry_premium_pct) : null;
            const threshold = r.target_threshold_pct != null ? Number(r.target_threshold_pct) : null;
            const cycles = r.cycles_count ?? 0;
            return (
              <tr key={r.id} className="border-t border-border/60 hover:bg-accent/30">
                <td className="px-4 py-3 text-xs">
                  {closeAt
                    ? `${closeAt.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} ${closeAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}`
                    : "—"}
                </td>
                <td className="px-4 py-3 font-mono font-semibold">{r.symbol}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  ${formatNumber(r.notional_usd, { maximumFractionDigits: 0 })}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {entryPct != null
                    ? `${entryPct >= 0 ? "+" : ""}${entryPct.toFixed(2)}%`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {threshold != null ? `±${threshold.toFixed(1)}%` : "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">{cycles}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {r.realized_pnl != null ? (
                    <span
                      className={
                        Number(r.realized_pnl) >= 0 ? "text-grade-a" : "text-grade-d"
                      }
                    >
                      {Number(r.realized_pnl) >= 0 ? "+" : ""}
                      {Number(r.realized_pnl).toFixed(2)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {r.close_reason === "manual"
                    ? "수동"
                    : r.close_reason === "expired"
                      ? "만료"
                      : r.close_reason ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EntryModal({
  target,
  wallet,
  onClose,
}: {
  target: KimchiOpportunity;
  wallet: WalletInfo | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [notional, setNotional] = useState(1000);
  const [threshold, setThreshold] = useState(1.0);
  const [pending, startTransition] = useTransition();

  const totalMargin = notional * 2;
  const canAfford = wallet != null && wallet.available >= totalMargin;
  const valid =
    notional >= 100 &&
    notional <= 100_000 &&
    threshold >= 0.2 &&
    threshold <= 10 &&
    canAfford;

  // 1회 사이클 예상 수익 (현실 계산):
  //  - 이동량 = 인벤토리(=notional/2)의 25% = notional/8 (USD)
  //  - Gross = (notional/8) × (threshold/100)
  //  - Fees (수수료 0.04% × 양쪽 거래) = (notional/4) × 0.0004
  //  - 슬리피지 가정 = (notional/4) × 0.0002 (코인 ~0.01% × 양쪽)
  const cycleTradeVolume = notional / 4; // 양쪽 합산 거래액
  const cycleGross = (notional / 8) * (threshold / 100);
  const cycleFees = cycleTradeVolume * 0.0004;
  const cycleSlippage = cycleTradeVolume * 0.0002;
  const estPerCycle = cycleGross - cycleFees - cycleSlippage;

  function submit() {
    if (!valid) {
      toast.error("입력값을 확인하세요.");
      return;
    }
    startTransition(async () => {
      const r = await enterArbitrageAction({
        symbol: target.symbol,
        notionalUsd: notional,
        upbitPriceUsd: target.upbitKrw / target.usdKrwRate,
        binancePriceUsd: target.binanceUsd,
        entryPremiumPct: target.premiumPct,
        thresholdPct: threshold,
      });
      if (!r.ok) {
        toast.error(r.error ?? "진입 실패");
        return;
      }
      toast.success(
        `리밸런싱 포지션 진입 완료. 김프가 ±${threshold.toFixed(1)}% 도달 시 cron 이 자동 리밸런싱.`,
      );
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md border-border">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            <h3 className="text-base font-bold">
              김프 리밸런싱 진입 — {target.symbol}
            </h3>
            <span className="ml-auto rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              ⚡ 자동 사이클
            </span>
          </div>

          <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">진입 시점 김프</span>
              <span
                className={cn(
                  "font-mono",
                  target.premiumPct >= 0 ? "text-amber-400" : "text-sky-300",
                )}
              >
                {target.premiumPct >= 0 ? "+" : ""}
                {target.premiumPct.toFixed(3)}%
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              양쪽 거래소에 {target.symbol} + USDT 절반씩 보유. 김프가 ±임계값 도달 시 자동 리밸런싱(인벤토리의 25%씩) →
              사이클마다 수익 누적. 양방향 모두 수익 가능. 만료 30일.
            </div>
          </div>

          <div>
            <Label htmlFor="notional" className="text-xs">
              한쪽 다리 노출 금액 (USD)
            </Label>
            <Input
              id="notional"
              type="number"
              step="100"
              min="100"
              max="100000"
              value={notional}
              onChange={(e) => setNotional(Number(e.target.value))}
              className="mt-1 font-mono"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              필요 마진 = ${formatNumber(totalMargin, { maximumFractionDigits: 0 })} (양쪽
              합산){" "}
              {wallet ? (
                <span className={canAfford ? "text-muted-foreground" : "text-grade-d"}>
                  · 사용 가능 ${formatNumber(wallet.available, { maximumFractionDigits: 0 })}
                </span>
              ) : null}
            </p>
          </div>

          <div>
            <Label htmlFor="threshold" className="text-xs">
              리밸런싱 임계값 |김프| (%)
            </Label>
            <Input
              id="threshold"
              type="number"
              step="0.1"
              min="0.2"
              max="10"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="mt-1 font-mono"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              현재 김프{" "}
              <span
                className={cn(
                  "font-mono",
                  target.premiumPct >= 0 ? "text-amber-400" : "text-sky-300",
                )}
              >
                {target.premiumPct >= 0 ? "+" : ""}
                {target.premiumPct.toFixed(3)}%
              </span>{" "}
              · 사이클 발동 ±{threshold.toFixed(1)}%
              <br />
              <span className="text-[10px]">
                1회 사이클 (인벤토리 25% 이동) 순수익 ≈{" "}
                <span
                  className={cn(
                    "font-mono font-semibold",
                    estPerCycle >= 0 ? "text-grade-a" : "text-grade-d",
                  )}
                >
                  {estPerCycle >= 0 ? "+" : ""}
                  {estPerCycle.toFixed(2)} USDT
                </span>{" "}
                (gross ${cycleGross.toFixed(2)} − 수수료 ${cycleFees.toFixed(2)} − 슬리피지 ${cycleSlippage.toFixed(2)})
              </span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
              <div className="text-[10px] font-semibold uppercase text-amber-400">
                Upbit 셋업
              </div>
              <div className="font-mono text-[11px]">
                {target.symbol} {(notional / 2 / (target.upbitKrw / target.usdKrwRate)).toFixed(6)}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                USDT ${(notional / 2).toFixed(2)}
              </div>
            </div>
            <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-2">
              <div className="text-[10px] font-semibold uppercase text-sky-300">
                Binance 셋업
              </div>
              <div className="font-mono text-[11px]">
                {target.symbol} {(notional / 2 / target.binanceUsd).toFixed(6)}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                USDT ${(notional / 2).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={pending}>
              취소
            </Button>
            <Button className="flex-1" onClick={submit} disabled={pending || !valid}>
              <Wallet className="mr-2 h-4 w-4" />
              {pending ? "진입 중…" : "리밸런싱 진입"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
