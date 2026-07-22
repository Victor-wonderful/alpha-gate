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
  saveBotAllocAction,
  runAutoNowAction,
  type AutoConfigView,
  type AutoStatus,
  type BotPosition,
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
  total = 0,
  botAlloc = 0,
}: {
  initialConfig: AutoConfigView;
  status: AutoStatus;
  /** 전체 운영 자금(봇+수동). 봉투 모델의 분모. */
  total: number;
  /** 봇에 맡긴 금액. 봇은 이 돈만 굴린다. */
  botAlloc: number;
}) {
  const [cfg, setCfg] = useState<Cfg>(() => {
    const { last_run_at: _i, ...rest } = initialConfig;
    void _i;
    return rest;
  });
  const lastRunAt = initialConfig.last_run_at;
  const [alloc, setAlloc] = useState(String(Math.round(botAlloc)));
  const [decisions, setDecisions] = useState<AutoTradeDecision[] | null>(null);
  const [busy, startBusy] = useTransition();
  const [running, startRun] = useTransition();

  const allocNum = Number(alloc) || 0;
  const botCapital = Math.min(allocNum, total); // 봇이 실제 굴리는 돈(전체 초과 못 함)
  const manualLeft = Math.max(0, total - allocNum); // 분석 후 거래에 남는 돈
  const overAlloc = allocNum > total; // 전체보다 많이 맡기려 함
  const perTradeLoss = botCapital * (cfg.risk_pct / 100);

  function saveAlloc() {
    if (allocNum < 0 || allocNum === Math.round(botAlloc)) return;
    startBusy(async () => {
      const r = await saveBotAllocAction(allocNum);
      if (!r.ok) toast.error(r.error ?? "저장 실패");
      else toast.success(`봇에 ${allocNum.toLocaleString()} vUSDT 맡김`);
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

  // 크론(프로덕션 10분)을 기다리지 않고 규칙을 지금 1회 실제 실행 — 조건 맞으면 가상 지정가 예약.
  // 엔진이 끝까지 도는지 즉석 검증용. 가상 전용이라 안전하지만 실제 예약이 생기므로 확인을 받는다.
  function runReal() {
    if (!confirm("지금 봇 규칙을 실제로 1회 실행합니다. 조건에 맞으면 가상 지정가 주문이 예약됩니다. 진행할까요?")) return;
    startRun(async () => {
      const r = await runAutoNowAction(false);
      if (!r.ok) {
        toast.error(r.error ?? "실행 실패");
        return;
      }
      setDecisions(r.decisions ?? []);
      if (r.placed) {
        toast.success(`${r.placed}건 실제 예약됨`);
        window.location.reload(); // 예약 수·마지막 실행 시각 갱신
      } else {
        toast.success(r.note ? `진입 없음 — ${noteKo(r.note)}` : "지금은 진입 조건이 없습니다");
      }
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

      {/* 봇에 맡긴 돈 (봉투 모델) — 전체 자금 중 봇 몫만. 나머지는 수동 거래 몫. */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">봇에 맡긴 돈</span>
            <div className="flex items-center gap-1.5">
              <Input
                value={alloc}
                onChange={(e) => setAlloc(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={saveAlloc}
                inputMode="numeric"
                className="h-8 w-32 text-right font-mono tabular-nums"
              />
              <span className="text-xs text-muted-foreground">vUSDT</span>
            </div>
          </div>
          {/* 전체 → 봇 / 수동 분배를 한눈에 */}
          <div className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px]">
            <span className="text-muted-foreground">
              전체 <b className="font-mono tabular-nums text-foreground">{total.toLocaleString()}</b>
            </span>
            <span className="text-muted-foreground">
              봇 <b className="font-mono tabular-nums text-grade-a">{botCapital.toLocaleString()}</b>
              {" · "}수동 몫 <b className="font-mono tabular-nums text-foreground">{manualLeft.toLocaleString()}</b>
            </span>
          </div>
          {overAlloc ? (
            <p className="text-[11px] font-medium text-grade-d">
              전체 자금({total.toLocaleString()})보다 많이 맡길 수 없습니다 — 봇은 {botCapital.toLocaleString()}만 씁니다. 전체 자금은 &ldquo;내 자금&rdquo; 설정에서 늘리세요.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              봇은 맡긴 돈의 <b className="text-foreground">{cfg.risk_pct}%</b>씩 거래 — 한 거래 최대 손실 약{" "}
              <b className="text-foreground">{perTradeLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })} vUSDT</b>.
              나머지 <b className="text-foreground">{manualLeft.toLocaleString()}</b>는 분석 후 직접 거래 몫입니다.
            </p>
          )}
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
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-4 text-xs">
              <Stat label="진행 중" value={String(status.openCount)} />
              <Stat label="예약" value={String(status.pendingCount)} />
            </div>
            {cfg.enabled ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-grade-a">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-grade-a opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-grade-a" />
                </span>
                자동 실행 중
              </span>
            ) : (
              <span className="text-xs font-medium text-muted-foreground">꺼짐</span>
            )}
          </div>
          {/* 자동임을 분명히 — 켜두면 클릭 불필요. */}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {cfg.enabled ? (
              <>
                켜져 있어 <b className="text-foreground">10분마다 자동으로</b> 살펴보고 진입합니다 —{" "}
                <b className="text-foreground">버튼을 누를 필요가 없습니다.</b> 마지막 자동 실행:{" "}
                <b className="text-foreground">{lastRunAt ? relTime(lastRunAt) : "아직 없음"}</b>.{" "}
                (자동 진입은 배포 환경에서만 실행됩니다.)
              </>
            ) : (
              <>봇이 꺼져 있습니다. 위 스위치를 켜면 10분마다 자동으로 살펴봅니다.</>
            )}
          </p>

          {/* 예약·진행 중 실제 목록 — 숫자만으론 뭐가 걸렸는지 모른다. */}
          {status.pending.length > 0 || status.open.length > 0 ? (
            <div className="space-y-2.5 border-t border-border/50 pt-3">
              {status.pending.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-muted-foreground">
                    예약 대기 {status.pending.length}건 · 되돌림 지정가 체결 대기
                  </div>
                  <ul className="space-y-1">
                    {status.pending.map((p) => (
                      <PosRow key={p.id} p={p} />
                    ))}
                  </ul>
                </div>
              ) : null}
              {status.open.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-muted-foreground">
                    진행 중 {status.open.length}건 · 체결되어 손절·목표 관리 중
                  </div>
                  <ul className="space-y-1">
                    {status.open.map((p) => (
                      <PosRow key={p.id} p={p} />
                    ))}
                  </ul>
                </div>
              ) : null}
              <a
                href="/app/virtual-trade"
                className="block text-center text-[11px] font-medium text-primary hover:underline"
              >
                거래 상황에서 전체 보기 →
              </a>
            </div>
          ) : (
            <p className="border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
              아직 봇이 넣은 예약·포지션이 없습니다. 조건에 맞는 셋업이 나오면 여기에 표시됩니다.
            </p>
          )}

          {/* 확인용(선택) — 봇 작동과 무관, 기다리기 싫을 때만 */}
          <div className="border-t border-border/50 pt-3">
            <p className="mb-1.5 text-[10px] text-muted-foreground">
              지금 바로 확인 (선택 · 봇 작동과 무관)
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={preview} disabled={running}>
                <Eye className="mr-1.5 h-3.5 w-3.5" /> {running ? "확인 중…" : "미리보기"}
              </Button>
              <Button variant="outline" size="sm" onClick={runReal} disabled={running}>
                {running ? "실행 중…" : "지금 한 번 실행"}
              </Button>
            </div>
          </div>
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

function PosRow({ p }: { p: BotPosition }) {
  const long = p.direction === "long";
  return (
    <li className="rounded-md border border-border/50 px-2.5 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded px-1 text-[10px] font-bold",
            long ? "bg-grade-a/15 text-grade-a" : "bg-grade-d/15 text-grade-d",
          )}
        >
          {long ? "롱" : "숏"}
          {p.grade && p.grade !== "-" ? ` ${p.grade}` : ""}
        </span>
        <span className="font-mono font-semibold">{p.symbol.replace("USDT", "")}</span>
        <span className="font-mono text-muted-foreground">
          {p.status === "pending" ? "예약가" : "진입"}{" "}
          {p.price != null ? p.price.toLocaleString() : "—"}
        </span>
        <span
          className={cn(
            "ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium",
            p.status === "pending" ? "bg-muted text-muted-foreground" : "bg-grade-a/15 text-grade-a",
          )}
        >
          {p.status === "pending" ? "체결 대기" : "진행 중"}
        </span>
      </div>
      {p.stop != null || p.target != null ? (
        <div className="mt-1 flex gap-3 font-mono text-[10px] text-muted-foreground">
          {p.stop != null ? <span>손절 {p.stop.toLocaleString()}</span> : null}
          {p.target != null ? <span>목표 {p.target.toLocaleString()}</span> : null}
        </div>
      ) : null}
    </li>
  );
}

function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "알 수 없음";
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  return `${Math.floor(hrs / 24)}일 전`;
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
  if (skip === "margin cap") return "마진 상한 도달";
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

