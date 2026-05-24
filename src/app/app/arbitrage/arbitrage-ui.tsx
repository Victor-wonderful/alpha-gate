"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight, Wallet, X, Clock, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatNumber } from "@/lib/utils";
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
  openPositions: OpenPosition[];
  closedPositions: ClosedPosition[];
}

export function ArbitrageUI({
  wallet,
  kimchi,
  openPositions,
  closedPositions,
}: Props) {
  const [entryTarget, setEntryTarget] = useState<KimchiOpportunity | null>(null);

  // 활성 포지션 PnL 계산용 — symbol → current prices 매핑
  const currentPrices = useMemo(() => {
    const m = new Map<string, { long: number; short: number }>();
    for (const k of kimchi) {
      m.set(k.symbol, { long: k.longPrice, short: k.shortPrice });
    }
    return m;
  }, [kimchi]);

  return (
    <div className="space-y-6">
      {/* 헤더 + 잔액 */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold leading-[1.15]">차익거래</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            🇰🇷 김치 프리미엄 — Upbit (KRW) vs Binance (USD) 가격 차이 차익
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

      {/* 스캐너 */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">차익 기회 ({kimchi.length})</h2>
          <p className="text-xs text-muted-foreground">
            Upbit (KRW) vs Binance (USD) — |김프| ≥ 0.3%
          </p>
        </div>
        {kimchi.length === 0 ? (
          <EmptyMessage text="현재 김치 프리미엄 0.3% 이상 기회가 없습니다." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kimchi.map((k) => (
              <KimchiCard
                key={k.symbol}
                data={k}
                onEnter={() => setEntryTarget(k)}
              />
            ))}
          </div>
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
                currentLong={currentPrices.get(p.symbol)?.long ?? null}
                currentShort={currentPrices.get(p.symbol)?.short ?? null}
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

function KimchiCard({
  data,
  onEnter,
}: {
  data: KimchiOpportunity;
  onEnter: () => void;
}) {
  const positive = data.premiumPct > 0;
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-base font-bold">{data.symbol}</span>
          <span
            className={cn(
              "font-mono text-lg font-bold tabular-nums",
              positive ? "text-grade-a" : "text-grade-d",
            )}
          >
            {positive ? "+" : ""}
            {data.premiumPct.toFixed(2)}%
          </span>
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Upbit</span>
            <span className="font-mono tabular-nums">
              ₩{data.upbitKrw.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Binance</span>
            <span className="font-mono tabular-nums">
              ${data.binanceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between border-t border-border/60 pt-1 text-[11px]">
            <span className="text-muted-foreground">전략</span>
            <span className="font-mono">
              Long {data.longExchange} · Short {data.shortExchange}
            </span>
          </div>
        </div>
        <Button size="sm" className="w-full" onClick={onEnter}>
          진입 시뮬레이션
        </Button>
      </CardContent>
    </Card>
  );
}

function ActivePositionCard({
  pos,
  currentLong,
  currentShort,
}: {
  pos: OpenPosition;
  currentLong: number | null;
  currentShort: number | null;
}) {
  const router = useRouter();
  const [closing, startClose] = useTransition();

  const longQty = Number(pos.long_qty);
  const shortQty = Number(pos.short_qty);
  const longEntry = Number(pos.long_entry_price);
  const shortEntry = Number(pos.short_entry_price);
  const longPnl =
    currentLong != null ? (currentLong - longEntry) * longQty : null;
  const shortPnl =
    currentShort != null ? (shortEntry - currentShort) * shortQty : null;
  const netPnl =
    longPnl != null && shortPnl != null ? longPnl + shortPnl : null;

  const expiry = new Date(pos.expires_at);
  const msToExpiry = expiry.getTime() - Date.now();
  const expiryText =
    msToExpiry > 0
      ? `${Math.floor(msToExpiry / 86400000)}일 ${Math.floor((msToExpiry % 86400000) / 3600000)}h`
      : "만료";

  function onClose() {
    if (currentLong == null || currentShort == null) {
      toast.error("현재 가격을 가져올 수 없습니다.");
      return;
    }
    if (!confirm(`${pos.symbol} 차익거래 청산하시겠습니까? (예상 PnL ${netPnl?.toFixed(2) ?? "—"})`))
      return;
    startClose(async () => {
      const r = await closeArbitrageAction(pos.id, currentLong, currentShort);
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
              노출 ${formatNumber(pos.notional_usd, { maximumFractionDigits: 0 })} × 2
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              만료까지 {expiryText}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={onClose}
              disabled={closing}
            >
              <X className="mr-1 h-3 w-3" />
              {closing ? "청산 중…" : "청산"}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <LegCard
            tone="long"
            exchange={pos.long_exchange}
            entry={longEntry}
            current={currentLong}
            qty={longQty}
            pnl={longPnl}
          />
          <LegCard
            tone="short"
            exchange={pos.short_exchange}
            entry={shortEntry}
            current={currentShort}
            qty={shortQty}
            pnl={shortPnl}
          />
        </div>

        <div className="flex items-center justify-between border-t border-border/60 pt-2 text-sm">
          <span className="text-muted-foreground">Net PnL (수수료 차감 전)</span>
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

function LegCard({
  tone,
  exchange,
  entry,
  current,
  qty,
  pnl,
}: {
  tone: "long" | "short";
  exchange: string;
  entry: number;
  current: number | null;
  qty: number;
  pnl: number | null;
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
        <span className="font-semibold">
          {isLong ? "Long" : "Short"} · {exchange}
        </span>
      </div>
      <div className="space-y-0.5 font-mono tabular-nums">
        <div className="flex justify-between">
          <span className="text-muted-foreground">진입</span>
          <span>${entry.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">현재</span>
          <span>{current != null ? `$${current.toFixed(2)}` : "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">수량</span>
          <span>{qty.toFixed(6)}</span>
        </div>
        <div className="flex justify-between border-t border-border/40 pt-1">
          <span className="text-muted-foreground">PnL</span>
          {pnl != null ? (
            <span className={pnl >= 0 ? "text-grade-a" : "text-grade-d"}>
              {pnl >= 0 ? "+" : ""}
              {pnl.toFixed(2)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      </div>
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
            <th className="px-2 py-1.5 text-left">Long 진입→청산</th>
            <th className="px-2 py-1.5 text-left">Short 진입→청산</th>
            <th className="px-2 py-1.5 text-right">PnL</th>
            <th className="px-2 py-1.5 text-left">사유</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const closeAt = r.closed_at ? new Date(r.closed_at) : null;
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
                <td className="px-2 py-1.5 font-mono text-[10px]">
                  {r.long_exchange}
                  <div className="text-muted-foreground">
                    ${Number(r.long_entry_price).toFixed(2)} → $
                    {r.long_exit_price != null
                      ? Number(r.long_exit_price).toFixed(2)
                      : "—"}
                  </div>
                </td>
                <td className="px-2 py-1.5 font-mono text-[10px]">
                  {r.short_exchange}
                  <div className="text-muted-foreground">
                    ${Number(r.short_entry_price).toFixed(2)} → $
                    {r.short_exit_price != null
                      ? Number(r.short_exit_price).toFixed(2)
                      : "—"}
                  </div>
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
  const [pending, startTransition] = useTransition();

  const totalMargin = notional * 2;
  const canAfford = wallet != null && wallet.available >= totalMargin;

  function submit() {
    startTransition(async () => {
      const r = await enterArbitrageAction({
        symbol: target.symbol,
        notionalUsd: notional,
        longExchange: target.longExchange,
        longEntryPrice: target.longPrice,
        shortExchange: target.shortExchange,
        shortEntryPrice: target.shortPrice,
        entryPremiumPct: target.premiumPct,
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
                  target.premiumPct > 0 ? "text-grade-a" : "text-grade-d",
                )}
              >
                {target.premiumPct > 0 ? "+" : ""}
                {target.premiumPct.toFixed(2)}%
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              김프가 0%로 수렴하면 수익. 만료 7일.
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
                <span
                  className={
                    canAfford ? "text-muted-foreground" : "text-grade-d"
                  }
                >
                  · 사용 가능 ${formatNumber(wallet.available, { maximumFractionDigits: 0 })}
                </span>
              ) : null}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-grade-a/30 bg-grade-a/5 p-2">
              <div className="font-semibold text-grade-a">Long</div>
              <div className="font-mono text-[11px]">{target.longExchange}</div>
              <div className="font-mono text-[11px]">@ ${target.longPrice.toFixed(2)}</div>
            </div>
            <div className="rounded-md border border-grade-d/30 bg-grade-d/5 p-2">
              <div className="font-semibold text-grade-d">Short</div>
              <div className="font-mono text-[11px]">{target.shortExchange}</div>
              <div className="font-mono text-[11px]">@ ${target.shortPrice.toFixed(2)}</div>
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
              disabled={pending || !canAfford || notional < 100}
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
