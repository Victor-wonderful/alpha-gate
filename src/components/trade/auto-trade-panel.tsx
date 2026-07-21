"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Bot, Play, Eye, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  saveAutoConfig,
  runAutoNowAction,
  type AutoConfigView,
} from "@/app/app/trade/auto-actions";
import type { AutoTradeDecision } from "@/lib/auto-trade";

type Cfg = Omit<AutoConfigView, "last_run_at">;

export function AutoTradePanel({
  initialConfig,
  status,
}: {
  initialConfig: AutoConfigView;
  status: { openCount: number; pendingCount: number };
}) {
  const [cfg, setCfg] = useState<Cfg>(() => {
    const { last_run_at: _ignore, ...rest } = initialConfig;
    void _ignore;
    return rest;
  });
  const [lastRun] = useState(initialConfig.last_run_at);
  const [decisions, setDecisions] = useState<AutoTradeDecision[] | null>(null);
  const [saving, startSave] = useTransition();
  const [running, startRun] = useTransition();

  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg((p) => ({ ...p, [k]: v }));

  function save() {
    startSave(async () => {
      const r = await saveAutoConfig(cfg);
      if (!r.ok) {
        toast.error(r.error ?? "저장 실패");
        return;
      }
      toast.success(cfg.enabled ? "봇 규칙 저장 — 자동매매 켜짐" : "봇 규칙 저장됨");
    });
  }

  function run(dryRun: boolean) {
    startRun(async () => {
      const r = await runAutoNowAction(dryRun);
      if (!r.ok) {
        toast.error(r.error ?? "실행 실패");
        return;
      }
      setDecisions(r.decisions ?? []);
      if (r.note) toast.message(`실행: ${r.note}`);
      else if (dryRun) toast.success(`미리보기 완료 — 통과 ${(r.decisions ?? []).filter((d) => d.skipped === "dry-run").length}건`);
      else toast.success(`발주 완료 — ${r.placed ?? 0}건`);
    });
  }

  return (
    <div className="space-y-4">
      {/* 헤더 + on/off */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold">자동매매 봇</h2>
                <p className="text-xs text-muted-foreground">Phase 1 · 가상(vUSDT) 전용 · 되돌림 지정가만</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => set("enabled", !cfg.enabled)}
              className={cn(
                "relative inline-flex h-7 w-12 items-center rounded-full transition-colors",
                cfg.enabled ? "bg-grade-a" : "bg-muted",
              )}
              aria-pressed={cfg.enabled}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                  cfg.enabled ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* 경고 */}
      <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4 flex-none" />
        <div className="space-y-1">
          <p className="font-semibold">봇은 규칙을 실행할 뿐, 수익을 보장하지 않습니다.</p>
          <p className="text-amber-700/80 dark:text-amber-400/80">
            엣지가 없으면 손실을 자동화합니다. 지금은 <b>가상 전용</b>이며, 규칙별 성적이 검증된 뒤에만 실거래를 개방합니다.
            봇은 시장가 추격 없이 <b>되돌림 지정가</b>로만, 등급·위험예산·중복·일일손실 게이트를 자동 준수합니다.
          </p>
        </div>
      </div>

      {/* 상태 */}
      <Card>
        <CardContent className="grid grid-cols-3 gap-3 p-4 text-center">
          <Stat label="진행 중 봇 포지션" value={String(status.openCount)} />
          <Stat label="봇 예약 주문" value={String(status.pendingCount)} />
          <Stat label="마지막 실행" value={lastRun ? new Date(lastRun).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"} small />
        </CardContent>
      </Card>

      {/* 규칙 설정 */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <h3 className="text-sm font-semibold">봇 규칙</h3>

          <Field label="스타일">
            <Seg options={[["day", "데이(당일)"], ["swing", "스윙(며칠)"]]} value={cfg.style} onChange={(v) => set("style", v as Cfg["style"])} />
          </Field>

          <Field label="최소 등급" hint="이 등급 이상만 진입. D는 항상 차단.">
            <Seg options={[["A", "A"], ["B", "B"], ["C", "C"]]} value={cfg.min_grade} onChange={(v) => set("min_grade", v as Cfg["min_grade"])} />
          </Field>

          <Field label="방향" hint="검증된 엣지에 맞춰 제한 가능(추세추종).">
            <Seg options={[["both", "양방향"], ["long", "롱만"], ["short", "숏만"]]} value={cfg.direction_filter} onChange={(v) => set("direction_filter", v as Cfg["direction_filter"])} />
          </Field>

          <Field label="신호 소스">
            <Seg options={[["radar", "레이더 후보"], ["fixed", "고정 심볼"]]} value={cfg.symbol_source} onChange={(v) => set("symbol_source", v as Cfg["symbol_source"])} />
          </Field>

          {cfg.symbol_source === "fixed" ? (
            <Field label="고정 심볼" hint="쉼표로 구분 (예: BTCUSDT, ETHUSDT)">
              <Input
                value={cfg.fixed_symbols.join(", ")}
                onChange={(e) => set("fixed_symbols", e.target.value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))}
                placeholder="BTCUSDT, ETHUSDT"
                className="font-mono text-sm"
              />
            </Field>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label="동시 포지션 상한">
              <Input type="number" min={1} max={10} value={cfg.max_concurrent} onChange={(e) => set("max_concurrent", Number(e.target.value) || 1)} className="font-mono" />
            </Field>
            <Field label="거래당 리스크 %">
              <Input type="number" min={0.1} max={5} step={0.1} value={cfg.risk_pct} onChange={(e) => set("risk_pct", Number(e.target.value) || 1)} className="font-mono" />
            </Field>
            <Field label="일일 손실 한도 (R)" hint="이 값 이하로 떨어지면 그날 정지">
              <Input type="number" max={0} step={0.5} value={cfg.daily_loss_limit_r} onChange={(e) => set("daily_loss_limit_r", Number(e.target.value) || -2)} className="font-mono" />
            </Field>
            <Field label="레버리지">
              <Input type="number" min={1} max={20} value={cfg.leverage} onChange={(e) => set("leverage", Number(e.target.value) || 1)} className="font-mono" />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={save} disabled={saving}>{saving ? "저장 중…" : "규칙 저장"}</Button>
            <Button variant="outline" onClick={() => run(true)} disabled={running}>
              <Eye className="mr-1.5 h-4 w-4" /> 지금 미리보기
            </Button>
            <Button variant="outline" onClick={() => run(false)} disabled={running}>
              <Play className="mr-1.5 h-4 w-4" /> 지금 1회 실행
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 실행 결과 */}
      {decisions ? (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-2 text-sm font-semibold">평가 결과 ({decisions.length}건)</h3>
            {decisions.length === 0 ? (
              <p className="text-xs text-muted-foreground">평가된 심볼이 없습니다 (신호 없음 또는 게이트에서 전부 정지).</p>
            ) : (
              <ul className="space-y-1.5">
                {decisions.map((d, i) => {
                  const ok = d.placed || d.skipped === "dry-run";
                  return (
                    <li key={i} className="flex items-center gap-2 rounded-md border border-border/50 px-2.5 py-1.5 text-xs">
                      {ok ? <CheckCircle2 className="h-3.5 w-3.5 flex-none text-grade-a" /> : <XCircle className="h-3.5 w-3.5 flex-none text-muted-foreground" />}
                      <span className="font-mono font-semibold">{d.symbol}</span>
                      {d.grade !== "-" ? <span className={cn("rounded px-1 text-[10px] font-bold", d.direction === "long" ? "bg-grade-a/15 text-grade-a" : "bg-grade-d/15 text-grade-d")}>{d.direction === "long" ? "롱" : "숏"} {d.grade}</span> : null}
                      {d.entry > 0 ? <span className="font-mono text-muted-foreground">진입 {d.entry.toLocaleString()}</span> : null}
                      <span className="ml-auto text-muted-foreground">
                        {d.placed ? "✅ 발주됨" : d.skipped === "dry-run" ? "통과(미리보기)" : d.skipped}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={cn("font-mono font-bold tabular-nums", small ? "text-xs" : "text-lg")}>{value}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Seg({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-background/40 p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "rounded px-3 py-1 text-xs font-semibold transition-colors",
            value === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent/40",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
