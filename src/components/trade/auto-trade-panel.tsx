"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Bot, Eye, CheckCircle2, XCircle, ShieldCheck, Scale, Flame } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  saveAutoConfig,
  saveBotCapitalAction,
  runAutoNowAction,
  type AutoConfigView,
} from "@/app/app/trade/auto-actions";
import type { AutoTradeDecision } from "@/lib/auto-trade";

type Cfg = Omit<AutoConfigView, "last_run_at">;

// 강도 프리셋 — 사용자가 결정하는 유일한 것. 나머지 세부는 여기서 한 번에 세팅.
type PresetKey = "safe" | "normal" | "bold";
// 강도 프리셋 — 사용자가 정하는 유일한 것. 등급·리스크·개수·레버리지·일일한도를 한 번에.
// 나머지(신호=레이더, 방향=양방향, 스타일=코인별 자동)는 고정.
const PRESETS: Record<PresetKey, { label: string; desc: string; icon: typeof ShieldCheck; patch: Partial<Cfg> }> = {
  safe: { label: "안전", desc: "엄격하게 — A등급만, 작게, 저레버리지. 진입 드묾.", icon: ShieldCheck, patch: { min_grade: "A", risk_pct: 0.5, max_concurrent: 2, leverage: 2, daily_loss_limit_r: -1, direction_filter: "both", symbol_source: "radar" } },
  normal: { label: "기본", desc: "균형 — B등급 이상, 보통 크기.", icon: Scale, patch: { min_grade: "B", risk_pct: 1, max_concurrent: 3, leverage: 3, daily_loss_limit_r: -2, direction_filter: "both", symbol_source: "radar" } },
  bold: { label: "공격", desc: "자주 — C등급도, 크게, 고레버리지. 진입 잦음.", icon: Flame, patch: { min_grade: "C", risk_pct: 1.5, max_concurrent: 5, leverage: 5, daily_loss_limit_r: -3, direction_filter: "both", symbol_source: "radar" } },
};

function matchPreset(cfg: Cfg): PresetKey | null {
  for (const k of Object.keys(PRESETS) as PresetKey[]) {
    const p = PRESETS[k].patch;
    if (
      cfg.min_grade === p.min_grade &&
      cfg.risk_pct === p.risk_pct &&
      cfg.max_concurrent === p.max_concurrent &&
      cfg.leverage === p.leverage &&
      cfg.daily_loss_limit_r === p.daily_loss_limit_r
    )
      return k;
  }
  return null;
}

export function AutoTradePanel({
  initialConfig,
  status,
  accountSize,
}: {
  initialConfig: AutoConfigView;
  status: { openCount: number; pendingCount: number };
  /** 운영 자금(내 자금) — 봇이 이 금액 × 리스크%로 포지션 크기를 잡는다. */
  accountSize: number;
}) {
  const [cfg, setCfg] = useState<Cfg>(() => {
    const { last_run_at: _i, ...rest } = initialConfig;
    void _i;
    return rest;
  });
  const [capital, setCapital] = useState(String(Math.round(accountSize)));
  const [decisions, setDecisions] = useState<AutoTradeDecision[] | null>(null);
  const [busy, startBusy] = useTransition();
  const [running, startRun] = useTransition();

  const capitalNum = Number(capital) || 0;
  const perTradeLoss = capitalNum * (cfg.risk_pct / 100);

  function saveCapital() {
    if (capitalNum <= 0 || capitalNum === Math.round(accountSize)) return;
    startBusy(async () => {
      const r = await saveBotCapitalAction(capitalNum);
      if (!r.ok) toast.error(r.error ?? "저장 실패");
      else toast.success(`운영 자금 ${capitalNum.toLocaleString()} vUSDT 저장`);
    });
  }

  const preset = useMemo(() => matchPreset(cfg), [cfg]);

  // 프리셋 선택·켜기/끄기는 즉시 저장(편의 우선 — 별도 저장 클릭 불필요).
  function persist(next: Cfg, msg?: string) {
    setCfg(next);
    startBusy(async () => {
      const r = await saveAutoConfig(next);
      if (!r.ok) toast.error(r.error ?? "저장 실패");
      else if (msg) toast.success(msg);
    });
  }

  const pickPreset = (k: PresetKey) => persist({ ...cfg, ...PRESETS[k].patch }, `${PRESETS[k].label} 강도로 설정`);
  const toggle = () => persist({ ...cfg, enabled: !cfg.enabled }, cfg.enabled ? "봇 꺼짐" : "봇 켜짐 — 이제 자동으로 살펴봅니다");

  function preview() {
    startRun(async () => {
      const r = await runAutoNowAction(true);
      if (!r.ok) {
        toast.error(r.error ?? "미리보기 실패");
        return;
      }
      setDecisions(r.decisions ?? []);
      const pass = (r.decisions ?? []).filter((d) => d.skipped === "dry-run").length;
      toast.success(r.note ? `지금은 진입 없음 — ${noteKo(r.note)}` : `지금 켜면 ${pass}건 진입`);
    });
  }

  return (
    <div className="space-y-4">
      {/* 상단: 정체성 + 큰 켜기 스위치 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold">자동매매 봇</h2>
                <p className="text-xs text-muted-foreground">켜두면 알아서 살펴보고 진입합니다 · 가상(연습)</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className={cn("text-sm font-semibold", cfg.enabled ? "text-grade-a" : "text-muted-foreground")}>
                {cfg.enabled ? "켜짐" : "꺼짐"}
              </span>
              <button
                type="button"
                onClick={toggle}
                disabled={busy}
                className={cn("relative inline-flex h-8 w-14 items-center rounded-full transition-colors disabled:opacity-60", cfg.enabled ? "bg-grade-a" : "bg-muted")}
                aria-pressed={cfg.enabled}
              >
                <span className={cn("inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform", cfg.enabled ? "translate-x-7" : "translate-x-1")} />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 이렇게 동작해요 (1) */}
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
        <b className="text-foreground">이렇게 동작해요.</b> 10분마다 대장 코인을 대신 살펴, 조건에 맞는 되돌림 셋업이 나오면
        <b className="text-foreground"> 가상으로</b> 지정가 주문을 자동으로 넣습니다. 코인마다 <b className="text-foreground">임펄스·모멘텀을 알아서</b> 골라요.
        손절·목표·만료도 자동 관리. <b className="text-foreground">평가손실이 −4%에 닿거나</b> 오늘 손실 한도에 닿으면 새 진입을 멈춰요.
        그래도 엣지가 없으면 손실이 날 수 있으니, 우선 가상으로 며칠 지켜보세요.
      </div>

      {/* 운영 자금 — 봇이 이 금액 기준으로 사이즈를 잡는다 (내 자금 공유) */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">운영 자금</span>
            <div className="flex items-center gap-1.5">
              <Input
                value={capital}
                onChange={(e) => setCapital(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={saveCapital}
                inputMode="numeric"
                className="h-8 w-32 text-right font-mono tabular-nums"
              />
              <span className="text-xs text-muted-foreground">vUSDT</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            봇은 이 금액의 <b className="text-foreground">{cfg.risk_pct}%</b>씩 거래합니다 — 한 거래 최대 손실 약{" "}
            <b className="text-foreground">{perTradeLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })} vUSDT</b>. (AI 분석·수동과 공유하는 내 자금)
          </p>
        </CardContent>
      </Card>

      {/* 강도 선택 (2) — 사용자가 정하는 유일한 것 */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">얼마나 공격적으로 할까요?</div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(PRESETS) as PresetKey[]).map((k) => {
            const P = PRESETS[k];
            const active = preset === k;
            const Icon = P.icon;
            return (
              <button
                key={k}
                type="button"
                onClick={() => pickPreset(k)}
                disabled={busy}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors disabled:opacity-60",
                  active ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:bg-accent/40",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                  <span className="text-sm font-bold">{P.label}</span>
                </div>
                <span className="text-[11px] leading-snug text-muted-foreground">{P.desc}</span>
              </button>
            );
          })}
        </div>
        {preset === null ? (
          <p className="text-[11px] text-muted-foreground">강도 하나를 고르면 표준값으로 맞춰집니다.</p>
        ) : null}
      </div>

      {/* 미리보기 (3) + 상태 */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex gap-4 text-xs">
            <Stat label="진행 중" value={String(status.openCount)} />
            <Stat label="예약" value={String(status.pendingCount)} />
          </div>
          <Button variant="outline" onClick={preview} disabled={running}>
            <Eye className="mr-1.5 h-4 w-4" /> {running ? "확인 중…" : "지금 켜면 뭘 살까?"}
          </Button>
        </CardContent>
      </Card>

      {/* 미리보기 결과 */}
      {decisions ? (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-2 text-sm font-semibold">지금 시점 미리보기</h3>
            {decisions.length === 0 ? (
              <p className="text-xs text-muted-foreground">지금은 진입할 셋업이 없습니다. (조건에 맞는 코인이 없거나 게이트에서 전부 걸러짐)</p>
            ) : (
              <ul className="space-y-1.5">
                {decisions.map((d, i) => {
                  const ok = d.placed || d.skipped === "dry-run";
                  return (
                    <li key={i} className="flex items-center gap-2 rounded-md border border-border/50 px-2.5 py-1.5 text-xs">
                      {ok ? <CheckCircle2 className="h-3.5 w-3.5 flex-none text-grade-a" /> : <XCircle className="h-3.5 w-3.5 flex-none text-muted-foreground" />}
                      <span className="font-mono font-semibold">{d.symbol}</span>
                      {d.grade !== "-" ? <span className={cn("rounded px-1 text-[10px] font-bold", d.direction === "long" ? "bg-grade-a/15 text-grade-a" : "bg-grade-d/15 text-grade-d")}>{d.direction === "long" ? "롱" : "숏"} {d.grade}</span> : null}
                      {ok && d.entry > 0 ? <span className="font-mono text-muted-foreground">{d.entry.toLocaleString()} 지정가</span> : null}
                      <span className="ml-auto text-muted-foreground">{ok ? "진입 대상" : reasonKo(d.skipped)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">미리보기는 실제 발주하지 않습니다. 봇을 켜면 이 중 진입 대상이 예약됩니다.</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function noteKo(note: string): string {
  if (note.startsWith("daily loss limit")) return "오늘 손실 한도 도달 (그날 정지)";
  if (note.startsWith("unrealized loss halt")) return "평가손실이 커서 새 진입 중단";
  if (note.startsWith("max concurrent")) return "동시 개수 상한 도달";
  if (note === "no signal symbols") return "레이더 후보 없음 (스캔 대기)";
  if (note === "disabled") return "봇이 꺼져 있음";
  return note;
}

function reasonKo(skip?: string): string {
  if (!skip) return "제외";
  if (skip.startsWith("grade")) return "등급 미달";
  if (skip === "duplicate symbol") return "이미 보유";
  if (skip === "risk budget exhausted") return "위험 예산 소진";
  if (skip === "direction filtered" || skip.startsWith("direction")) return "방향 제외";
  if (skip === "not a retracement limit") return "되돌림 자리 아님";
  if (skip === "quantity 0") return "수량 0";
  return "제외";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

