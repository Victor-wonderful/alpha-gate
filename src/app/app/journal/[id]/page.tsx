import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GradeBadge } from "@/components/trade/grade-badge";
import { OutcomeForm } from "./outcome-form";
import { CoachCard } from "./coach-card";
import type { Grade } from "@/types/trade";

export default async function JournalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data: trade } = await supabase.from("trades").select("*").eq("id", id).maybeSingle();
  if (!trade) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {trade.symbol} · {trade.direction === "long" ? "롱" : "숏"} · {trade.timeframe}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(trade.created_at).toLocaleString("ko-KR")}
          </p>
        </div>
        <GradeBadge grade={trade.pre_grade as Grade} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>진입 시 평가</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="진입가" value={String(trade.entry)} />
            <Row label="손절가" value={String(trade.stop)} />
            <Row label="목표가" value={String(trade.target)} />
            <Row label="진입 R:R" value={`${Number(trade.pre_rr).toFixed(2)}R`} />
            <Row label="점수" value={`${trade.pre_score}점`} />
            <Row label="권장 수량" value={String(trade.position_quantity)} />
            <div className="border-t border-border pt-3">
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                점수 내역
              </div>
              <ul className="space-y-1">
                {(trade.pre_score_breakdown as Array<{ label: string; points: number }>).map((r, i) => (
                  <li key={i} className="flex justify-between">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className={r.points > 0 ? "text-grade-a" : r.points < 0 ? "text-grade-d" : ""}>
                      {r.points > 0 ? `+${r.points}` : r.points}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <OutcomeForm
          id={trade.id}
          initial={{
            exit_price: trade.exit_price,
            result_r: trade.result_r,
            exit_reason: trade.exit_reason,
            mistake_tags: trade.mistake_tags,
            note: trade.note,
          }}
          closed={Boolean(trade.closed_at)}
        />
      </div>

      <CoachCard
        tradeId={trade.id}
        comment={trade.ai_coach_comment}
        generatedAt={trade.ai_coach_generated_at}
        closed={Boolean(trade.closed_at)}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
