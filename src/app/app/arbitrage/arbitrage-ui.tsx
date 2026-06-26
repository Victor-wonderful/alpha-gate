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
import { useT } from "@/lib/i18n/context";
import type { KimchiOpportunity } from "@/lib/arbitrage/constants";
import type { KimchiVolatility } from "@/lib/arbitrage/volatility";
import { slippageRateFor } from "@/lib/arbitrage/slippage";
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
  inventory_short_binance: number;
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
  const t = useT();
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
          <h1 className="text-3xl font-bold leading-[1.15]">{t("arb.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("arb.subtitle")}
          </p>
        </div>
        {wallet ? (
          <div className="rounded-md border border-border bg-card/40 px-3 py-2 text-xs">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("arb.availableBalance")}
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
              {t("arb.openPositionsHeading", { n: openPositions.length })}
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
            {t("arb.closedPositionsHeading", { n: closedPositions.length })}
          </h2>
          <ClosedPositionsList rows={closedPositions} />
        </section>
      ) : null}

      {/* 진입 모달 */}
      {entryTarget ? (
        <EntryModal
          target={entryTarget}
          wallet={wallet}
          volatility={volatility.find((v) => v.symbol === entryTarget.symbol) ?? null}
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
  const t = useT();
  const PREVIEW_COUNT = 8;
  const [expanded, setExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
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
            {t("arb.rankingHeading")}
            {merged.length > 0 ? <span className="ml-2 text-muted-foreground">{t("arb.countSuffix", { n: merged.length })}</span> : null}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("arb.rankingDesc", { threshold })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ThresholdControl current={threshold} presets={THRESHOLDS} />
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className={cn(
              "rounded-md border px-2 py-1 text-xs transition-colors",
              showDetails
                ? "border-primary bg-primary/20 text-primary"
                : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60",
            )}
          >
            {showDetails ? t("arb.basicView") : t("arb.detailView")}
          </button>
        </div>
      </div>

      {merged.length === 0 ? (
        <EmptyMessage text={t("arb.noKimchiData")} />
      ) : (
        <div className="space-y-2">
          {lowConfidence ? (
            <p className="text-[11px] text-amber-400">
              {t("arb.lowConfidencePrefix")}
              {rows.length > 0
                ? t("arb.lowConfidenceSamples", { n: minSamples, h: maxSpan.toFixed(1) })
                : t("arb.lowConfidenceAccruing")}
              {t("arb.lowConfidenceSuffix")}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {t("arb.measureSpan", { h: maxSpan.toFixed(1) })}
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className={cn("w-full text-sm", showDetails ? "min-w-[1240px]" : "min-w-[760px]")}>
              <thead className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 text-left">{t("arb.colRank")}</th>
                  <th className="px-3 py-3 text-left">{t("arb.colCoin")}</th>
                  <th className="px-3 py-3 text-right">{t("arb.colCurrentPremium")}</th>
                  <th className="px-3 py-3 text-right" title={t("arb.colExpProfitTip")}>
                    {t("arb.colExpProfit")}
                  </th>
                  <th className="px-3 py-3 text-right" title={t("arb.colEffCyclesTip")}>
                    {t("arb.colEffCycles")}
                  </th>
                  <th className="px-3 py-3 text-center" title={t("arb.colDirectionTip")}>
                    {t("arb.colDirection")}
                  </th>
                  {showDetails ? (
                    <>
                      <th className="px-3 py-3 text-right">{t("arb.colPerDay")}</th>
                      <th className="px-3 py-3 text-center" title={t("arb.colFinalCoinTip")}>
                        {t("arb.colFinalCoin")}
                      </th>
                      <th className="px-3 py-3 text-center" title={t("arb.colFinalUsdtTip")}>
                        {t("arb.colFinalUsdt")}
                      </th>
                      <th className="px-3 py-3 text-right">{t("arb.colStdev")}</th>
                      <th className="px-3 py-3 text-right">{t("arb.colAvg")}</th>
                      <th className="px-3 py-3 text-right">{t("arb.colSamples")}</th>
                    </>
                  ) : null}
                  <th className="px-3 py-3 text-center">{t("arb.colAction")}</th>
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
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-400">
                      {vol ? vol.simEffectiveCycles : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {vol ? (
                        <DirectionBar
                          positive={vol.simPositiveCycles}
                          negative={vol.simNegativeCycles}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    {showDetails ? (
                      <>
                        <td className={cn("px-3 py-2.5 text-right font-mono tabular-nums text-xs", profitClass)}>
                          {vol == null
                            ? "—"
                            : `${vol.simProfitPerDay >= 0 ? "+" : ""}$${vol.simProfitPerDay.toFixed(2)}`}
                        </td>
                        <td className="px-3 py-2.5">
                          {vol ? (
                            <SplitBar leftPct={vol.simFinalCoinUpbitPct} />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {vol ? (
                            <SplitBar leftPct={vol.simFinalUsdtUpbitPct} />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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
                      </>
                    ) : null}
                    <td className="px-3 py-2.5 text-center">
                      <Button size="sm" className="h-7 px-3 text-xs" onClick={() => onEnter(opp)}>
                        {t("arb.enter")}
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
                  {t("arb.collapse")}
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  {t("arb.expandAll", { n: merged.length - PREVIEW_COUNT })}
                </>
              )}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function BacktestSummary({
  symbol,
  volatility,
  threshold,
}: {
  symbol: string;
  volatility: KimchiVolatility;
  threshold: number;
}) {
  const t = useT();
  const v = volatility;
  const profitClass = v.simProfit >= 0 ? "text-grade-a" : "text-grade-d";
  const totalCycles = v.simPositiveCycles + v.simNegativeCycles;
  const posPct = totalCycles > 0 ? (v.simPositiveCycles / totalCycles) * 100 : 50;
  const finalCoinDeviation = Math.abs(v.simFinalCoinUpbitPct - 50);
  const exhaustedFlag =
    finalCoinDeviation > 40 || (totalCycles > 5 && (posPct < 10 || posPct > 90));

  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-3 text-[11px] space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{t("arb.backtestSummaryTitle", { sym: symbol, threshold })}</span>
        <span className="text-muted-foreground">
          {t("arb.measureSamples", { h: v.spanHours.toFixed(1), n: v.samples })}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded border border-border/40 bg-muted/20 p-2 space-y-0.5">
          <div className="text-[10px] uppercase text-muted-foreground">{t("arb.expProfit1000")}</div>
          <div className={cn("font-mono tabular-nums text-sm font-bold", profitClass)}>
            {v.simProfit >= 0 ? "+" : ""}${v.simProfit.toFixed(2)}
          </div>
          <div className="text-[10px] font-mono tabular-nums text-muted-foreground">
            {t("arb.perDayLabel")} {v.simProfitPerDay >= 0 ? "+" : ""}${v.simProfitPerDay.toFixed(2)}
          </div>
        </div>
        <div className="rounded border border-border/40 bg-muted/20 p-2 space-y-0.5">
          <div className="text-[10px] uppercase text-muted-foreground">{t("arb.colEffCycles")}</div>
          <div className="font-mono tabular-nums text-sm font-bold text-emerald-400">
            {t("arb.cyclesCount", { n: v.simEffectiveCycles })}
          </div>
          <div className="text-[10px] font-mono tabular-nums text-muted-foreground">
            <span className="text-amber-400">+{v.simPositiveCycles}</span>
            {" / "}
            <span className="text-sky-300">-{v.simNegativeCycles}</span>
          </div>
        </div>
        <div className="rounded border border-border/40 bg-muted/20 p-2 space-y-0.5">
          <div className="text-[10px] uppercase text-muted-foreground">{t("arb.finalInventory")}</div>
          <div className="text-xs">
            {symbol}:{" "}
            <span
              className={cn(
                "font-mono",
                finalCoinDeviation > 40 ? "text-red-400 font-semibold" : "text-foreground",
              )}
            >
              U{v.simFinalCoinUpbitPct.toFixed(0)}/B{(100 - v.simFinalCoinUpbitPct).toFixed(0)}
            </span>
          </div>
          <div className="text-xs">
            USDT:{" "}
            <span className="font-mono text-muted-foreground">
              U{v.simFinalUsdtUpbitPct.toFixed(0)}/B{(100 - v.simFinalUsdtUpbitPct).toFixed(0)}
            </span>
          </div>
        </div>
      </div>
      {exhaustedFlag ? (
        <div className="text-[10px] text-amber-400">
          {t("arb.exhaustWarning")}
        </div>
      ) : null}
    </div>
  );
}

function ThresholdControl({
  current,
  presets,
}: {
  current: number;
  presets: number[];
}) {
  const t = useT();
  const router = useRouter();
  const [custom, setCustom] = useState<string>(
    presets.includes(current) ? "" : current.toString(),
  );

  function apply(value: number) {
    if (!Number.isFinite(value) || value < 0.2 || value > 10) return;
    router.push(`?threshold=${value}`);
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-muted-foreground mr-1">{t("arb.threshold")}</span>
      {presets.map((t) => {
        const active = t === current;
        return (
          <button
            key={t}
            type="button"
            onClick={() => {
              setCustom("");
              apply(t);
            }}
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-mono tabular-nums transition-colors",
              active
                ? "border-primary bg-primary/20 text-primary"
                : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60",
            )}
          >
            ±{t}%
          </button>
        );
      })}
      <div className="flex items-center gap-1 ml-1">
        <input
          type="number"
          step="0.1"
          min="0.2"
          max="10"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply(Number(custom));
          }}
          placeholder={t("arb.custom")}
          className="h-7 w-16 rounded-md border border-border bg-muted/30 px-2 text-xs font-mono tabular-nums focus:border-primary focus:outline-none"
        />
        {custom !== "" && Number(custom) !== current ? (
          <button
            type="button"
            onClick={() => apply(Number(custom))}
            className="rounded-md border border-primary bg-primary/20 px-2 py-1 text-xs text-primary"
          >
            {t("arb.apply")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PriceExposureWarning({
  symbol,
  volatility,
}: {
  symbol: string;
  volatility: KimchiVolatility | null;
}) {
  const t = useT();
  // 델타 중립 모델 — 코인 가격 노출이 헤지되어 있음을 안내.
  const { priceMaxDrawdownPct, priceMaxRunupPct } = volatility ?? {
    priceMaxDrawdownPct: 0,
    priceMaxRunupPct: 0,
  };
  return (
    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-[11px] space-y-2">
      <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
        {t("arb.deltaNeutralHeading", { sym: symbol })}
      </div>
      <p className="text-muted-foreground">
        {t("arb.deltaNeutralBody", { sym: symbol })}
      </p>
      {volatility && (priceMaxDrawdownPct > 0 || priceMaxRunupPct > 0) ? (
        <div className="border-t border-border/40 pt-2 text-muted-foreground">
          {t("arb.priceMovePrefix", { sym: symbol })}{" "}
          <span className="font-mono text-red-400">-{priceMaxDrawdownPct.toFixed(1)}%</span>
          {" / "}
          <span className="font-mono text-emerald-400">+{priceMaxRunupPct.toFixed(1)}%</span>
          {" "}{t("arb.priceMoveSuffix")}
        </div>
      ) : null}
      <div className="border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
        {t("arb.residualRisk")}
      </div>
    </div>
  );
}

function DirectionBar({ positive, negative }: { positive: number; negative: number }) {
  const total = positive + negative;
  if (total === 0) return <span className="block text-center text-xs text-muted-foreground">—</span>;
  const posPct = (positive / total) * 100;
  return (
    <div className="min-w-[80px] space-y-0.5">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted/40">
        <div className="bg-amber-400" style={{ width: `${posPct}%` }} />
        <div className="bg-sky-400" style={{ width: `${100 - posPct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] font-mono tabular-nums text-muted-foreground">
        <span className="text-amber-400">+{positive}</span>
        <span className="text-sky-300">-{negative}</span>
      </div>
    </div>
  );
}

function SplitBar({ leftPct }: { leftPct: number }) {
  // 50%에서 멀어질수록 한쪽 고갈 → 색깔 강도 변화
  const distance = Math.abs(leftPct - 50);
  const exhausted = distance > 40;
  return (
    <div className="min-w-[80px] space-y-0.5">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted/40">
        <div
          className={cn(exhausted ? "bg-red-400" : "bg-amber-400")}
          style={{ width: `${leftPct}%` }}
        />
        <div
          className={cn(exhausted ? "bg-red-400/30" : "bg-sky-400")}
          style={{ width: `${100 - leftPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] font-mono tabular-nums">
        <span className={cn(exhausted ? "text-red-400" : "text-amber-400")}>
          U {leftPct.toFixed(0)}%
        </span>
        <span className={cn(exhausted ? "text-red-400" : "text-sky-300")}>
          B {(100 - leftPct).toFixed(0)}%
        </span>
      </div>
    </div>
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
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function onRun() {
    startTransition(async () => {
      const r = await runArbitrageCronAction();
      if (!r.ok) {
        toast.error(r.error ?? t("arb.runFailed"));
        return;
      }
      toast.success(
        t("arb.cronDone", { checked: r.checked ?? 0, cycles: r.cycles ?? 0, closed: r.closed ?? 0 }),
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
      title={t("arb.runCronTitle")}
    >
      <Repeat className="mr-1 h-3 w-3" />
      {pending ? t("arb.running") : t("arb.runCronNow")}
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
  const t = useT();
  const [historyOpen, setHistoryOpen] = useState(false);
  const router = useRouter();
  const [closing, startClose] = useTransition();

  const notional = Number(pos.notional_usd);
  const coinUpbit = Number(pos.inventory_coin_upbit); // Upbit 현물 롱
  const shortBinance = Number(pos.inventory_short_binance); // Binance 선물 숏
  const usdtUpbit = Number(pos.inventory_usdt_upbit);
  const usdtBinance = Number(pos.inventory_usdt_binance);
  const cyclesCount = Number(pos.cycles_count);
  const accrued = Number(pos.accrued_cycle_pnl);
  const threshold = Number(pos.target_threshold_pct);
  const entryPct = pos.entry_premium_pct != null ? Number(pos.entry_premium_pct) : null;
  const entryCoinPrice = pos.coin_price_at_entry_usd != null ? Number(pos.coin_price_at_entry_usd) : null;

  // 현재 자산 가치 — Upbit 현물 + 현금, Binance 현금 − 숏 부채
  const upbitValueUsd = currentPrices
    ? coinUpbit * currentPrices.upbitUsd + usdtUpbit
    : 0;
  const binanceValueUsd = currentPrices
    ? usdtBinance - shortBinance * currentPrices.binanceUsd
    : 0;
  const totalAssetUsd = currentPrices ? upbitValueUsd + binanceValueUsd : null;
  const unrealizedPnl =
    totalAssetUsd != null ? totalAssetUsd - 2 * notional : null;

  // 순 코인 노출 (롱 − 숏). 델타 중립이면 ≈ 0.
  const netCoinExposure = coinUpbit - shortBinance;
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
      ? t("arb.expiryRemaining", {
          d: Math.floor(msToExpiry / 86400000),
          h: Math.floor((msToExpiry % 86400000) / 3600000),
        })
      : t("arb.expired");

  function onClose() {
    if (!currentPrices) {
      toast.error(t("arb.noCurrentPrice"));
      return;
    }
    if (!confirm(
      t("arb.closeConfirm", {
        sym: pos.symbol,
        asset: totalAssetUsd?.toFixed(2) ?? "—",
        pnl: unrealizedPnl != null ? (unrealizedPnl >= 0 ? "+" : "") + unrealizedPnl.toFixed(2) : "—",
      }),
    ))
      return;
    startClose(async () => {
      const r = await closeArbitrageAction(
        pos.id,
        currentPrices.upbitUsd,
        currentPrices.binanceUsd,
      );
      if (!r.ok) {
        toast.error(r.error ?? t("arb.closeFailed"));
        return;
      }
      toast.success(t("arb.closeDone", { pnl: (r.pnl ?? 0).toFixed(2) }));
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
              {t("arb.rebalanceBadge")}
            </span>
            <span className="font-mono text-base font-bold">{pos.symbol}</span>
            <span className="text-xs text-muted-foreground">
              {t("arb.exposureThreshold", {
                exposure: formatNumber(notional, { maximumFractionDigits: 0 }),
                threshold: threshold.toFixed(1),
              })}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {t("arb.expiryIn", { time: expiryText })}
            </span>
            <Button size="sm" variant="outline" onClick={onClose} disabled={closing}>
              <X className="mr-1 h-3 w-3" />
              {closing ? t("arb.closing") : t("arb.close")}
            </Button>
          </div>
        </div>

        {/* 김프 상태 + 사이클 통계 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <StatBox
            label={t("arb.entryPremium")}
            value={
              entryPct != null
                ? `${entryPct >= 0 ? "+" : ""}${entryPct.toFixed(3)}%`
                : "—"
            }
          />
          <StatBox
            label={t("arb.currentPremium")}
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
                {t("arb.cycle")}
              </span>
            }
            value={t("arb.cyclesCount", { n: cyclesCount })}
          />
          <StatBox
            label={t("arb.accruedCycleProfit")}
            value={`${accrued >= 0 ? "+" : ""}${accrued.toFixed(2)}`}
            valueClass={
              accrued > 0 ? "text-grade-a" : accrued < 0 ? "text-grade-d" : ""
            }
          />
        </div>

        {/* 인벤토리 양쪽 */}
        <div className="grid gap-3 sm:grid-cols-2">
          <InventoryBox
            label={t("arb.upbitSpotLong")}
            tone="upbit"
            symbol={pos.symbol}
            coin={coinUpbit}
            usdt={usdtUpbit}
            currentCoinUsd={currentPrices?.upbitUsd}
          />
          <InventoryBox
            label={t("arb.binanceFuturesShort")}
            tone="binance"
            symbol={pos.symbol}
            coin={shortBinance}
            usdt={usdtBinance}
            currentCoinUsd={currentPrices?.binanceUsd}
            isShort
          />
        </div>

        {/* 거래소간 잔액 비교 + 다음 사이클 여력 */}
        {currentPrices ? (
          <BalanceCapacityBar
            symbol={pos.symbol}
            coinUpbit={coinUpbit}
            shortBinance={shortBinance}
            usdtUpbit={usdtUpbit}
            usdtBinance={usdtBinance}
            upbitUsd={currentPrices.upbitUsd}
            binanceUsd={currentPrices.binanceUsd}
          />
        ) : null}

        {/* 미실현 손익 합계 */}
        <div className="space-y-1 border-t border-border/60 pt-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("arb.currentAssetTotal")}</span>
            <span className="font-mono tabular-nums font-semibold">
              ${totalAssetUsd != null ? totalAssetUsd.toFixed(2) : "—"} /{" "}
              <span className="text-muted-foreground">{t("arb.startLabel")} ${(2 * notional).toFixed(0)}</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("arb.unrealizedPnl")}</span>
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
              <span className="text-muted-foreground">{t("arb.noData")}</span>
            )}
          </div>
          {coinPriceDelta != null ? (
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {t("arb.avgPriceChangeSinceEntry", { sym: pos.symbol })}
              </span>
              <span className="font-mono tabular-nums">
                {coinPriceDelta >= 0 ? "+" : ""}
                {coinPriceDelta.toFixed(2)}% · {t("arb.netExposure")} {netCoinExposure >= 0 ? "+" : ""}
                {netCoinExposure.toFixed(6)} {pos.symbol}
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
              {t("arb.cycleHistory", { n: cycles.length })}
            </span>
            <span className="text-[10px]">{historyOpen ? t("arb.collapseArrow") : t("arb.expandArrow")}</span>
          </button>
          {historyOpen ? (
            cycles.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground text-center py-3">
                {t("arb.noCycleHistory")}
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-md border border-border/60">
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">{t("arb.colTime")}</th>
                      <th className="px-3 py-2 text-left">{t("arb.colDir")}</th>
                      <th className="px-3 py-2 text-right">{t("arb.colPremium")}</th>
                      <th className="px-3 py-2 text-right">{t("arb.colMoved", { sym: pos.symbol })}</th>
                      <th className="px-3 py-2 text-right">{t("arb.colProfitUsdt")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycles.map((c) => {
                      const execDt = new Date(c.executed_at);
                      const isPositive = c.direction === "positive";
                      return (
                        <tr key={c.id} className="border-t border-border/40">
                          <td className="px-3 py-2 font-mono">
                            {execDt.toLocaleString("ko-KR", {
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
                                  ? t("arb.dirPositiveTip")
                                  : t("arb.dirNegativeTip")
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
  isShort = false,
}: {
  label: string;
  tone: "upbit" | "binance";
  symbol: string;
  coin: number;
  usdt: number;
  currentCoinUsd?: number;
  isShort?: boolean;
}) {
  const t = useT();
  // 숏이면 코인 가치는 부채(−), 순자산 = usdt − coin×price.
  const coinUsd = currentCoinUsd ? coin * currentCoinUsd : null;
  const total =
    coinUsd != null ? (isShort ? usdt - coinUsd : coinUsd + usdt) : null;
  const coinPct =
    total != null && total > 0 && coinUsd != null
      ? ((isShort ? coinUsd : coinUsd) / (isShort ? usdt : total)) * 100
      : null;
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
          <span className="text-muted-foreground">{isShort ? t("arb.symbolShort", { sym: symbol }) : symbol}</span>
          <span>
            {isShort ? "−" : ""}{coin.toFixed(6)}{" "}
            {coinUsd != null ? (
              <span className="text-muted-foreground">
                ≈ {isShort ? "−" : ""}${coinUsd.toFixed(2)}
              </span>
            ) : null}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{isShort ? t("arb.marginPlusProceeds") : "USDT"}</span>
          <span>${usdt.toFixed(2)}</span>
        </div>
        {total != null ? (
          <>
            <div className="flex justify-between border-t border-border/40 pt-1 font-semibold">
              <span className="text-muted-foreground">{isShort ? t("arb.netAsset") : t("arb.total")}</span>
              <span>${total.toFixed(2)}</span>
            </div>
            {!isShort && coinPct != null ? (
              <div className="space-y-0.5 pt-1">
                <div className="flex h-1.5 overflow-hidden rounded-full bg-muted/40">
                  <div
                    className={cn(tone === "upbit" ? "bg-amber-400" : "bg-sky-400")}
                    style={{ width: `${coinPct}%` }}
                  />
                  <div
                    className="bg-muted-foreground/40"
                    style={{ width: `${100 - coinPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{symbol} {coinPct.toFixed(0)}%</span>
                  <span>USDT {(100 - coinPct).toFixed(0)}%</span>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function BalanceCapacityBar({
  symbol,
  coinUpbit,
  shortBinance,
  usdtUpbit,
  usdtBinance,
  upbitUsd,
  binanceUsd,
}: {
  symbol: string;
  coinUpbit: number;
  shortBinance: number;
  usdtUpbit: number;
  usdtBinance: number;
  upbitUsd: number;
  binanceUsd: number;
}) {
  const t = useT();
  // 롱(Upbit 현물) / 숏(Binance 선물) 균형 — 50/50 = 델타 중립
  const totalCoin = coinUpbit + shortBinance;
  const coinUpbitPct = totalCoin > 0 ? (coinUpbit / totalCoin) * 100 : 50;
  // USDT의 거래소간 분포
  const totalUsdt = usdtUpbit + usdtBinance;
  const usdtUpbitPct = totalUsdt > 0 ? (usdtUpbit / totalUsdt) * 100 : 50;

  // 다음 사이클 여력
  // positive (+): Upbit 현물 매도 + Binance 숏 커버 → min(coinUpbit, shortBinance, usdtBinance/binanceUsd) × 25%
  // negative (-): Upbit 현물 매수 + Binance 숏 추가 → (usdtUpbit/upbitUsd) × 25%
  const FRACTION = 0.25;
  const positiveCapCoin =
    binanceUsd > 0
      ? Math.min(coinUpbit, shortBinance, usdtBinance / binanceUsd) * FRACTION
      : 0;
  const negativeCapCoin = upbitUsd > 0 ? (usdtUpbit / upbitUsd) * FRACTION : 0;
  const positiveCapUsd = positiveCapCoin * ((upbitUsd + binanceUsd) / 2);
  const negativeCapUsd = negativeCapCoin * ((upbitUsd + binanceUsd) / 2);

  // 인벤토리 고갈 경고 (한 방향 여력 < 다른 방향의 10%)
  const ratioWarning =
    positiveCapUsd > 0 && negativeCapUsd > 0
      ? Math.min(positiveCapUsd, negativeCapUsd) / Math.max(positiveCapUsd, negativeCapUsd)
      : 0;
  const heavilyImbalanced = ratioWarning < 0.1 && Math.max(positiveCapUsd, negativeCapUsd) > 0;

  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-3 space-y-3">
      {/* 롱/숏 균형 (델타 중립) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{t("arb.longShortBalance", { sym: symbol })}</span>
          <span className="font-mono tabular-nums text-muted-foreground">
            {t("arb.netExposure")} {(coinUpbit - shortBinance >= 0 ? "+" : "")}{(coinUpbit - shortBinance).toFixed(6)} {symbol}
          </span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-muted/40">
          <div className="bg-amber-400" style={{ width: `${coinUpbitPct}%` }} />
          <div className="bg-sky-400" style={{ width: `${100 - coinUpbitPct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] font-mono tabular-nums">
          <span className="text-amber-400">
            {t("arb.upbitLong")} {coinUpbit.toFixed(6)} ({coinUpbitPct.toFixed(0)}%)
          </span>
          <span className="text-sky-300">
            {t("arb.binanceShort")} {shortBinance.toFixed(6)} ({(100 - coinUpbitPct).toFixed(0)}%)
          </span>
        </div>
      </div>

      {/* USDT 거래소간 분포 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{t("arb.usdtDistribution")}</span>
          <span className="font-mono tabular-nums text-muted-foreground">
            {t("arb.totalLabel")} ${totalUsdt.toFixed(2)}
          </span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-muted/40">
          <div className="bg-amber-400" style={{ width: `${usdtUpbitPct}%` }} />
          <div className="bg-sky-400" style={{ width: `${100 - usdtUpbitPct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] font-mono tabular-nums">
          <span className="text-amber-400">
            Upbit ${usdtUpbit.toFixed(2)} ({usdtUpbitPct.toFixed(0)}%)
          </span>
          <span className="text-sky-300">
            Binance ${usdtBinance.toFixed(2)} ({(100 - usdtUpbitPct).toFixed(0)}%)
          </span>
        </div>
      </div>

      {/* 다음 사이클 여력 */}
      <div className="space-y-1.5 border-t border-border/40 pt-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{t("arb.nextCycleCapacity")}</span>
          {heavilyImbalanced ? (
            <span className="text-[10px] text-amber-400">{t("arb.imbalanceWarning")}</span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
            <div className="text-[10px] uppercase text-amber-400 font-semibold">
              {t("arb.capPositiveDir")}
            </div>
            <div className="mt-1 font-mono tabular-nums">
              {positiveCapCoin.toFixed(6)} {symbol}
            </div>
            <div className="font-mono tabular-nums text-muted-foreground text-[10px]">
              ≈ ${positiveCapUsd.toFixed(2)}
            </div>
          </div>
          <div className="rounded border border-sky-500/30 bg-sky-500/5 p-2">
            <div className="text-[10px] uppercase text-sky-300 font-semibold">
              {t("arb.capNegativeDir")}
            </div>
            <div className="mt-1 font-mono tabular-nums">
              {negativeCapCoin.toFixed(6)} {symbol}
            </div>
            <div className="font-mono tabular-nums text-muted-foreground text-[10px]">
              ≈ ${negativeCapUsd.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClosedPositionsList({ rows }: { rows: ClosedPosition[] }) {
  const t = useT();
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left">{t("arb.colClosed")}</th>
            <th className="px-4 py-3 text-left">{t("arb.colCoin")}</th>
            <th className="px-4 py-3 text-right">{t("arb.colExposure")}</th>
            <th className="px-4 py-3 text-right">{t("arb.entryPremium")}</th>
            <th className="px-4 py-3 text-right">{t("arb.threshold")}</th>
            <th className="px-4 py-3 text-right">{t("arb.cycle")}</th>
            <th className="px-4 py-3 text-right">PnL</th>
            <th className="px-4 py-3 text-left">{t("arb.colReason")}</th>
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
                    ? t("arb.reasonManual")
                    : r.close_reason === "expired"
                      ? t("arb.reasonExpired")
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
  volatility,
  onClose,
}: {
  target: KimchiOpportunity;
  wallet: WalletInfo | null;
  volatility: KimchiVolatility | null;
  onClose: () => void;
}) {
  const t = useT();
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
  //  - 슬리피지 = (notional/4) × 코인별 차등 (엔진 slippageRateFor 와 동일)
  const cycleTradeVolume = notional / 4; // 양쪽 합산 거래액
  const cycleGross = (notional / 8) * (threshold / 100);
  const cycleFees = cycleTradeVolume * 0.0004;
  const cycleSlippage = cycleTradeVolume * slippageRateFor(target.symbol);
  const estPerCycle = cycleGross - cycleFees - cycleSlippage;

  function submit() {
    if (!valid) {
      toast.error(t("arb.checkInputs"));
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
        toast.error(r.error ?? t("arb.enterFailed"));
        return;
      }
      toast.success(
        t("arb.enterDone", { threshold: threshold.toFixed(1) }),
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
              {t("arb.entryModalTitle", { sym: target.symbol })}
            </h3>
            <span className="ml-auto rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              {t("arb.autoCycle")}
            </span>
          </div>

          <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("arb.entryTimePremium")}</span>
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
              {t("arb.entryModalDesc")}
            </div>
          </div>

          {/* 📊 백테스트 요약 (7일 시뮬레이션) */}
          {volatility ? (
            <BacktestSummary symbol={target.symbol} volatility={volatility} threshold={threshold} />
          ) : null}

          {/* ✓ 델타 중립 안내 */}
          <PriceExposureWarning symbol={target.symbol} volatility={volatility} />

          <div>
            <Label htmlFor="notional" className="text-xs">
              {t("arb.legExposureLabel")}
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
              {t("arb.requiredMargin", { margin: formatNumber(totalMargin, { maximumFractionDigits: 0 }) })}{" "}
              {wallet ? (
                <span className={canAfford ? "text-muted-foreground" : "text-grade-d"}>
                  {t("arb.availableSuffix", { available: formatNumber(wallet.available, { maximumFractionDigits: 0 }) })}
                </span>
              ) : null}
            </p>
          </div>

          <div>
            <Label htmlFor="threshold" className="text-xs">
              {t("arb.rebalanceThresholdLabel")}
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
              {t("arb.currentPremium")}{" "}
              <span
                className={cn(
                  "font-mono",
                  target.premiumPct >= 0 ? "text-amber-400" : "text-sky-300",
                )}
              >
                {target.premiumPct >= 0 ? "+" : ""}
                {target.premiumPct.toFixed(3)}%
              </span>{" "}
              {t("arb.cycleTrigger", { threshold: threshold.toFixed(1) })}
              <br />
              <span className="text-[10px]">
                {t("arb.perCycleNetPrefix")}{" "}
                <span
                  className={cn(
                    "font-mono font-semibold",
                    estPerCycle >= 0 ? "text-grade-a" : "text-grade-d",
                  )}
                >
                  {estPerCycle >= 0 ? "+" : ""}
                  {estPerCycle.toFixed(2)} USDT
                </span>{" "}
                {t("arb.perCycleBreakdown", {
                  gross: cycleGross.toFixed(2),
                  fees: cycleFees.toFixed(2),
                  slippage: cycleSlippage.toFixed(2),
                })}
              </span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
              <div className="text-[10px] font-semibold uppercase text-amber-400">
                {t("arb.upbitSpotLongShort")}
              </div>
              <div className="font-mono text-[11px]">
                {target.symbol} {(notional / 2 / (target.upbitKrw / target.usdKrwRate)).toFixed(6)}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {t("arb.cash")} ${(notional / 2).toFixed(2)}
              </div>
            </div>
            <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-2">
              <div className="text-[10px] font-semibold uppercase text-sky-300">
                {t("arb.binanceFuturesShortShort")}
              </div>
              <div className="font-mono text-[11px]">
                {t("arb.symbolShort", { sym: target.symbol })} {(notional / 2 / target.binanceUsd).toFixed(6)}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {t("arb.margin")} ${(notional / 2).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={pending}>
              {t("arb.cancel")}
            </Button>
            <Button className="flex-1" onClick={submit} disabled={pending || !valid}>
              <Wallet className="mr-2 h-4 w-4" />
              {pending ? t("arb.entering") : t("arb.rebalanceEnter")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
