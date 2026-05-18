"use client";

import { useState } from "react";
import { AlertTriangle, Calculator, ChevronDown, ShieldCheck } from "lucide-react";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { SizingResult } from "@/types/trade";

interface SizingPanelProps {
  sizing: SizingResult;
  currency: "USD" | "KRW";
  accountSize: number;
  riskPct: number;
  leverage: number;
  entry: number;
  stop: number;
  target?: number;
  direction?: "long" | "short";
  /** 왕복 비용 가정 (BTC/ETH 0.12% 기본) */
  feeRoundtripPct?: number;
  onApplyLeverage?: (lev: number) => void;
}

const LEVERAGE_STEPS = [1, 3, 5, 10, 20, 50];

export function SizingPanel({
  sizing,
  currency,
  accountSize,
  riskPct,
  leverage,
  entry,
  stop,
  target,
  direction,
  feeRoundtripPct = 0.12,
  onApplyLeverage,
}: SizingPanelProps) {
  const [methodOpen, setMethodOpen] = useState(false);

  if (!sizing.valid) {
    return (
      <Shell>
        <Header />
        <div className="mt-3 rounded-md border border-grade-d/40 bg-grade-d/10 p-3 text-sm text-grade-d">
          {sizing.reason ?? "계좌 / 리스크 % / 진입 / 손절을 모두 입력하세요."}
        </div>
      </Shell>
    );
  }

  const lev = Math.max(1, leverage);
  const requiredMargin = sizing.positionSize / lev;
  const exposurePct = accountSize > 0 ? (sizing.positionSize / accountSize) * 100 : 0;
  const marginPct = accountSize > 0 ? (requiredMargin / accountSize) * 100 : 0;
  const marginExceeds = requiredMargin > accountSize;

  // 권장 레버리지 (마진 초과 시)
  const minLev = accountSize > 0 ? Math.ceil(sizing.positionSize / accountSize) : 0;
  const recommendedLev =
    LEVERAGE_STEPS.find((lv) => lv >= Math.ceil(minLev * 1.2)) ?? 50;

  // 실효 R (수수료 차감 후)
  let effectiveR: number | null = null;
  if (target && entry && stop && direction) {
    const rewardPerUnit =
      direction === "long" ? target - entry : entry - target;
    const grossReward = sizing.quantity * rewardPerUnit;
    const feeCost = sizing.positionSize * (feeRoundtripPct / 100);
    const netReward = grossReward - feeCost;
    effectiveR = sizing.maxLoss > 0 ? netReward / sizing.maxLoss : null;
  }

  // 안전 라벨
  const safetyLabel = marginExceeds
    ? { tone: "bad" as const, text: "현재 레버리지로 진입 불가 — 마진 초과" }
    : exposurePct >= 80
      ? { tone: "warn" as const, text: "공격적 노출 — 한 거래 손실이 계좌에 큰 영향" }
      : exposurePct >= 50
        ? { tone: "warn" as const, text: "공격적 — 분할 진입 고려" }
        : { tone: "good" as const, text: "보수적 적정 — 한도 안에서 통제 가능" };

  return (
    <Shell>
      <Header />

      {/* 4 metric cells */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Metric
          label="잃을 한도"
          value={`${riskPct.toFixed(2)}%`}
          sub={formatCurrency(sizing.maxLoss, currency)}
          tone="bad"
        />
        <Metric
          label="매수 수량"
          value={formatNumber(sizing.quantity, { maximumFractionDigits: 4 })}
          sub="단위"
        />
        <Metric
          label="노출 금액"
          value={`${exposurePct.toFixed(1)}%`}
          sub={formatCurrency(sizing.positionSize, currency)}
          tone={exposurePct >= 80 ? "warn" : undefined}
        />
        <Metric
          label={`필요 마진 (${lev}x)`}
          value={`${marginPct.toFixed(2)}%`}
          sub={formatCurrency(requiredMargin, currency)}
          tone={marginExceeds ? "bad" : undefined}
        />
      </div>

      {/* Exposure visualization bar */}
      <div className="mt-4 space-y-1.5">
        <ExposureBar
          label="노출 금액"
          pct={exposurePct}
          tone={exposurePct >= 80 ? "warn" : exposurePct >= 50 ? "info" : "good"}
        />
        <ExposureBar
          label={`필요 마진 (${lev}x)`}
          pct={marginPct}
          tone={marginExceeds ? "bad" : marginPct >= 50 ? "warn" : "good"}
        />
        <ExposureBar
          label="잃을 한도"
          pct={riskPct}
          max={5}
          tone="info"
        />
      </div>

      {/* Effective R (when target provided) */}
      {effectiveR !== null && (
        <div className="mt-4 rounded-md border border-border bg-background/30 p-3">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">실효 R (수수료 {feeRoundtripPct}% 차감)</span>
            <span
              className={cn(
                "font-mono text-base font-semibold",
                effectiveR >= 2 ? "text-grade-a" : effectiveR >= 1 ? "text-grade-b" : "text-grade-d",
              )}
            >
              {effectiveR >= 0 ? "+" : ""}
              {effectiveR.toFixed(2)}R
            </span>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            목표 도달 시 순수익 ÷ 잃을 한도. 2R 이상이면 손익비 합리적.
          </div>
        </div>
      )}

      {/* Safety label */}
      <div
        className={cn(
          "mt-4 flex items-start gap-2 rounded-md border p-2.5 text-xs",
          safetyLabel.tone === "bad" && "border-grade-d/40 bg-grade-d/10 text-grade-d",
          safetyLabel.tone === "warn" && "border-grade-b/40 bg-grade-b/10 text-grade-b",
          safetyLabel.tone === "good" && "border-grade-a/40 bg-grade-a/10 text-grade-a",
        )}
      >
        {safetyLabel.tone === "good" ? (
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-none" />
        ) : (
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
        )}
        <span className="flex-1">{safetyLabel.text}</span>
      </div>

      {/* Margin-exceeds CTA */}
      {marginExceeds && onApplyLeverage && (
        <div className="mt-2 space-y-1.5 rounded-md border border-grade-d/40 bg-grade-d/10 p-2.5 text-xs text-grade-d">
          <div>
            노출 {formatCurrency(sizing.positionSize, currency)}을 {lev}x로 진입하려면 마진{" "}
            {formatCurrency(requiredMargin, currency)} 필요 — 계좌 초과.
          </div>
          <button
            type="button"
            onClick={() => onApplyLeverage(recommendedLev)}
            className="w-full rounded border border-grade-d/60 bg-grade-d/20 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-grade-d/30"
          >
            {recommendedLev}x로 적용 (마진 {formatCurrency(sizing.positionSize / recommendedLev, currency)})
          </button>
        </div>
      )}

      {/* Calculation method (expandable) */}
      <button
        type="button"
        onClick={() => setMethodOpen((v) => !v)}
        className="mt-4 flex w-full items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <Calculator className="h-3.5 w-3.5" />
          계산 과정 보기
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", methodOpen && "rotate-180")}
        />
      </button>
      {methodOpen && (
        <div className="mt-2 space-y-2 rounded-md border border-border bg-background/40 p-3 font-mono text-[11px] leading-relaxed">
          <Step
            n={1}
            label="최대 손실"
            formula={`계좌 ${formatCurrency(accountSize, currency)} × 리스크 ${riskPct}% = ${formatCurrency(sizing.maxLoss, currency)}`}
          />
          <Step
            n={2}
            label="단위당 리스크"
            formula={`|진입 ${formatNumber(entry)} − 손절 ${formatNumber(stop)}| = ${formatNumber(sizing.riskPerUnit)}`}
          />
          <Step
            n={3}
            label="매수 수량"
            formula={`${formatCurrency(sizing.maxLoss, currency)} ÷ ${formatNumber(sizing.riskPerUnit)} = ${formatNumber(sizing.quantity, { maximumFractionDigits: 4 })} (소수 4자리 절삭)`}
          />
          <Step
            n={4}
            label="노출 금액"
            formula={`${formatNumber(sizing.quantity, { maximumFractionDigits: 4 })} × ${formatNumber(entry)} = ${formatCurrency(sizing.positionSize, currency)}`}
          />
          <Step
            n={5}
            label="필요 마진"
            formula={`${formatCurrency(sizing.positionSize, currency)} ÷ ${lev}x = ${formatCurrency(requiredMargin, currency)}`}
          />
          {effectiveR !== null && target && direction ? (
            <Step
              n={6}
              label={`실효 R (수수료 ${feeRoundtripPct}% 차감)`}
              formula={`(목표 도달 시 수익 − 수수료) ÷ 한도 = ${effectiveR >= 0 ? "+" : ""}${effectiveR.toFixed(2)}R`}
            />
          ) : null}
          <div className="pt-2 text-[10px] text-muted-foreground">
            <strong className="text-foreground">리스크 % 기반 역산</strong> — 손절가에서 한도까지 손해를 봐도 계좌의 {riskPct}%만 잃도록 수량을 자동 계산합니다. 레버리지는 묶이는 마진만 줄여줍니다.
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-4">
      {children}
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">포지션 사이징</h3>
      </div>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        리스크 % 기반 자동 계산
      </span>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2.5">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-base font-semibold leading-none",
          tone === "good" && "text-grade-a",
          tone === "warn" && "text-grade-b",
          tone === "bad" && "text-grade-d",
        )}
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-1 truncate text-[10px] text-muted-foreground/80">{sub}</div>
      ) : null}
    </div>
  );
}

function ExposureBar({
  label,
  pct,
  max = 100,
  tone,
}: {
  label: string;
  pct: number;
  max?: number;
  tone: "good" | "info" | "warn" | "bad";
}) {
  const width = Math.min(100, (pct / max) * 100);
  const fillCls = {
    good: "bg-gradient-to-r from-grade-a/70 to-grade-a",
    info: "bg-gradient-to-r from-primary/60 to-primary",
    warn: "bg-gradient-to-r from-grade-b/70 to-grade-b",
    bad: "bg-gradient-to-r from-grade-d/70 to-grade-d",
  }[tone];
  return (
    <div>
      <div className="flex items-baseline justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-muted-foreground/80">{pct.toFixed(1)}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
        <div
          className={cn("h-full rounded-full transition-all", fillCls)}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function Step({ n, label, formula }: { n: number; label: string; formula: string }) {
  return (
    <div className="grid grid-cols-[20px_1fr] gap-2">
      <span className="text-primary">{n}.</span>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 text-foreground">{formula}</div>
      </div>
    </div>
  );
}
