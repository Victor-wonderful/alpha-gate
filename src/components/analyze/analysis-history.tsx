import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STRATEGY_LABELS, type StrategyId } from "@/lib/analysis/strategy";
import { DeleteAnalysisButton } from "@/app/app/analyze/history/delete-analysis-button";
import { getT } from "@/lib/i18n/server";

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
  mode: "live" | "backtest" | null;
  historical_at: string | null;
}

const STYLE_LABEL_SHORT_KEY: Record<string, string> = {
  scalp: "analyze.cmpA.styleScalp",
  day: "analyze.cmpA.styleDay",
  swing: "analyze.cmpA.styleSwing",
  position: "analyze.cmpA.stylePosition",
};

export async function AnalysisHistory({ limit = 10 }: { limit?: number }) {
  const t = await getT();
  const supabase = await getSupabaseServer();
  const { data: analyses } = await supabase
    .from("analyses")
    .select(
      "id, symbol, style, primary_strategy, strategy_direction, strategy_confidence, scenarios_count, current_price, created_at, mode, historical_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  const analysisRows = (analyses ?? []) as AnalysisRow[];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          {t("analyze.cmpA.historyTitle")}
        </CardTitle>
        <Link
          href="/app/analyze/history"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("analyze.cmpA.allHistory")} <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {analysisRows.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted-foreground">
            {t("analyze.cmpA.historyEmpty")}
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {analysisRows.map((a) => {
              const isWait = a.primary_strategy === "wait";
              const isBacktest = a.mode === "backtest";
              const dirLabel =
                a.strategy_direction === "long"
                  ? t("common.long")
                  : a.strategy_direction === "short"
                    ? t("common.short")
                    : null;
              return (
                <li
                  key={a.id}
                  className="group relative flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 text-sm transition-colors hover:bg-muted/30"
                >
                  <Link
                    href={`/app/analyze?load=${a.id}`}
                    className="absolute inset-0 z-0"
                    aria-label={t("analyze.cmpA.loadAnalysisAria", { symbol: a.symbol })}
                  />
                  <span className="relative font-mono font-medium">{a.symbol}</span>
                  <span className="relative text-xs text-muted-foreground">
                    {STYLE_LABEL_SHORT_KEY[a.style] ? t(STYLE_LABEL_SHORT_KEY[a.style]) : a.style}
                  </span>
                  {isBacktest ? (
                    <Badge
                      className="relative border border-amber-500/40 bg-amber-500/10 text-amber-300"
                      title={
                        a.historical_at
                          ? t("analyze.cmpA.backtestAt", {
                              time: new Date(a.historical_at).toLocaleString("ko-KR", {
                                timeZone: "Asia/Seoul",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }),
                            })
                          : t("analyze.cmpA.backtest")
                      }
                    >
                      ⏮ BT
                    </Badge>
                  ) : null}
                  <Badge
                    className={cn(
                      "relative border",
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
                  <span className="relative text-xs text-muted-foreground">
                    {t("analyze.cmpA.scenarioCount", { n: a.scenarios_count })}
                  </span>
                  <span className="relative text-xs text-muted-foreground">
                    {t("analyze.cmpA.confidence", { pct: Math.round(a.strategy_confidence * 100) })}
                  </span>
                  <span className="relative ml-auto text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("ko-KR", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </span>
                  {/* 삭제 버튼 — Link 위에 z-10으로 띄워서 클릭 분리 */}
                  <div className="relative z-10 opacity-0 transition-opacity group-hover:opacity-100">
                    <DeleteAnalysisButton id={a.id} label={a.symbol} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
