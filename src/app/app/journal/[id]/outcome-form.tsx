"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/context";
import { updateOutcomeAction } from "@/app/app/_actions";

type Initial = {
  exit_price: number | null;
  result_r: number | null;
  exit_reason: string | null;
  note: string | null;
};

export function OutcomeForm({
  id,
  initial,
  closed,
}: {
  id: string;
  initial: Initial;
  closed: boolean;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [exitPrice, setExitPrice] = useState(initial.exit_price?.toString() ?? "");
  const [resultR, setResultR] = useState(initial.result_r?.toString() ?? "");
  const [exitReason, setExitReason] = useState((initial.exit_reason as "target" | "stop" | "manual") || "manual");
  const [note, setNote] = useState(initial.note ?? "");

  function submit() {
    startTransition(async () => {
      const r = await updateOutcomeAction({
        id,
        exitPrice: Number(exitPrice),
        resultR: Number(resultR),
        exitReason,
        mistakeTags: [],
        note,
      });
      if (r.error) toast.error(r.error);
      else toast.success(t("journal.cmp.outcomeSaved"));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{closed ? t("journal.cmp.outcomeTitle") : t("journal.cmp.outcomeTitleInput")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("journal.cmp.exitPrice")}</Label>
            <Input type="number" step="any" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("journal.cmp.resultR")}</Label>
            <Input
              type="number"
              step="0.01"
              value={resultR}
              onChange={(e) => setResultR(e.target.value)}
              placeholder={t("journal.cmp.resultRPlaceholder")}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("journal.cmp.exitReason")}</Label>
          <Select value={exitReason} onChange={(e) => setExitReason(e.target.value as "target" | "stop" | "manual")}>
            <option value="target">{t("journal.cmp.exitReasonTarget")}</option>
            <option value="stop">{t("journal.cmp.exitReasonStop")}</option>
            <option value="manual">{t("journal.cmp.exitReasonManual")}</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("journal.cmp.note")}</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t("journal.cmp.notePlaceholder")} />
        </div>
        <Button onClick={submit} disabled={pending}>
          {pending ? t("journal.cmp.saving") : t("journal.cmp.saveOutcome")}
        </Button>
      </CardContent>
    </Card>
  );
}
