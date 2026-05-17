"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { generateCoachAction } from "./_actions";

export function CoachCard({
  tradeId,
  comment,
  generatedAt,
  closed,
}: {
  tradeId: string;
  comment: string | null;
  generatedAt: string | null;
  closed: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(comment);
  const [ts, setTs] = useState(generatedAt);

  function run() {
    startTransition(async () => {
      const r = await generateCoachAction(tradeId);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setCurrent(r.comment ?? null);
      setTs(new Date().toISOString());
      toast.success("AI 복기를 받았습니다.");
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          AI 복기 코멘트
        </CardTitle>
        {closed ? (
          <Button size="sm" variant="outline" onClick={run} disabled={pending}>
            {pending ? "생성 중..." : current ? "다시 생성" : "복기 받기"}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {!closed ? (
          <p className="text-sm text-muted-foreground">
            결과를 먼저 입력하면 AI 복기를 받을 수 있습니다.
          </p>
        ) : current ? (
          <div className="space-y-2 text-sm leading-relaxed whitespace-pre-line">{current}
            <div className="pt-2 text-xs text-muted-foreground">
              {ts ? new Date(ts).toLocaleString("ko-KR") : ""}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">아직 복기 코멘트가 없습니다.</p>
        )}
      </CardContent>
    </Card>
  );
}
