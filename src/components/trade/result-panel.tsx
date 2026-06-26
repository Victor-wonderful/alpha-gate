"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
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
  onApplyLeverage,
}: {
  grade: GradeResult;
  sizing: SizingResult;
  currency: "USD" | "KRW";
  accountSize: number;
  riskPct: number;
  leverage: number;
  onApplyLeverage?: (lev: number) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const lev = Math.max(1, leverage);
  const requiredMargin = sizing.valid ? sizing.positionSize / lev : 0;
  const marginPctOfAccount =
    accountSize > 0 ? (requiredMargin / accountSize) * 100 : 0;
  const positionPctOfAccount =
    accountSize > 0 ? (sizing.positionSize / accountSize) * 100 : 0;
  const marginExceedsAccount = requiredMargin > accountSize;

  // 마진 초과 시 권장 레버리지 계산 — 노출/계좌의 ceil + 여유 20%, 일반 거래소 스텝(3,5,10,20,50)에 스냅
  const LEVERAGE_STEPS = [1, 3, 5, 10, 20, 50];
  const minLev = accountSize > 0 ? Math.ceil(sizing.positionSize / accountSize) : 0;
  const recommendedLev =
    LEVERAGE_STEPS.find((lv) => lv >= Math.ceil(minLev * 1.2)) ?? 50;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("trade.result.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <GradeBadge grade={grade.grade} />

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Metric label={t("trade.result.rr")} value={grade.rr > 0 ? `${grade.rr.toFixed(2)} R` : "—"} />
          <Metric label={t("trade.result.score")} value={t("trade.result.scorePts", { score: grade.score })} />
        </div>

        {/* Risk-based sizing block */}
        {sizing.valid ? (
          <div className="space-y-3 rounded-md border border-border bg-background/30 p-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Cell
                label={t("trade.result.maxLoss")}
                value={`${riskPct.toFixed(2)}%`}
                sub={`${formatCurrency(sizing.maxLoss, currency)} ${t("trade.result.ofAccount")}`}
                tone="bad"
              />
              <Cell
                label={t("trade.result.exposure")}
                value={`${positionPctOfAccount.toFixed(1)}%`}
                sub={`${formatCurrency(sizing.positionSize, currency)} ${t("trade.result.ofAccount")}`}
              />
              <Cell label={t("trade.result.quantity")} value={formatNumber(sizing.quantity)} />
              <Cell
                label={t("trade.result.requiredMargin", { lev })}
                value={`${marginPctOfAccount.toFixed(2)}%`}
                sub={`${formatCurrency(requiredMargin, currency)} ${t("trade.result.ofAccount")}`}
                tone={marginExceedsAccount ? "bad" : undefined}
              />
            </div>
            {marginExceedsAccount ? (
              <div className="space-y-2 rounded-md border border-grade-d/40 bg-grade-d/10 p-2.5 text-xs text-grade-d">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                  <span>
                    {t("trade.result.marginExceed", {
                      lev,
                      margin: formatCurrency(requiredMargin, currency),
                      account: `$${formatNumber(accountSize, { maximumFractionDigits: 0 })}`,
                    })}
                    <span className="ml-1 font-semibold">
                      {t("trade.result.recommendLev", { lev: recommendedLev })}
                    </span>
                    {t("trade.result.marginReduced", {
                      margin: formatCurrency(sizing.positionSize / recommendedLev, currency),
                    })}
                  </span>
                </div>
                {onApplyLeverage ? (
                  <button
                    type="button"
                    onClick={() => onApplyLeverage(recommendedLev)}
                    className="w-full rounded border border-grade-d/60 bg-grade-d/20 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-grade-d/30"
                  >
                    {t("trade.result.applyLev", { lev: recommendedLev })}
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="text-[10px] leading-relaxed text-muted-foreground">
              <strong>{t("trade.result.exposureWord")}</strong>{t("trade.result.exposureExplain")}
            </div>
          </div>
        ) : null}

        {!sizing.valid && (sizing.reasonCode || sizing.reason) ? (
          <div className="rounded-md border border-grade-d/40 bg-grade-d/10 p-3 text-sm text-grade-d">
            {sizing.reasonCode ? t(`sizing.${sizing.reasonCode}`) : sizing.reason}
          </div>
        ) : null}

        <Separator />

        <div>
          <h4 className="mb-2 text-sm font-semibold">{t("trade.result.actionsTitle")}</h4>
          <ul className="space-y-1.5 text-sm">
            {grade.actionItems.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 flex-none rounded-full bg-primary" />
                <span>{t(`grade.action.${a.code}`, a.params)}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          className="flex w-full items-center justify-between text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(!open)}
        >
          <span>{t("trade.result.scoreBreakdown")}</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {open ? (
          <ul className="space-y-1.5 text-sm">
            {grade.reasons.map((r, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="text-muted-foreground">{t(`grade.reason.${r.code}`, r.params)}</span>
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
