import Link from "next/link";
import { Clock, Radio } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GradeBadge } from "@/components/trade/grade-badge";
import { MonthlyChart } from "./monthly-chart";
import { MISTAKE_TAG_LABELS, type Grade, type MistakeTag } from "@/types/trade";
import { cn } from "@/lib/utils";
import { FlowStepper } from "@/components/app/flow-stepper";

type ModeFilter = "all" | "live" | "backtest";

interface Closed {
  pre_grade: Grade;
  result_r: number;
  mistake_tags: string[] | null;
  closed_at: string;
  mode: "live" | "backtest" | null;
}

export default async function DashboardPage(props: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const searchParams = await props.searchParams;
  const modeParam = searchParams.mode;
  const modeFilter: ModeFilter =
    modeParam === "live" || modeParam === "backtest" ? modeParam : "all";

  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("trades")
    .select("pre_grade, result_r, mistake_tags, closed_at, mode")
    .not("closed_at", "is", null);

  const allClosed = ((data ?? []) as unknown as Closed[]).filter((r) => r.result_r != null);

  // 모드별 카운트 (탭 표시용)
  const counts = {
    all: allClosed.length,
    live: allClosed.filter((r) => (r.mode ?? "live") === "live").length,
    backtest: allClosed.filter((r) => r.mode === "backtest").length,
  };

  // 필터 적용
  const rows =
    modeFilter === "all"
      ? allClosed
      : modeFilter === "live"
        ? allClosed.filter((r) => (r.mode ?? "live") === "live")
        : allClosed.filter((r) => r.mode === "backtest");

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
        <p className="text-sm text-muted-foreground">
          결과가 입력된 거래만 집계합니다.
          {modeFilter === "backtest" && (
            <span className="ml-2 text-primary">백테스트 결과는 별도로 집계됩니다 — 실거래와 섞이지 않습니다.</span>
          )}
        </p>
      </div>

      {/* 모드 필터 탭 */}
      <div className="flex flex-wrap gap-1.5">
        <ModeTab
          href="/app/dashboard"
          label="전체"
          count={counts.all}
          active={modeFilter === "all"}
        />
        <ModeTab
          href="/app/dashboard?mode=live"
          label="실거래"
          count={counts.live}
          active={modeFilter === "live"}
          icon={<Radio className="h-3 w-3 text-grade-a" />}
        />
        <ModeTab
          href="/app/dashboard?mode=backtest"
          label="백테스트"
          count={counts.backtest}
          active={modeFilter === "backtest"}
          icon={<Clock className="h-3 w-3 text-primary" />}
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {modeFilter === "all"
              ? "아직 결과가 입력된 거래가 없습니다."
              : modeFilter === "live"
                ? "실거래 결과가 아직 없습니다."
                : "백테스트 결과가 아직 없습니다. AI 분석에서 백테스트 모드로 시뮬레이션해보세요."}
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
                    <div className="font-semibold text-grade-d">
                      {modeFilter === "backtest" ? "백테스트에서 가장 자주 잃는 패턴" : "당신이 가장 자주 잃는 패턴"}
                    </div>
                    <div className="mt-1">
                      <span className="font-semibold">{worst.label}</span> — 누적 {worst.total.toFixed(2)}R
                      ({worst.n}건, 평균 {worst.avg.toFixed(2)}R)
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          {/* 라이브 vs 백테스트 비교 안내 (전체 모드일 때만) */}
          {modeFilter === "all" && counts.backtest > 0 && counts.live > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  💡 라이브와 백테스트를 분리해서 보기
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  현재는 모든 거래가 섞여 있습니다. 라이브 실거래와 백테스트 시뮬레이션의 평균 R이 다를 수 있습니다 — 같은 등급인데 라이브에서 더 잃는다면, 분석 문제가 아니라 <strong>실행 문제</strong>일 가능성이 큽니다.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href="/app/dashboard?mode=live"
                    className="rounded-md border border-grade-a/30 bg-grade-a/5 px-3 py-1.5 text-xs font-medium text-grade-a transition-colors hover:bg-grade-a/10"
                  >
                    실거래만 보기 →
                  </Link>
                  <Link
                    href="/app/dashboard?mode=backtest"
                    className="rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    백테스트만 보기 →
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ModeTab({
  href,
  label,
  count,
  active,
  icon,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-background/40 text-muted-foreground hover:bg-accent/40 hover:text-foreground",
      )}
    >
      {icon}
      {label}
      <span className="font-mono text-[10px] text-muted-foreground/80">{count}</span>
    </Link>
  );
}
