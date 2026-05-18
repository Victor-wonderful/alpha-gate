import Link from "next/link";
import { Clock, Radio } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradeBadge } from "@/components/trade/grade-badge";
import type { Grade } from "@/types/trade";
import { FlowStepper } from "@/components/app/flow-stepper";
import { cn } from "@/lib/utils";

type ModeFilter = "all" | "live" | "backtest";

export default async function JournalListPage(props: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const searchParams = await props.searchParams;
  const modeParam = searchParams.mode;
  const modeFilter: ModeFilter =
    modeParam === "live" || modeParam === "backtest" ? modeParam : "all";

  const supabase = await getSupabaseServer();

  // 모든 거래의 mode별 카운트 (필터 탭에 표시)
  const { data: allModes } = await supabase.from("trades").select("mode");
  const counts = {
    all: allModes?.length ?? 0,
    live: allModes?.filter((t) => (t.mode ?? "live") === "live").length ?? 0,
    backtest: allModes?.filter((t) => t.mode === "backtest").length ?? 0,
  };

  let query = supabase
    .from("trades")
    .select(
      "id, symbol, direction, timeframe, pre_grade, pre_rr, result_r, closed_at, created_at, mode, simulated_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (modeFilter !== "all") {
    if (modeFilter === "live") {
      // live = mode='live' OR mode is null (기존 데이터 호환)
      query = query.or("mode.is.null,mode.eq.live");
    } else {
      query = query.eq("mode", modeFilter);
    }
  }

  const { data: trades } = await query;

  return (
    <div className="space-y-6">
      <FlowStepper current="journal" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">내 거래</h1>
        <p className="text-sm text-muted-foreground">
          {modeFilter === "all"
            ? "최근 100건의 모든 거래입니다."
            : modeFilter === "live"
              ? "실거래 100건입니다."
              : "백테스트 100건입니다."}
        </p>
      </div>

      {/* 모드 필터 탭 */}
      <div className="flex flex-wrap gap-1.5">
        <ModeTab href="/app/journal" label="전체" count={counts.all} active={modeFilter === "all"} />
        <ModeTab
          href="/app/journal?mode=live"
          label="실거래"
          count={counts.live}
          active={modeFilter === "live"}
          icon={<Radio className="h-3 w-3 text-grade-a" />}
        />
        <ModeTab
          href="/app/journal?mode=backtest"
          label="백테스트"
          count={counts.backtest}
          active={modeFilter === "backtest"}
          icon={<Clock className="h-3 w-3 text-primary" />}
        />
      </div>

      {!trades?.length ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {modeFilter === "all"
              ? "아직 저장한 거래가 없습니다. 주문 검토 화면에서 첫 거래를 저장해보세요."
              : modeFilter === "live"
                ? "실거래 기록이 없습니다."
                : "백테스트 기록이 없습니다. AI 분석에서 백테스트 모드로 시작해보세요."}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">날짜</th>
                <th className="px-4 py-2 text-left">모드</th>
                <th className="px-4 py-2 text-left">코인</th>
                <th className="px-4 py-2 text-left">방향</th>
                <th className="px-4 py-2 text-left">TF</th>
                <th className="px-4 py-2 text-left">등급</th>
                <th className="px-4 py-2 text-right">진입 R:R</th>
                <th className="px-4 py-2 text-right">실현 R</th>
                <th className="px-4 py-2 text-left">상태</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const isBacktest = t.mode === "backtest";
                const refDate = isBacktest && t.simulated_at ? t.simulated_at : t.created_at;
                return (
                  <tr key={t.id} className="border-t border-border hover:bg-accent/40">
                    <td className="px-4 py-2">
                      <Link
                        href={`/app/journal/${t.id}`}
                        className="text-foreground hover:underline"
                      >
                        {new Date(refDate).toLocaleDateString("ko-KR")}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      {isBacktest ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                          <Clock className="h-2.5 w-2.5" />
                          백테스트
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <Radio className="h-2.5 w-2.5 text-grade-a" />
                          실거래
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono">{t.symbol}</td>
                    <td className="px-4 py-2">{t.direction === "long" ? "롱" : "숏"}</td>
                    <td className="px-4 py-2">{t.timeframe}</td>
                    <td className="px-4 py-2">
                      <GradeBadge grade={t.pre_grade as Grade} size="sm" />
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{Number(t.pre_rr).toFixed(2)}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {t.result_r != null ? (
                        <span
                          className={Number(t.result_r) >= 0 ? "text-grade-a" : "text-grade-d"}
                        >
                          {Number(t.result_r).toFixed(2)}R
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {t.closed_at ? (
                        <Badge className="bg-muted">종료</Badge>
                      ) : (
                        <Badge className="border-grade-b/40 bg-grade-b/10 text-grade-b">진행</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
