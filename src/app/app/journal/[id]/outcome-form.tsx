"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { MISTAKE_TAGS, MISTAKE_TAG_LABELS, type MistakeTag } from "@/types/trade";
import { updateOutcomeAction } from "@/app/app/_actions";

type Initial = {
  exit_price: number | null;
  result_r: number | null;
  exit_reason: string | null;
  mistake_tags: string[] | null;
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
  const [pending, startTransition] = useTransition();
  const [exitPrice, setExitPrice] = useState(initial.exit_price?.toString() ?? "");
  const [resultR, setResultR] = useState(initial.result_r?.toString() ?? "");
  const [exitReason, setExitReason] = useState((initial.exit_reason as "target" | "stop" | "manual") || "manual");
  const [tags, setTags] = useState<Set<string>>(new Set(initial.mistake_tags ?? []));
  const [note, setNote] = useState(initial.note ?? "");

  function submit() {
    startTransition(async () => {
      const r = await updateOutcomeAction({
        id,
        exitPrice: Number(exitPrice),
        resultR: Number(resultR),
        exitReason,
        mistakeTags: Array.from(tags),
        note,
      });
      if (r.error) toast.error(r.error);
      else toast.success("결과를 저장했습니다.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{closed ? "거래 결과" : "거래 결과 입력"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>실제 청산가</Label>
            <Input type="number" step="any" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>실현 R</Label>
            <Input
              type="number"
              step="0.01"
              value={resultR}
              onChange={(e) => setResultR(e.target.value)}
              placeholder="예: 1.8 또는 -1.0"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>청산 사유</Label>
          <Select value={exitReason} onChange={(e) => setExitReason(e.target.value as "target" | "stop" | "manual")}>
            <option value="target">목표 도달</option>
            <option value="stop">손절</option>
            <option value="manual">임의 청산</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>실수 태그 (해당하는 것 선택)</Label>
          <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-3">
            {MISTAKE_TAGS.map((t) => (
              <Checkbox
                key={t}
                checked={tags.has(t)}
                onChange={(e) => {
                  const next = new Set(tags);
                  if (e.target.checked) next.add(t);
                  else next.delete(t);
                  setTags(next);
                }}
                label={MISTAKE_TAG_LABELS[t as MistakeTag]}
              />
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>메모</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
        </div>
        <Button onClick={submit} disabled={pending}>
          {pending ? "저장 중..." : "결과 저장"}
        </Button>
      </CardContent>
    </Card>
  );
}
