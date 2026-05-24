"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { GradeBadge } from "@/components/trade/grade-badge";
import { Input } from "@/components/ui/input";
import type { Grade } from "@/types/trade";
import { cn, formatNumber } from "@/lib/utils";

export interface ClosedTradeRow {
  id: string;
  symbol: string;
  direction: "long" | "short";
  timeframe: string;
  pre_grade: string;
  pre_rr: number | null;
  result_r: number | null;
  closed_at: string | null;
  created_at: string;
  entry: number;
  entry_actual: number | null;
  stop: number;
  exit_actual: number | null;
  exit_price: number | null;
  position_quantity: number | null;
  fees_pct: number | null;
  leverage: number | null;
  order_type: string | null;
  exit_reason: "target" | "stop" | "manual" | null;
  pnl: number | null;
  roiPct: number | null;
}

type ReasonFilter = "all" | "target" | "stop" | "manual";
type PeriodFilter = "7d" | "30d" | "90d" | "all";

const PAGE_SIZE = 10;

const PERIOD_LABEL: Record<PeriodFilter, string> = {
  "7d": "7일",
  "30d": "30일",
  "90d": "90일",
  all: "전체",
};

const PERIOD_MS: Record<PeriodFilter, number | null> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  all: null,
};

export function ClosedTradesTable({ rows }: { rows: ClosedTradeRow[] }) {
  const [symbolQuery, setSymbolQuery] = useState("");
  const [reason, setReason] = useState<ReasonFilter>("all");
  const [period, setPeriod] = useState<PeriodFilter>("30d");
  const [page, setPage] = useState(1);

  // Filtered (sorted newest first already)
  const filtered = useMemo(() => {
    const q = symbolQuery.toUpperCase().trim();
    const periodMs = PERIOD_MS[period];
    const cutoff = periodMs ? Date.now() - periodMs : null;
    return rows.filter((t) => {
      if (q && !t.symbol.toUpperCase().includes(q)) return false;
      if (reason !== "all" && t.exit_reason !== reason) return false;
      if (cutoff != null) {
        const ts = t.closed_at
          ? new Date(t.closed_at).getTime()
          : new Date(t.created_at).getTime();
        if (ts < cutoff) return false;
      }
      return true;
    });
  }, [rows, symbolQuery, reason, period]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  // Reset to page 1 when filter changes
  function changeReason(r: ReasonFilter) {
    setReason(r);
    setPage(1);
  }
  function changePeriod(p: PeriodFilter) {
    setPeriod(p);
    setPage(1);
  }
  function changeSymbol(v: string) {
    setSymbolQuery(v);
    setPage(1);
  }

  // Aggregate counts for reason buttons
  const counts = useMemo(() => {
    const base = rows.filter((t) => {
      const periodMs = PERIOD_MS[period];
      const cutoff = periodMs ? Date.now() - periodMs : null;
      if (cutoff != null) {
        const ts = t.closed_at
          ? new Date(t.closed_at).getTime()
          : new Date(t.created_at).getTime();
        if (ts < cutoff) return false;
      }
      const q = symbolQuery.toUpperCase().trim();
      if (q && !t.symbol.toUpperCase().includes(q)) return false;
      return true;
    });
    return {
      all: base.length,
      target: base.filter((t) => t.exit_reason === "target").length,
      stop: base.filter((t) => t.exit_reason === "stop").length,
      manual: base.filter((t) => t.exit_reason === "manual").length,
    };
  }, [rows, symbolQuery, period]);

  return (
    <div className="space-y-3">
      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
        {/* 코인 검색 */}
        <div className="relative flex min-w-[160px] flex-1 items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={symbolQuery}
            onChange={(e) => changeSymbol(e.target.value)}
            placeholder="코인 검색 (예: BTC, ETH)"
            className="h-8 pl-7 text-xs"
          />
        </div>

        {/* 사유 */}
        <div className="flex items-center gap-1 rounded-md border border-border bg-background/40 p-0.5">
          {(["all", "target", "stop", "manual"] as ReasonFilter[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => changeReason(r)}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-semibold transition-colors",
                reason === r
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent/40",
              )}
            >
              {r === "all" && `전체 ${counts.all}`}
              {r === "target" && (
                <span className={reason === r ? "" : "text-grade-a"}>
                  익절 {counts.target}
                </span>
              )}
              {r === "stop" && (
                <span className={reason === r ? "" : "text-grade-d"}>
                  손절 {counts.stop}
                </span>
              )}
              {r === "manual" && `수동 ${counts.manual}`}
            </button>
          ))}
        </div>

        {/* 기간 */}
        <div className="flex items-center gap-1 rounded-md border border-border bg-background/40 p-0.5">
          {(["7d", "30d", "90d", "all"] as PeriodFilter[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => changePeriod(p)}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-semibold transition-colors",
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent/40",
              )}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border/60 bg-card/40 p-10 text-center text-sm text-muted-foreground">
          조건에 맞는 거래가 없습니다.
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[1280px] text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left">시간</th>
                  <th className="px-2 py-1.5 text-left">코인</th>
                  <th className="px-2 py-1.5 text-left">방향</th>
                  <th className="px-2 py-1.5 text-left">주문</th>
                  <th className="px-2 py-1.5 text-left">TF</th>
                  <th className="px-2 py-1.5 text-right">레버</th>
                  <th className="px-2 py-1.5 text-left">등급</th>
                  <th className="px-2 py-1.5 text-right">진입 / 체결</th>
                  <th className="px-2 py-1.5 text-right">손절 / 청산</th>
                  <th className="px-2 py-1.5 text-right">수량</th>
                  <th className="px-2 py-1.5 text-right">R:R</th>
                  <th className="px-2 py-1.5 text-right">실현 R</th>
                  <th className="px-2 py-1.5 text-right">PnL</th>
                  <th className="px-2 py-1.5 text-right">ROI</th>
                  <th className="px-2 py-1.5 text-left">사유</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => {
                  const entryTime = new Date(t.created_at);
                  const exitTime = t.closed_at ? new Date(t.closed_at) : null;
                  const fmtPx = (n: number | null) =>
                    n == null
                      ? "—"
                      : n >= 1000
                        ? n.toLocaleString("en-US", { maximumFractionDigits: 0 })
                        : n.toFixed(4);
                  const exitActualNum = t.exit_actual ?? t.exit_price;
                  const feesPctNum =
                    t.fees_pct != null ? Number(t.fees_pct) : null;
                  return (
                    <tr key={t.id} className="border-t border-border hover:bg-accent/40">
                      <td className="px-2 py-1.5">
                        <Link
                          href={`/app/journal/${t.id}`}
                          title={feesPctNum != null ? `수수료 ${feesPctNum.toFixed(2)}%` : undefined}
                          className="block text-foreground hover:underline"
                        >
                          <div>
                            {entryTime.toLocaleDateString("ko-KR", {
                              month: "numeric",
                              day: "numeric",
                            })}{" "}
                            {entryTime.toLocaleTimeString("ko-KR", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {exitTime
                              ? `→ ${exitTime.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}`
                              : "—"}
                          </div>
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 font-mono">{t.symbol}</td>
                      <td className="px-2 py-1.5">{t.direction === "long" ? "롱" : "숏"}</td>
                      <td className="px-2 py-1.5">
                        {t.order_type === "limit" ? (
                          <span className="rounded bg-sky-500/10 px-1 py-0.5 text-[10px] text-sky-400">
                            지정
                          </span>
                        ) : (
                          <span className="rounded bg-muted/40 px-1 py-0.5 text-[10px] text-muted-foreground">
                            시장
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">{t.timeframe}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {t.leverage != null ? (
                          <span
                            className={
                              t.leverage >= 20
                                ? "text-grade-d"
                                : t.leverage >= 10
                                  ? "text-amber-400"
                                  : "text-foreground"
                            }
                          >
                            {t.leverage}x
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <GradeBadge grade={t.pre_grade as Grade} size="sm" />
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        <div>{fmtPx(t.entry)}</div>
                        <div
                          className="text-[10px] text-muted-foreground"
                          title="실제 체결가 (슬리피지 포함)"
                        >
                          ↳ {fmtPx(t.entry_actual)}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        <div>{fmtPx(t.stop)}</div>
                        <div
                          className="text-[10px] text-muted-foreground"
                          title="실제 청산가"
                        >
                          ↳ {fmtPx(exitActualNum)}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {t.position_quantity != null
                          ? Number(t.position_quantity).toFixed(4)
                          : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {Number(t.pre_rr ?? 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {t.result_r != null ? (
                          <span
                            className={
                              Number(t.result_r) >= 0
                                ? "text-grade-a"
                                : "text-grade-d"
                            }
                          >
                            {Number(t.result_r) >= 0 ? "+" : ""}
                            {Number(t.result_r).toFixed(2)}R
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {t.pnl != null ? (
                          <span
                            className={t.pnl >= 0 ? "text-grade-a" : "text-grade-d"}
                          >
                            {t.pnl >= 0 ? "+" : ""}
                            {formatNumber(t.pnl, { maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {t.roiPct != null ? (
                          <span
                            className={
                              t.roiPct >= 0 ? "text-grade-a" : "text-grade-d"
                            }
                          >
                            {t.roiPct >= 0 ? "+" : ""}
                            {t.roiPct.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {t.exit_reason === "target" ? (
                          <span className="text-grade-a">목표</span>
                        ) : t.exit_reason === "stop" ? (
                          <span className="text-grade-d">손절</span>
                        ) : t.exit_reason === "manual" ? (
                          <span className="text-muted-foreground">수동</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">
                {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, filtered.length)} /{" "}
                {filtered.length}건
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="px-2 font-mono tabular-nums">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
