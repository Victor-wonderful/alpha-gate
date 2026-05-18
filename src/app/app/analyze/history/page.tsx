import Link from "next/link";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STRATEGY_LABELS, type StrategyId } from "@/lib/analysis/strategy";
import { FlowStepper } from "@/components/app/flow-stepper";
import { DeleteAnalysisButton } from "./delete-analysis-button";

interface AnalysisRow {
  id: string;
  symbol: string;
  style: string;
  primary_strategy: StrategyId;
  strategy_direction: "long" | "short" | null;
  strategy_confidence: number;
  scenarios_count: number;
  current_price: number | null;
  created_at: string;
}

const STYLE_LABEL_SHORT: Record<string, string> = {
  scalp: "스캘핑",
  day: "데이",
  swing: "스윙",
  position: "포지션",
};

const PAGE_SIZE = 50;

export default async function AnalysisHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    symbol?: string;
    style?: string;
    strategy?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const filterSymbol = (sp.symbol || "").toUpperCase().trim();
  const filterStyle = sp.style || "";
  const filterStrategy = sp.strategy || "";
  const page = Math.max(1, Number(sp.page) || 1);

  const supabase = await getSupabaseServer();
  let query = supabase
    .from("analyses")
    .select(
      "id, symbol, style, primary_strategy, strategy_direction, strategy_confidence, scenarios_count, current_price, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (filterSymbol) query = query.eq("symbol", filterSymbol);
  if (filterStyle) query = query.eq("style", filterStyle);
  if (filterStrategy) query = query.eq("primary_strategy", filterStrategy);

  const { data, count } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = (data ?? []) as AnalysisRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildQS(overrides: Record<string, string | number | undefined>) {
    const params = new URLSearchParams();
    const obj: Record<string, string | number | undefined> = {
      symbol: filterSymbol || undefined,
      style: filterStyle || undefined,
      strategy: filterStrategy || undefined,
      page,
      ...overrides,
    };
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined && v !== "" && v !== 1) params.set(k, String(v));
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  return (
    <div className="space-y-6">
      <FlowStepper current="analyze" />

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1">
            <Link
              href="/app/analyze"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              AI 분석으로
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">AI 분석 기록</h1>
          <p className="text-sm text-muted-foreground">
            지금까지 실행한 분석 전체. 클릭하면 분석 페이지에서 결과를 복원합니다.
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          총 {total}건
        </div>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-3">
          <form className="flex flex-wrap items-center gap-2 text-xs" action="/app/analyze/history">
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">코인</span>
              <input
                name="symbol"
                defaultValue={filterSymbol}
                placeholder="BTCUSDT"
                className="h-8 w-28 rounded-md border border-border bg-background px-2 font-mono uppercase placeholder:text-muted-foreground/60"
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">스타일</span>
              <select
                name="style"
                defaultValue={filterStyle}
                className="h-8 rounded-md border border-border bg-background px-2"
              >
                <option value="">전체</option>
                <option value="scalp">스캘핑</option>
                <option value="day">데이</option>
                <option value="swing">스윙</option>
                <option value="position">포지션</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">전략</span>
              <select
                name="strategy"
                defaultValue={filterStrategy}
                className="h-8 rounded-md border border-border bg-background px-2"
              >
                <option value="">전체</option>
                <option value="trend_pullback">추세 눌림</option>
                <option value="breakout">돌파</option>
                <option value="range_fade">박스 반전</option>
                <option value="reversal">반전</option>
                <option value="wait">대기</option>
              </select>
            </label>
            <button
              type="submit"
              className="h-8 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              필터 적용
            </button>
            {(filterSymbol || filterStyle || filterStrategy) ? (
              <Link
                href="/app/analyze/history"
                className="h-8 inline-flex items-center rounded-md border border-border px-3 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              >
                초기화
              </Link>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              조건에 맞는 분석이 없습니다.{" "}
              <Link href="/app/analyze" className="text-primary underline-offset-2 hover:underline">
                새 분석 실행
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {rows.map((a) => {
                const isWait = a.primary_strategy === "wait";
                const dirLabel =
                  a.strategy_direction === "long" ? "롱" : a.strategy_direction === "short" ? "숏" : null;
                return (
                  <li key={a.id} className="group">
                    <div className="flex items-center gap-2 px-5 py-3 transition-colors hover:bg-muted/30">
                      <Link
                        href={`/app/analyze?load=${a.id}`}
                        className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1.5 text-sm"
                      >
                        <span className="font-mono font-medium">{a.symbol}</span>
                        <span className="text-xs text-muted-foreground">
                          {STYLE_LABEL_SHORT[a.style] ?? a.style}
                        </span>
                        <Badge
                          className={cn(
                            "border",
                            isWait
                              ? "border-grade-c/40 bg-grade-c/10 text-grade-c"
                              : a.strategy_direction === "short"
                                ? "border-grade-d/40 bg-grade-d/10 text-grade-d"
                                : "border-primary/40 bg-primary/10 text-primary",
                          )}
                        >
                          {STRATEGY_LABELS[a.primary_strategy]}
                          {dirLabel ? ` · ${dirLabel}` : ""}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          시나리오 {a.scenarios_count}개
                        </span>
                        <span className="text-xs text-muted-foreground">
                          자신감 {Math.round(a.strategy_confidence * 100)}%
                        </span>
                        {a.current_price ? (
                          <span className="text-xs text-muted-foreground">
                            ${a.current_price.toLocaleString()}
                          </span>
                        ) : null}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleString("ko-KR", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </span>
                      </Link>
                      <DeleteAnalysisButton id={a.id} label={a.symbol} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>
            페이지 {page} / {totalPages}
          </div>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`/app/analyze/history${buildQS({ page: page - 1 })}`}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 hover:bg-muted/40 hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" /> 이전
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={`/app/analyze/history${buildQS({ page: page + 1 })}`}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 hover:bg-muted/40 hover:text-foreground"
              >
                다음 <ArrowRight className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* CTA */}
      <div className="flex justify-center">
        <Link
          href="/app/analyze"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Sparkles className="h-4 w-4" />
          새 분석 실행
        </Link>
      </div>
    </div>
  );
}
