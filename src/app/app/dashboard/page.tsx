import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradeBadge } from "@/components/trade/grade-badge";
import { MonthlyChart } from "./monthly-chart";
import { MISTAKE_TAG_LABELS, type Grade, type MistakeTag } from "@/types/trade";
import { cn } from "@/lib/utils";
import { STRATEGY_LABELS, type StrategyId } from "@/lib/analysis/strategy";

interface Closed {
  pre_grade: Grade;
  result_r: number;
  mistake_tags: string[] | null;
  closed_at: string;
}

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

export default async function DashboardPage() {
  const supabase = await getSupabaseServer();
  const [{ data }, { data: analyses }] = await Promise.all([
    supabase
      .from("trades")
      .select("pre_grade, result_r, mistake_tags, closed_at")
      .not("closed_at", "is", null),
    supabase
      .from("analyses")
      .select(
        "id, symbol, style, primary_strategy, strategy_direction, strategy_confidence, scenarios_count, current_price, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const analysisRows = (analyses ?? []) as AnalysisRow[];

  const rows = ((data ?? []) as unknown as Closed[]).filter((r) => r.result_r != null);

  const byGrade = new Map<Grade, { n: number; sumR: number; wins: number }>();
  for (const g of ["A", "B", "C", "D"] as Grade[]) byGrade.set(g, { n: 0, sumR: 0, wins: 0 });
  const mistakeAgg = new Map<string, { n: number; sumR: number }>();
  const monthly = new Map<string, number>();

  for (const r of rows) {
    const g = byGrade.get(r.pre_grade)!;
    g.n += 1;
    g.sumR += Number(r.result_r);
    if (Number(r.result_r) > 0) g.wins += 1;
    for (const t of r.mistake_tags ?? []) {
      const cur = mistakeAgg.get(t) ?? { n: 0, sumR: 0 };
      cur.n += 1;
      cur.sumR += Number(r.result_r);
      mistakeAgg.set(t, cur);
    }
    const m = r.closed_at.slice(0, 7);
    monthly.set(m, (monthly.get(m) ?? 0) + Number(r.result_r));
  }

  const monthlyData = Array.from(monthly.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value }));

  const mistakeRanked = Array.from(mistakeAgg.entries())
    .map(([tag, v]) => ({
      tag,
      label: MISTAKE_TAG_LABELS[tag as MistakeTag] ?? tag,
      n: v.n,
      avg: v.sumR / v.n,
      total: v.sumR,
    }))
    .sort((a, b) => a.total - b.total);

  const worst = mistakeRanked[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">복기 대시보드</h1>
        <p className="text-sm text-muted-foreground">결과가 입력된 거래만 집계합니다.</p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            아직 결과가 입력된 거래가 없습니다.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(["A", "B", "C", "D"] as Grade[]).map((g) => {
              const s = byGrade.get(g)!;
              return (
                <Card key={g}>
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center justify-between">
                      <GradeBadge grade={g} size="sm" />
                      <span className="text-xs text-muted-foreground">{s.n}건</span>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">평균 R</div>
                      <div
                        className={cn(
                          "font-mono text-2xl",
                          s.n === 0
                            ? "text-muted-foreground"
                            : s.sumR / s.n >= 0
                              ? "text-grade-a"
                              : "text-grade-d",
                        )}
                      >
                        {s.n === 0 ? "—" : (s.sumR / s.n).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      승률 {s.n === 0 ? "—" : `${((s.wins / s.n) * 100).toFixed(0)}%`}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>월별 누적 R</CardTitle>
              </CardHeader>
              <CardContent>
                <MonthlyChart data={monthlyData} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>실수 태그별 누적 R</CardTitle>
              </CardHeader>
              <CardContent>
                {mistakeRanked.length === 0 ? (
                  <p className="text-sm text-muted-foreground">실수 태그가 입력된 거래가 없습니다.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {mistakeRanked.map((m) => (
                      <li key={m.tag} className="flex items-center justify-between">
                        <span>
                          {m.label} <span className="text-xs text-muted-foreground">({m.n})</span>
                        </span>
                        <span
                          className={cn(
                            "font-mono",
                            m.total >= 0 ? "text-grade-a" : "text-grade-d",
                          )}
                        >
                          {m.total.toFixed(2)}R
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {worst && worst.total < 0 ? (
                  <div className="mt-4 rounded-md border border-grade-d/40 bg-grade-d/10 p-3 text-sm">
                    <div className="font-semibold text-grade-d">당신이 가장 자주 잃는 패턴</div>
                    <div className="mt-1">
                      <span className="font-semibold">{worst.label}</span> — 누적 {worst.total.toFixed(2)}R
                      ({worst.n}건, 평균 {worst.avg.toFixed(2)}R)
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI 분석 기록
          </CardTitle>
          <Link
            href="/app/analyze"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            새 분석 <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {analysisRows.length === 0 ? (
            <div className="px-5 pb-5 text-sm text-muted-foreground">
              아직 저장된 AI 분석이 없습니다.{" "}
              <Link href="/app/analyze" className="text-primary underline-offset-2 hover:underline">
                AI 분석
              </Link>
              에서 첫 분석을 실행해보세요.
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
                      <span className="text-xs text-muted-foreground">
                        시나리오 {a.scenarios_count}개
                      </span>
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
    </div>
  );
}
