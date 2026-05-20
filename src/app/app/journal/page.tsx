import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradeBadge } from "@/components/trade/grade-badge";
import type { Grade } from "@/types/trade";
import { FlowStepper } from "@/components/app/flow-stepper";
import { ResolveTradesButton } from "./resolve-button";

export const dynamic = "force-dynamic";

export default async function JournalListPage() {
  const supabase = await getSupabaseServer();
  const { data: trades } = await supabase
    .from("trades")
    .select("id, symbol, direction, timeframe, pre_grade, pre_rr, result_r, closed_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <FlowStepper current="journal" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">내 거래</h1>
          <p className="text-sm text-muted-foreground">
            최근 100건의 거래입니다. 매일 자정에 자동 정산되며, 지금 바로 시세를 확인하려면 우측 버튼을 누르세요.
          </p>
        </div>
        <ResolveTradesButton />
      </div>

      {!trades?.length ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            아직 저장한 거래가 없습니다. 주문 검토 화면에서 첫 거래를 저장해보세요.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">날짜</th>
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
              {trades.map((t) => (
                <tr key={t.id} className="border-t border-border hover:bg-accent/40">
                  <td className="px-4 py-2">
                    <Link href={`/app/journal/${t.id}`} className="text-foreground hover:underline">
                      {new Date(t.created_at).toLocaleDateString("ko-KR")}
                    </Link>
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
                      <span className={Number(t.result_r) >= 0 ? "text-grade-a" : "text-grade-d"}>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
