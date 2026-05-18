import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STRATEGY_LABELS, type StrategyId } from "@/lib/analysis/strategy";

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

export async function AnalysisHistory({ limit = 10 }: { limit?: number }) {
  const supabase = await getSupabaseServer();
  const { data: analyses } = await supabase
    .from("analyses")
    .select(
      "id, symbol, style, primary_strategy, strategy_direction, strategy_confidence, scenarios_count, current_price, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  const analysisRows = (analyses ?? []) as AnalysisRow[];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          최근 분석 기록
        </CardTitle>
        <Link
          href="/app/analyze/history"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          전체 기록 <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {analysisRows.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted-foreground">
            아직 저장된 AI 분석이 없습니다. 위에서 첫 분석을 실행하면 여기에 자동 기록됩니다.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {analysisRows.map((a) => {
              const isWait = a.primary_strategy === "wait";
              const dirLabel =
                a.strategy_direction === "long" ? "롱" : a.strategy_direction === "short" ? "숏" : null;
              return (
                <li key={a.id}>
                  <Link
                    href={`/app/analyze?load=${a.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 text-sm transition-colors hover:bg-muted/30"
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
                    <span className="text-xs text-muted-foreground">시나리오 {a.scenarios_count}개</span>
                    <span className="text-xs text-muted-foreground">
                      자신감 {Math.round(a.strategy_confidence * 100)}%
                    </span>
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
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
