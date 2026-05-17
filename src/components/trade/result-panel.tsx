"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { GradeBadge } from "./grade-badge";
import type { GradeResult, SizingResult } from "@/types/trade";

export function ResultPanel({
  grade,
  sizing,
  currency,
  accountSize,
  riskPct,
  leverage,
}: {
  grade: GradeResult;
  sizing: SizingResult;
  currency: "USD" | "KRW";
  accountSize: number;
  riskPct: number;
  leverage: number;
}) {
  const [open, setOpen] = useState(false);

  const lev = Math.max(1, leverage);
  const requiredMargin = sizing.valid ? sizing.positionSize / lev : 0;
  const marginPctOfAccount =
    accountSize > 0 ? (requiredMargin / accountSize) * 100 : 0;
  const positionPctOfAccount =
    accountSize > 0 ? (sizing.positionSize / accountSize) * 100 : 0;
  const marginExceedsAccount = requiredMargin > accountSize;

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

        {/* Risk-based sizing block */}
        {sizing.valid ? (
          <div className="space-y-3 rounded-md border border-border bg-background/30 p-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Cell
                label="잃을 한도"
                value={`${riskPct.toFixed(2)}%`}
                sub={`${formatCurrency(sizing.maxLoss, currency)} (계좌의)`}
                tone="bad"
              />
              <Cell
                label="노출 금액"
                value={`${positionPctOfAccount.toFixed(1)}%`}
                sub={`${formatCurrency(sizing.positionSize, currency)} (계좌의)`}
              />
              <Cell label="매수 수량" value={formatNumber(sizing.quantity)} />
              <Cell
                label={`필요 마진 (${lev}x)`}
                value={`${marginPctOfAccount.toFixed(2)}%`}
                sub={`${formatCurrency(requiredMargin, currency)} (계좌의)`}
                tone={marginExceedsAccount ? "bad" : undefined}
              />
            </div>
            {marginExceedsAccount ? (
              <div className="flex items-start gap-2 rounded-md border border-grade-d/40 bg-grade-d/10 p-2 text-xs text-grade-d">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                <span>
                  필요 마진({formatCurrency(requiredMargin, currency)})이 계좌 크기를 초과합니다.
                  레버리지를 높이거나 진입가/손절가를 다시 검토하세요.
                </span>
              </div>
            ) : null}
            <div className="text-[10px] leading-relaxed text-muted-foreground">
              <strong>노출 금액</strong>(진입가 × 수량) = 이 거래가 시장에 노출되는 총 금액. 레버리지와 무관하게 BTC 1% 변동 시 노출의 1%가 손익. 레버리지는 묶이는 마진만 줄여줍니다.
            </div>
          </div>
        ) : null}

        {!sizing.valid && sizing.reason ? (
          <div className="rounded-md border border-grade-d/40 bg-grade-d/10 p-3 text-sm text-grade-d">
            {sizing.reason}
          </div>
        ) : null}

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

function Cell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 font-mono text-sm font-semibold",
          tone === "good" && "text-grade-a",
          tone === "bad" && "text-grade-d",
        )}
      >
        {value}
      </div>
      {sub ? <div className="text-[10px] text-muted-foreground/80">{sub}</div> : null}
    </div>
  );
}
