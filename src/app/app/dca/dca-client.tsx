"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { summarizePlan, type DcaPlan, type DcaPlanProgress } from "@/lib/dca/plan";
import type { ValueVerdict, ValueZoneResult } from "@/lib/dca/value-zone";
import type { checkAssetGate } from "@/lib/dca/asset-gate";
import {
  createDcaPlanAction,
  deleteDcaPlanAction,
  executeDcaTrancheAction,
  loadDcaAssessmentAction,
  updateDcaPlanStatusAction,
} from "./_actions";

type Assessment = {
  allowed?: boolean;
  blockReason?: string;
  gateChecks?: ReturnType<typeof checkAssetGate>["checks"];
  valueZone?: ValueZoneResult;
};

const VERDICT_TONE: Record<ValueVerdict, string> = {
  cheap: "text-grade-a",
  neutral: "text-muted-foreground",
  expensive: "text-grade-d",
};

export function DcaClient({
  symbols,
  initialPlans,
  zoneBySymbol,
  stacked = false,
}: {
  symbols: string[];
  initialPlans: Array<DcaPlan & { progress: DcaPlanProgress }>;
  /** 플랜이 가진 자산별 밸류 존 — 화면에서 뭘 보고 있든 플랜은 자기 판단을 보여준다. */
  zoneBySymbol: Record<string, ValueZoneResult | undefined>;
  /** 좁은 컬럼(자동매매 페이지 우측)에 넣을 땐 내부 2단을 세로로 쌓는다. */
  stacked?: boolean;
}) {
  const t = useT();
  const [symbol, setSymbol] = useState(symbols[0] ?? "BTCUSDT");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  // 선택한 자산의 게이트 + 밸류 존 조회.
  useEffect(() => {
    let alive = true;
    const run = async () => {
      setLoading(true);
      setAssessment(null);
      try {
        const r = await loadDcaAssessmentAction(symbol);
        if (!alive) return;
        if (!r.ok) {
          toast.error(r.error ?? t("dca.errAssess"));
          return;
        }
        setAssessment(r);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const vz = assessment?.valueZone;

  return (
    <>
      {/* 처음 온 사람이 "이게 뭔지" 세 줄로 알 수 있게. 화면에 숫자만 있으면 못 쓴다. */}
      <div className="mb-4 rounded-lg border border-border/40 bg-background/30 p-3.5">
        <ul className="space-y-1 text-[12px] leading-relaxed text-muted-foreground">
          <li>· {t("dca.how1")}</li>
          <li>· {t("dca.how2")}</li>
          <li>· {t("dca.how3")}</li>
          <li>· {t("dca.how4")}</li>
        </ul>
      </div>

      <div className={stacked ? "grid gap-4" : "grid gap-4 lg:grid-cols-[420px_1fr]"}>
      {/* ── 좌: 자산 + 밸류 존 + 플랜 생성 ─────────────────────────── */}
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div>
              <Label className="mb-1 block text-[11px] text-muted-foreground">{t("dca.asset")}</Label>
              <Select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                {symbols.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("USDT", "")}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                {t("dca.universeNote")}
              </p>
            </div>

            {loading ? (
              <p className="py-6 text-center text-xs text-muted-foreground">{t("dca.loading")}</p>
            ) : assessment && !assessment.allowed ? (
              <div className="rounded-md border border-grade-d/40 bg-grade-d/5 p-3">
                <p className="text-xs font-semibold text-grade-d">{assessment.blockReason}</p>
              </div>
            ) : vz?.ok ? (
              <ValueZoneCard vz={vz} />
            ) : vz ? (
              <p className="rounded-md border border-border/40 bg-background/30 p-3 text-[11px] text-muted-foreground">
                {vz.error}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {assessment?.allowed && vz?.ok ? (
          <CreatePlanCard
            symbol={symbol}
            verdict={vz.verdict}
            multiplier={vz.tiltMultiplier}
            pending={pending}
            start={startTransition}
          />
        ) : null}
      </div>

      {/* ── 우: 내 플랜 ──────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold">{t("dca.myPlans", { n: initialPlans.length })}</h2>
        {initialPlans.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-sm text-muted-foreground">{t("dca.noPlans")}</p>
            </CardContent>
          </Card>
        ) : (
          initialPlans.map((p) => {
            // 지금 보고 있는 자산이면 방금 조회한 값이 더 신선하다.
            const zone = p.symbol === symbol && vz?.ok ? vz : zoneBySymbol[p.symbol];
            return (
              <PlanCard
                key={p.id}
                plan={p}
                zone={zone}
                pending={pending}
                start={startTransition}
              />
            );
          })
        )}
      </div>
      </div>
    </>
  );
}

function ValueZoneCard({ vz }: { vz: ValueZoneResult }) {
  const t = useT();
  return (
    <div className="rounded-md border border-border/40 bg-background/30 p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("dca.valueZone")}
        </span>
        <span className={cn("text-sm font-bold", VERDICT_TONE[vz.verdict])}>
          {t(`dca.verdict.${vz.verdict}`)}
          <span className="ml-1.5 font-mono text-[11px] tabular-nums">{vz.tiltMultiplier}×</span>
        </span>
      </div>
      <ul className="space-y-1.5">
        {vz.signals.map((s) => (
          <li key={s.key} className="text-[11px]">
            <span className={cn("font-medium", VERDICT_TONE[s.verdict])}>{s.label}</span>
            <span className="ml-1.5 text-muted-foreground">{s.detail}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-border/30 pt-2 text-[10px] leading-relaxed text-muted-foreground">
        {t("dca.tiltNote")}
      </p>
    </div>
  );
}

function CreatePlanCard({
  symbol,
  verdict,
  multiplier,
  pending,
  start,
}: {
  symbol: string;
  verdict: ValueVerdict;
  multiplier: number;
  pending: boolean;
  start: (fn: () => void) => void;
}) {
  const t = useT();
  // 사용자에게는 "얼마를 얼마 동안"만 묻는다. 횟수·주기는 앱이 계산한다 —
  // 검증된 방식이 "매주 정기 매수"라서 주기는 고를 여지가 없다(가격 사다리는
  // 백테스트를 통과한 적이 없어 노출하지 않는다). cf. docs/DCA-모드-설계.md §10
  const [budget, setBudget] = useState("8000");
  const [months, setMonths] = useState("6");

  const WEEKS_PER_MONTH = 4.345;
  const tranches = Math.max(1, Math.round((Number(months) || 0) * WEEKS_PER_MONTH));
  const base = (Number(budget) || 0) / tranches;
  const thisTime = base * multiplier;

  function submit() {
    start(() => {
      void (async () => {
        const r = await createDcaPlanAction({
          symbol,
          totalBudget: Number(budget) || 0,
          tranches,
          mode: "periodic",
          periodDays: 7,
        });
        if (!r.ok) {
          toast.error(r.error ?? t("dca.errCreate"));
          return;
        }
        toast.success(t("dca.toastCreated"));
        window.location.reload();
      })();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h2 className="text-sm font-bold">{t("dca.newPlan")}</h2>

        {/* 한 문장으로 묻는다 — "얼마를, 얼마 동안". 나머지는 앱이 정한다. */}
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{symbol.replace("USDT", "")}</span>
            <span className="text-muted-foreground">{t("dca.sentenceBudgetPre")}</span>
            <Input
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="h-8 w-28 font-mono tabular-nums"
            />
            <span className="text-muted-foreground">{t("dca.sentenceBudgetPost")}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="number"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              className="h-8 w-20 font-mono tabular-nums"
            />
            <span className="text-muted-foreground">{t("dca.sentenceMonths")}</span>
          </div>
        </div>

        {/* 입력한 문장이 실제로 무엇을 뜻하는지 그대로 풀어서 보여준다. */}
        <div className="space-y-1 rounded-md border border-border/30 bg-background/20 p-2.5 text-[11px]">
          <p className="text-muted-foreground">
            {t("dca.planPreview", {
              n: tranches,
              base: formatNumber(base, { maximumFractionDigits: 0 }),
            })}
          </p>
          <p className={cn("font-medium", VERDICT_TONE[verdict])}>
            {t("dca.planPreviewNow", {
              verdict: t(`dca.verdict.${verdict}`),
              mult: String(multiplier),
              amount: formatNumber(thisTime, { maximumFractionDigits: 0 }),
            })}
          </p>
        </div>

        <Button
          type="button"
          onClick={submit}
          disabled={pending || tranches < 1 || !(Number(budget) > 0)}
          className="w-full font-bold"
          size="lg"
        >
          {pending ? "..." : t("dca.createBtn")}
        </Button>
      </CardContent>
    </Card>
  );
}

function PlanCard({
  plan,
  zone,
  pending,
  start,
}: {
  plan: DcaPlan & { progress: DcaPlanProgress };
  /** 이 플랜 자산의 밸류 존. 없으면 시세를 못 읽은 것. */
  zone?: ValueZoneResult;
  pending: boolean;
  start: (fn: () => void) => void;
}) {
  const t = useT();
  const verdict: ValueVerdict | null = zone?.ok ? zone.verdict : null;
  const summary = summarizePlan(plan, plan.progress, verdict ?? "neutral", zone?.price);
  const isActive = plan.status === "active";

  function run() {
    start(() => {
      void (async () => {
        const r = await executeDcaTrancheAction(plan.id);
        if (!r.ok) {
          toast.error(r.error ?? t("dca.errExecute"));
          return;
        }
        toast.success(
          t("dca.toastExecuted", {
            amount: formatNumber(r.spent ?? 0, { maximumFractionDigits: 2 }),
            mult: String(r.multiplier ?? 1),
          }),
        );
        window.location.reload();
      })();
    });
  }

  function toggle() {
    start(() => {
      void (async () => {
        const r = await updateDcaPlanStatusAction(plan.id, isActive ? "paused" : "active");
        if (!r.ok) toast.error(r.error ?? "");
        else window.location.reload();
      })();
    });
  }

  function remove() {
    if (!confirm(t("dca.confirmDelete", { sym: plan.symbol }))) return;
    start(() => {
      void (async () => {
        const r = await deleteDcaPlanAction(plan.id);
        if (!r.ok) toast.error(r.error ?? "");
        else window.location.reload();
      })();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold">{plan.symbol.replace("USDT", "")}</span>
              <span
                className={cn(
                  "rounded px-1.5 py-px text-[9px] font-medium",
                  isActive ? "bg-grade-a/15 text-grade-a" : "bg-muted/50 text-muted-foreground",
                )}
              >
                {t(`dca.status.${plan.status}`)}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {plan.mode === "periodic"
                ? plan.period_days === 7
                  ? t("dca.summaryWeekly", { n: plan.tranches })
                  : t("dca.summaryPeriodic", { days: plan.period_days ?? 0, n: plan.tranches })
                : t("dca.summaryWeekly", { n: plan.tranches })}
            </p>
          </div>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="text-[10px] text-muted-foreground hover:text-grade-d"
          >
            {t("common.delete")}
          </button>
        </div>

        {/* 이 플랜 자산의 현재 가격 판단 — 목록만 보고도 "지금 사도 되는지" 알 수 있어야 한다. */}
        {zone?.ok ? (
          <div className="rounded-md border border-border/30 bg-background/20 p-2.5">
            <div className="flex items-baseline justify-between">
              <span className={cn("text-xs font-semibold", VERDICT_TONE[zone.verdict])}>
                {t(`dca.verdict.${zone.verdict}`)}
                <span className="ml-1.5 font-mono text-[11px] tabular-nums">{zone.tiltMultiplier}×</span>
              </span>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {formatNumber(zone.price)}
              </span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              {zone.signals.map((s) => s.label + " " + t(`dca.verdict.${s.verdict}`)).join(" · ")}
            </p>
          </div>
        ) : null}

        {/* 운영 자금 / 모은 금액 / 남은 잔액 — "얼마 계획·얼마 모았고·얼마 남았나" 한눈에 */}
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <Stat
            label={t("dca.totalBudget")}
            value={`${formatNumber(Number(plan.total_budget), { maximumFractionDigits: 0 })}`}
          />
          <Stat
            label={t("dca.accumulated")}
            value={`${formatNumber(plan.progress.spent, { maximumFractionDigits: 0 })}`}
            sub={
              plan.progress.quantity > 0
                ? t("dca.heldQty", {
                    qty: formatNumber(plan.progress.quantity, { maximumFractionDigits: 5 }),
                    sym: plan.symbol.replace("USDT", ""),
                  })
                : undefined
            }
          />
          <Stat
            label={t("dca.remainingBudget")}
            value={`${formatNumber(summary.remainingBudget, { maximumFractionDigits: 0 })}`}
          />
        </div>

        {/* 진행률 */}
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">
              {t("dca.progress", {
                spent: formatNumber(plan.progress.spent, { maximumFractionDigits: 0 }),
                total: formatNumber(Number(plan.total_budget), { maximumFractionDigits: 0 }),
              })}
            </span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {(summary.progressPct * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted/40">
            <div className="h-full bg-primary" style={{ width: `${summary.progressPct * 100}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <Stat label={t("dca.executions")} value={String(plan.progress.executions)} />
          <Stat
            label={t("dca.avgPrice")}
            value={plan.progress.avgPrice > 0 ? formatNumber(plan.progress.avgPrice) : "—"}
          />
          <Stat
            label={t("dca.pnl")}
            value={summary.pnlPct != null ? `${summary.pnlPct >= 0 ? "+" : ""}${(summary.pnlPct * 100).toFixed(1)}%` : "—"}
            tone={summary.pnlPct == null ? undefined : summary.pnlPct >= 0 ? "good" : "bad"}
          />
        </div>

        {isActive ? (
          <div className="space-y-1.5">
            <Button
              type="button"
              onClick={run}
              disabled={pending || summary.amountThisTranche <= 0 || verdict == null}
              className="w-full font-bold"
            >
              {summary.amountThisTranche <= 0
                ? t("dca.budgetDone")
                : verdict == null
                  ? t("dca.selectAssetFirst")
                  : t("dca.executeBtn", {
                      amount: formatNumber(summary.amountThisTranche, { maximumFractionDigits: 0 }),
                      mult: String(summary.multiplier),
                    })}
            </Button>
            <button
              type="button"
              onClick={toggle}
              disabled={pending}
              className="w-full text-center text-[10px] text-muted-foreground hover:text-foreground"
            >
              {t("dca.pause")}
            </button>
          </div>
        ) : plan.status === "paused" ? (
          <Button type="button" variant="outline" onClick={toggle} disabled={pending} className="w-full">
            {t("dca.resume")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: "good" | "bad"; sub?: string }) {
  return (
    <div className="rounded-md border border-border/30 bg-background/20 p-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 font-mono text-xs font-semibold tabular-nums",
          tone === "good" ? "text-grade-a" : tone === "bad" ? "text-grade-d" : "text-foreground",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 font-mono text-[9px] tabular-nums text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
