import { getSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GradeBadge } from "@/components/trade/grade-badge";
import { MonthlyChart } from "./monthly-chart";
import { MISTAKE_TAG_LABELS, type Grade, type MistakeTag } from "@/types/trade";
import { cn } from "@/lib/utils";
import { FlowStepper } from "@/components/app/flow-stepper";

interface Closed {
  pre_grade: Grade;
  result_r: number;
  mistake_tags: string[] | null;
  closed_at: string;
}

export default async function DashboardPage() {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("trades")
    .select("pre_grade, result_r, mistake_tags, closed_at")
    .not("closed_at", "is", null);

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
      <FlowStepper current="dashboard" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">성과 분석</h1>
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
    </div>
  );
}
