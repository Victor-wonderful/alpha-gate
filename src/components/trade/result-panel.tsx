"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { GradeBadge } from "./grade-badge";
import type { GradeResult, SizingResult } from "@/types/trade";

export function ResultPanel({
  grade,
}: {
  grade: GradeResult;
  sizing?: SizingResult;
  currency?: "USD" | "KRW";
  accountSize?: number;
  riskPct?: number;
  leverage?: number;
  entry?: number;
  stop?: number;
  target?: number;
  direction?: "long" | "short";
  onApplyLeverage?: (lev: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>매매 평가</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <GradeBadge grade={grade.grade} />

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Metric label="손익비" value={grade.rr > 0 ? `${grade.rr.toFixed(2)} R` : "—"} />
          <Metric label="점수" value={`${grade.score}점`} />
        </div>

        <Separator />

        <div>
          <h4 className="mb-2 text-sm font-semibold">지금 해야 할 행동</h4>
          <ul className="space-y-1.5 text-sm">
            {grade.actions.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 flex-none rounded-full bg-primary" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          className="flex w-full items-center justify-between text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(!open)}
        >
          <span>점수 내역 보기</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {open ? (
          <ul className="space-y-1.5 text-sm">
            {grade.reasons.map((r, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="text-muted-foreground">{r.label}</span>
                <span
                  className={cn(
                    "font-mono",
                    r.points > 0 ? "text-grade-a" : r.points < 0 ? "text-grade-d" : "text-muted-foreground",
                  )}
                >
                  {r.points > 0 ? `+${r.points}` : r.points}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-base">{value}</div>
    </div>
  );
}

