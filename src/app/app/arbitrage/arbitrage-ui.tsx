"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight, Wallet, X, Clock, TrendingUp, TrendingDown, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatNumber } from "@/lib/utils";
import {
  KIMCHI_TARGET_OFFSET_PCT,
  KIMCHI_MAX_TARGET_PCT,
} from "@/lib/arbitrage/constants";
import type { KimchiOpportunity } from "@/lib/arbitrage/scan";
import { enterArbitrageAction, closeArbitrageAction } from "./_actions";

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
  long_exchange: string;
  long_entry_price: number;
  long_qty: number;
  short_exchange: string;
  short_entry_price: number;
  short_qty: number;
  entry_premium_pct: number | null;
  target_premium_pct: number | null;
  expires_at: string;
  created_at: string;
}

interface ClosedPosition {
  id: string;
  kind: "kimchi";
  symbol: string;
  notional_usd: number;
  long_exchange: string;
  short_exchange: string;
  entry_premium_pct: number | null;
  target_premium_pct: number | null;
  long_entry_price: number;
  short_entry_price: number;
  long_exit_price: number | null;
  short_exit_price: number | null;
  realized_pnl: number | null;
  close_reason: string | null;
  created_at: string;
  closed_at: string | null;
}

interface Props {
  wallet: WalletInfo | null;
  kimchi: KimchiOpportunity[];
  currentPremiums: Record<string, number>;
  openPositions: OpenPosition[];
  closedPositions: ClosedPosition[];
}

export function ArbitrageUI({
  wallet,
  kimchi,
  currentPremiums,
  openPositions,
  closedPositions,
}: Props) {
  const [entryTarget, setEntryTarget] = useState<KimchiOpportunity | null>(null);

  return (
    <div className="space-y-6">
      {/* 헤더 + 잔액 */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold leading-[1.15]">차익거래</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            🇰🇷 김치 프리미엄 — Upbit 매수 + Binance 숏 동시 진입.
            진입 시 청산 목표 김프 지정 → 도달 시 양쪽 청산.
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

      {/* 코인별 김프 현황 */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">
            코인별 김프 현황 ({kimchi.length})
          </h2>
          <p className="text-xs text-muted-foreground">0에 가까운 순</p>
        </div>

        {kimchi.length === 0 ? (
          <EmptyMessage text="김프 데이터를 불러올 수 없습니다. 잠시 후 다시 시도해주세요." />
        ) : (
          <KimchiPremiumTable rows={kimchi} onEnter={setEntryTarget} />
        )}
      </section>

      {/* 진행 중 포지션 */}
      {openPositions.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">
            진행 중 차익 포지션 ({openPositions.length})
          </h2>
          <div className="space-y-2">
            {openPositions.map((p) => (
              <ActivePositionCard
                key={p.id}
                pos={p}
                currentPremium={currentPremiums[p.symbol] ?? null}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* 종료된 차익 포지션 */}
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

function EmptyMessage({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="p-10 text-center text-sm text-muted-foreground">
        {text}
      </CardContent>
    </Card>
  );
}

/**
 * 활성 포지션 PnL 계산.
 *
 * 진입 김프 e, 현재 김프 p, notional N → 예상 PnL = (p - e)/100 × N
 * (수수료 차감 전. 실제 청산 시 0.08% 추가 차감.)
 */
function estimatePnl(notional: number, entryPct: number, currentPct: number): number {
  return ((currentPct - entryPct) / 100) * notional;
}

function ActivePositionCard({
  pos,
  currentPremium,
}: {
  pos: OpenPosition;
  currentPremium: number | null;
}) {
  const router = useRouter();
  const [closing, startClose] = useTransition();

  const notional = Number(pos.notional_usd);
  const entryPct = pos.entry_premium_pct != null ? Number(pos.entry_premium_pct) : null;
  const targetPct = pos.target_premium_pct != null ? Number(pos.target_premium_pct) : 1.0;

  const netPnl =
    entryPct != null && currentPremium != null
      ? estimatePnl(notional, entryPct, currentPremium)
      : null;

  // 진행률: 진입 김프 → 목표 김프 사이에서 현재 위치 (%)
  const progressPct =
    entryPct != null && currentPremium != null
      ? Math.max(0, Math.min(100, ((currentPremium - entryPct) / (targetPct - entryPct)) * 100))
      : 0;
  const reachedTarget = currentPremium != null && currentPremium >= targetPct;

  const expiry = new Date(pos.expires_at);
  const msToExpiry = expiry.getTime() - Date.now();
  const expiryText =
    msToExpiry > 0
      ? `${Math.floor(msToExpiry / 86400000)}일 ${Math.floor((msToExpiry % 86400000) / 3600000)}h`
      : "만료";

  function onClose() {
    if (!confirm(
      `${pos.symbol} 차익거래 청산하시겠습니까? (예상 PnL ${netPnl != null ? netPnl.toFixed(2) : "—"} vUSDT, 수수료 차감 전)`,
    ))
      return;
    startClose(async () => {
      // 청산가는 진입가 + 김프 변화량 반영. 단순화를 위해 entry 가격 그대로 + 김프 차이로 PnL 산출.
      // 실제 가격을 안 써도 PnL 은 김프 변화량으로 계산됨.
      const longEntry = Number(pos.long_entry_price);
      const shortEntry = Number(pos.short_entry_price);
      const deltaPct =
        entryPct != null && currentPremium != null ? (currentPremium - entryPct) / 100 : 0;
      // Upbit 가격이 김프 변화만큼 변했다고 가정 (Binance 가격은 고정).
      const longExit = longEntry * (1 + deltaPct);
      const shortExit = shortEntry;
      const r = await closeArbitrageAction(pos.id, longExit, shortExit);
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
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              김프
            </span>
            <span className="font-mono text-base font-bold">{pos.symbol}</span>
            <span className="text-xs text-muted-foreground">
              노출 ${formatNumber(notional, { maximumFractionDigits: 0 })} × 2
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              만료까지 {expiryText}
            </span>
            <Button
              size="sm"
              variant={reachedTarget ? "default" : "outline"}
              onClick={onClose}
              disabled={closing}
            >
              <X className="mr-1 h-3 w-3" />
              {closing ? "청산 중…" : reachedTarget ? "지금 청산 (목표 도달)" : "청산"}
            </Button>
          </div>
        </div>

        {/* 김프 진행률 바 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              진입 {entryPct != null ? `${entryPct >= 0 ? "+" : ""}${entryPct.toFixed(2)}%` : "—"}
            </span>
            <span className="inline-flex items-center gap-1 text-foreground">
              현재{" "}
              {currentPremium != null ? (
                <span
                  className={cn(
                    "font-mono font-semibold",
                    reachedTarget ? "text-grade-a" : "",
                  )}
                >
                  {currentPremium >= 0 ? "+" : ""}
                  {currentPremium.toFixed(2)}%
                </span>
              ) : (
                "—"
              )}
            </span>
            <span className="inline-flex items-center gap-1">
              <Target className="h-3 w-3" />
              목표 +{targetPct.toFixed(2)}%
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "absolute left-0 top-0 h-full transition-all",
                reachedTarget ? "bg-grade-a" : "bg-primary",
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <LegSummary
            tone="long"
            label="Long · Upbit"
            entry={Number(pos.long_entry_price)}
            qty={Number(pos.long_qty)}
          />
          <LegSummary
            tone="short"
            label="Short · Binance"
            entry={Number(pos.short_entry_price)}
            qty={Number(pos.short_qty)}
          />
        </div>

        <div className="flex items-center justify-between border-t border-border/60 pt-2 text-sm">
          <span className="text-muted-foreground">예상 PnL (수수료 차감 전)</span>
          {netPnl != null ? (
            <span
              className={cn(
                "font-mono text-base font-bold tabular-nums",
                netPnl >= 0 ? "text-grade-a" : "text-grade-d",
              )}
            >
              {netPnl >= 0 ? "+" : ""}
              {netPnl.toFixed(2)} vUSDT
            </span>
          ) : (
            <span className="text-muted-foreground">데이터 없음</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LegSummary({
  tone,
  label,
  entry,
  qty,
}: {
  tone: "long" | "short";
  label: string;
  entry: number;
  qty: number;
}) {
  const isLong = tone === "long";
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs">
      <div className="mb-2 flex items-center gap-1.5">
        {isLong ? (
          <TrendingUp className="h-3.5 w-3.5 text-grade-a" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5 text-grade-d" />
        )}
        <span className="font-semibold">{label}</span>
      </div>
      <div className="space-y-0.5 font-mono tabular-nums">
        <div className="flex justify-between">
          <span className="text-muted-foreground">진입가</span>
          <span>${entry.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">수량</span>
          <span>{qty.toFixed(6)}</span>
        </div>
      </div>
    </div>
  );
}

function KimchiPremiumTable({
  rows,
  onEnter,
}: {
  rows: KimchiOpportunity[];
  onEnter: (k: KimchiOpportunity) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left">코인</th>
            <th className="px-2 py-1.5 text-right">김프</th>
            <th className="px-2 py-1.5 text-right">Upbit (KRW)</th>
            <th className="px-2 py-1.5 text-right">Binance (USD)</th>
            <th className="px-2 py-1.5 text-right">Binance (KRW 환산)</th>
            <th className="px-2 py-1.5 text-center">액션</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const positive = r.premiumPct > 0;
            return (
              <tr key={r.symbol} className="border-t border-border hover:bg-accent/40">
                <td className="px-2 py-1.5 font-mono font-semibold">{r.symbol}</td>
                <td
                  className={cn(
                    "px-2 py-1.5 text-right font-mono tabular-nums font-semibold",
                    Math.abs(r.premiumPct) < 0.1
                      ? "text-sky-400"
                      : positive
                        ? "text-amber-400"
                        : "text-sky-300",
                  )}
                >
                  {positive ? "+" : ""}
                  {r.premiumPct.toFixed(3)}%
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                  ₩{r.upbitKrw.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                  ${r.binanceUsd.toLocaleString("en-US", {
                    maximumFractionDigits: r.binanceUsd < 1 ? 6 : 2,
                  })}
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                  ₩{r.fairKrw.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <Button
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => onEnter(r)}
                  >
                    진입
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClosedPositionsList({ rows }: { rows: ClosedPosition[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[900px] text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left">종료</th>
            <th className="px-2 py-1.5 text-left">코인</th>
            <th className="px-2 py-1.5 text-right">노출</th>
            <th className="px-2 py-1.5 text-right">진입 김프</th>
            <th className="px-2 py-1.5 text-right">목표</th>
            <th className="px-2 py-1.5 text-right">PnL</th>
            <th className="px-2 py-1.5 text-left">사유</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const closeAt = r.closed_at ? new Date(r.closed_at) : null;
            const entryPct = r.entry_premium_pct != null ? Number(r.entry_premium_pct) : null;
            const targetPct = r.target_premium_pct != null ? Number(r.target_premium_pct) : null;
            return (
              <tr key={r.id} className="border-t border-border hover:bg-accent/40">
                <td className="px-2 py-1.5">
                  {closeAt
                    ? `${closeAt.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} ${closeAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}`
                    : "—"}
                </td>
                <td className="px-2 py-1.5 font-mono">{r.symbol}</td>
                <td className="px-2 py-1.5 text-right font-mono">
                  ${formatNumber(r.notional_usd, { maximumFractionDigits: 0 })}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {entryPct != null
                    ? `${entryPct >= 0 ? "+" : ""}${entryPct.toFixed(2)}%`
                    : "—"}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {targetPct != null ? `+${targetPct.toFixed(2)}%` : "—"}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">
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
                <td className="px-2 py-1.5 text-muted-foreground">
                  {r.close_reason === "manual"
                    ? "수동"
                    : r.close_reason === "expired"
                      ? "만료"
                      : r.close_reason === "target"
                        ? "목표 도달"
                        : r.close_reason === "converged"
                          ? "수렴"
                          : "—"}
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
  // 청산 목표 = 진입 김프 + 1.5%p (기본). 사용자 조정 가능.
  const [targetPct, setTargetPct] = useState(
    () => Math.round((target.premiumPct + KIMCHI_TARGET_OFFSET_PCT) * 10) / 10,
  );
  const [pending, startTransition] = useTransition();

  const totalMargin = notional * 2;
  const canAfford = wallet != null && wallet.available >= totalMargin;
  const targetValid =
    targetPct > target.premiumPct && targetPct <= KIMCHI_MAX_TARGET_PCT;
  const expectedPnl = ((targetPct - target.premiumPct) / 100) * notional;

  function submit() {
    if (!targetValid) {
      toast.error("청산 목표 김프는 진입 김프보다 커야 하고 20% 이하여야 합니다.");
      return;
    }
    startTransition(async () => {
      const r = await enterArbitrageAction({
        symbol: target.symbol,
        notionalUsd: notional,
        longExchange: target.longExchange,
        longEntryPrice: target.longPrice,
        shortExchange: target.shortExchange,
        shortEntryPrice: target.shortPrice,
        entryPremiumPct: target.premiumPct,
        targetPremiumPct: targetPct,
      });
      if (!r.ok) {
        toast.error(r.error ?? "진입 실패");
        return;
      }
      toast.success("차익거래 진입 완료. 진행 중 포지션에서 확인하세요.");
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <Card className="w-full max-w-md border-border">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            <h3 className="text-base font-bold">
              김치 프리미엄 차익 진입 — {target.symbol}
            </h3>
          </div>

          <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">진입 김프</span>
              <span
                className={cn(
                  "font-mono",
                  target.premiumPct >= 0 ? "text-amber-400" : "text-sky-300",
                )}
              >
                {target.premiumPct >= 0 ? "+" : ""}
                {target.premiumPct.toFixed(2)}%
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              김프가 목표값에 도달하면 자동 청산. 만료 7일.
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
              필요 마진 = ${formatNumber(totalMargin, { maximumFractionDigits: 0 })}{" "}
              (양쪽 합산){" "}
              {wallet ? (
                <span className={canAfford ? "text-muted-foreground" : "text-grade-d"}>
                  · 사용 가능 ${formatNumber(wallet.available, { maximumFractionDigits: 0 })}
                </span>
              ) : null}
            </p>
          </div>

          <div>
            <Label htmlFor="target" className="text-xs">
              청산 목표 김프 (%)
            </Label>
            <Input
              id="target"
              type="number"
              step="0.1"
              min={(target.premiumPct + 0.1).toFixed(1)}
              max={KIMCHI_MAX_TARGET_PCT}
              value={targetPct}
              onChange={(e) => setTargetPct(Number(e.target.value))}
              className="mt-1 font-mono"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              예상 PnL (수수료 차감 전):{" "}
              <span
                className={cn(
                  "font-mono font-semibold",
                  expectedPnl >= 0 ? "text-grade-a" : "text-grade-d",
                )}
              >
                {expectedPnl >= 0 ? "+" : ""}
                {expectedPnl.toFixed(2)} vUSDT
              </span>{" "}
              · 김프 변화 {(targetPct - target.premiumPct).toFixed(2)}%p
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-grade-a/30 bg-grade-a/5 p-2">
              <div className="font-semibold text-grade-a">Long · Upbit</div>
              <div className="font-mono text-[11px]">
                ₩{target.upbitKrw.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                ≈ ${target.longPrice.toFixed(2)}
              </div>
            </div>
            <div className="rounded-md border border-grade-d/30 bg-grade-d/5 p-2">
              <div className="font-semibold text-grade-d">Short · Binance</div>
              <div className="font-mono text-[11px]">${target.shortPrice.toFixed(2)}</div>
              <div className="font-mono text-[11px] text-muted-foreground">perp</div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={pending}
            >
              취소
            </Button>
            <Button
              className="flex-1"
              onClick={submit}
              disabled={pending || !canAfford || notional < 100 || !targetValid}
            >
              <Wallet className="mr-2 h-4 w-4" />
              {pending ? "진입 중…" : "가상 진입"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
