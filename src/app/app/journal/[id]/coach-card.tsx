"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";
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
  const t = useT();
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
      toast.success(t("journal.cmp.coachReceived"));
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          {t("journal.cmp.coachTitle")}
        </CardTitle>
        {closed ? (
          <Button size="sm" variant="outline" onClick={run} disabled={pending}>
            {pending ? t("journal.cmp.generating") : current ? t("journal.cmp.regenerate") : t("journal.cmp.getCoach")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {!closed ? (
          <p className="text-sm text-muted-foreground">
            {t("journal.cmp.coachNeedsOutcome")}
          </p>
        ) : current ? (
          <div className="space-y-2 text-sm leading-relaxed whitespace-pre-line">{current}
            <div className="pt-2 text-xs text-muted-foreground">
              {ts ? new Date(ts).toLocaleString("ko-KR") : ""}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("journal.cmp.coachEmpty")}</p>
        )}
      </CardContent>
    </Card>
  );
}
