"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { GradeBadge } from "@/components/trade/grade-badge";
import { Input } from "@/components/ui/input";
import type { Grade } from "@/types/trade";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

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
  exit_reason: "target" | "stop" | "manual" | "timeout" | null;
  mode?: "live" | "backtest";
  pnl: number | null;
  roiPct: number | null;
}

type ReasonFilter = "all" | "target" | "stop" | "manual" | "timeout";
type PeriodFilter = "7d" | "30d" | "90d" | "all";

const PAGE_SIZE = 10;

const PERIOD_MS: Record<PeriodFilter, number | null> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  all: null,
};

export function ClosedTradesTable({ rows }: { rows: ClosedTradeRow[] }) {
  const t = useT();
  const PERIOD_LABEL: Record<PeriodFilter, string> = {
    "7d": t("journal.table.period.7d"),
    "30d": t("journal.table.period.30d"),
    "90d": t("journal.table.period.90d"),
    all: t("journal.table.period.all"),
  };
  const [symbolQuery, setSymbolQuery] = useState("");
  const [reason, setReason] = useState<ReasonFilter>("all");
  // 기본 "전체" — 섹션 헤더의 종료 거래 카운트(전체 기간)와 표에 보이는 행을 일치시킨다.
  // (기본 30d면 30일 지난 거래가 숨겨져 "헤더 65인데 표는 비어 보임" 불일치가 생김.)
  const [period, setPeriod] = useState<PeriodFilter>("all");
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
      timeout: base.filter((t) => t.exit_reason === "timeout").length,
    };
  }, [rows, symbolQuery, period]);

  return (
    <div className="space-y-3">
      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-card shadow-card p-3">
        {/* 코인 검색 */}
        <div className="relative flex min-w-[160px] flex-1 items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={symbolQuery}
            onChange={(e) => changeSymbol(e.target.value)}
            placeholder={t("journal.table.searchPlaceholder")}
            className="h-8 pl-7 text-xs"
          />
        </div>

        {/* 사유 */}
        <div className="flex items-center gap-1 rounded-md border border-border bg-background/40 p-0.5">
          {(["all", "target", "stop", "manual", "timeout"] as ReasonFilter[]).map((r) => (
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
              {r === "all" && t("journal.table.reason.all", { n: counts.all })}
              {r === "target" && (
                <span className={reason === r ? "" : "text-grade-a"}>
                  {t("journal.table.reason.target", { n: counts.target })}
                </span>
              )}
              {r === "stop" && (
                <span className={reason === r ? "" : "text-grade-d"}>
                  {t("journal.table.reason.stop", { n: counts.stop })}
                </span>
              )}
              {r === "manual" && t("journal.table.reason.manual", { n: counts.manual })}
              {r === "timeout" && t("journal.table.reason.timeout", { n: counts.timeout })}
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
        <div className="rounded-lg border border-border/60 bg-card shadow-card p-10 text-center text-sm text-muted-foreground">
          {t("journal.table.empty")}
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-border bg-popover">
            <table className="w-full min-w-[1280px] text-xs">
              <thead className="bg-card text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left">{t("journal.table.col.time")}</th>
                  <th className="px-2 py-1.5 text-left">{t("journal.table.col.coin")}</th>
                  <th className="px-2 py-1.5 text-left">{t("journal.table.col.direction")}</th>
                  <th className="px-2 py-1.5 text-left">{t("journal.table.col.order")}</th>
                  <th className="px-2 py-1.5 text-left">{t("journal.table.col.tf")}</th>
                  <th className="px-2 py-1.5 text-right">{t("journal.table.col.leverage")}</th>
                  <th className="px-2 py-1.5 text-left">{t("journal.table.col.grade")}</th>
                  <th className="px-2 py-1.5 text-right">{t("journal.table.col.entryFill")}</th>
                  <th className="px-2 py-1.5 text-right">{t("journal.table.col.stopExit")}</th>
                  <th className="px-2 py-1.5 text-right">{t("journal.table.col.quantity")}</th>
                  <th className="px-2 py-1.5 text-right">{t("journal.table.col.rr")}</th>
                  <th className="px-2 py-1.5 text-right">{t("journal.table.col.realizedR")}</th>
                  <th className="px-2 py-1.5 text-right">{t("journal.table.col.pnl")}</th>
                  <th className="px-2 py-1.5 text-right">{t("journal.table.col.roi")}</th>
                  <th className="px-2 py-1.5 text-left">{t("journal.table.col.reason")}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const entryTime = new Date(row.created_at);
                  const exitTime = row.closed_at ? new Date(row.closed_at) : null;
                  const fmtPx = (n: number | null) =>
                    n == null
                      ? "—"
                      : n >= 1000
                        ? n.toLocaleString("en-US", { maximumFractionDigits: 0 })
                        : n.toFixed(4);
                  const exitActualNum = row.exit_actual ?? row.exit_price;
                  const feesPctNum =
                    row.fees_pct != null ? Number(row.fees_pct) : null;
                  return (
                    <tr key={row.id} className="border-t border-border hover:bg-accent/40">
                      <td className="px-2 py-1.5">
                        <Link
                          href={`/app/journal/${row.id}`}
                          title={feesPctNum != null ? t("journal.table.feesTooltip", { pct: feesPctNum.toFixed(2) }) : undefined}
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
                      <td className="px-2 py-1.5 font-mono">
                        <div className="flex items-center gap-1">
                          <span>{row.symbol}</span>
                          {row.mode === "backtest" ? (
                            <span
                              className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-semibold text-amber-300"
                              title={t("journal.table.backtestTooltip")}
                            >
                              ⏮ BT
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">{row.direction === "long" ? t("common.long") : t("common.short")}</td>
                      <td className="px-2 py-1.5">
                        {row.order_type === "limit" ? (
                          <span className="rounded bg-sky-500/10 px-1 py-0.5 text-[10px] text-sky-400">
                            {t("journal.table.orderType.limit")}
                          </span>
                        ) : row.order_type === "stop" ? (
                          <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-400">
                            {t("journal.table.orderType.stop")}
                          </span>
                        ) : (
                          <span className="rounded bg-muted/40 px-1 py-0.5 text-[10px] text-muted-foreground">
                            {t("journal.table.orderType.market")}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">{row.timeframe}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {row.leverage != null ? (
                          <span
                            className={
                              row.leverage >= 20
                                ? "text-grade-d"
                                : row.leverage >= 10
                                  ? "text-amber-400"
                                  : "text-foreground"
                            }
                          >
                            {row.leverage}x
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <GradeBadge grade={row.pre_grade as Grade} size="sm" />
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        <div>{fmtPx(row.entry)}</div>
                        <div
                          className="text-[10px] text-muted-foreground"
                          title={t("journal.table.entryActualTooltip")}
                        >
                          ↳ {fmtPx(row.entry_actual)}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        <div>{fmtPx(row.stop)}</div>
                        <div
                          className="text-[10px] text-muted-foreground"
                          title={t("journal.table.exitActualTooltip")}
                        >
                          ↳ {fmtPx(exitActualNum)}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {row.position_quantity != null
                          ? Number(row.position_quantity).toFixed(4)
                          : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {Number(row.pre_rr ?? 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {row.result_r != null ? (
                          <span
                            className={
                              Number(row.result_r) >= 0
                                ? "text-grade-a"
                                : "text-grade-d"
                            }
                          >
                            {Number(row.result_r) >= 0 ? "+" : ""}
                            {Number(row.result_r).toFixed(2)}R
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {row.pnl != null ? (
                          <span
                            className={row.pnl >= 0 ? "text-grade-a" : "text-grade-d"}
                          >
                            {row.pnl >= 0 ? "+" : ""}
                            {formatNumber(row.pnl, { maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {row.roiPct != null ? (
                          <span
                            className={
                              row.roiPct >= 0 ? "text-grade-a" : "text-grade-d"
                            }
                          >
                            {row.roiPct >= 0 ? "+" : ""}
                            {row.roiPct.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {row.exit_reason === "target" ? (
                          <span className="text-grade-a">{t("journal.table.exitReason.target")}</span>
                        ) : row.exit_reason === "stop" ? (
                          <span className="text-grade-d">{t("journal.table.exitReason.stop")}</span>
                        ) : row.exit_reason === "manual" ? (
                          <span className="text-muted-foreground">{t("journal.table.exitReason.manual")}</span>
                        ) : row.exit_reason === "timeout" ? (
                          <span className={row.pnl != null && row.pnl < 0 ? "text-grade-d/80" : "text-amber-500"}>
                            {t("journal.table.exitReason.timeout")}
                          </span>
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
                {t("journal.table.pagination", {
                  from: (safePage - 1) * PAGE_SIZE + 1,
                  to: Math.min(safePage * PAGE_SIZE, filtered.length),
                  total: filtered.length,
                })}
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
