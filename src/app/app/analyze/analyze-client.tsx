"use client";

import { Suspense, useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Clock, Dices, History, Radio } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { runAnalysisAction, loadAnalysisAction } from "./_actions";
import { AnalysisResult } from "./analysis-result";
import { useAnalysisStore } from "@/lib/stores/analysis-store";
import { STYLE_PRESETS, type TradingStyle } from "@/lib/analysis/style";
import { AnalysisInfo } from "@/components/analyze/analysis-info";
import { cn } from "@/lib/utils";

const PRESETS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT"];

type Mode = "live" | "backtest";

const QUICK_OFFSETS: { label: string; days: number }[] = [
  { label: "1일 전", days: 1 },
  { label: "3일 전", days: 3 },
  { label: "1주일 전", days: 7 },
  { label: "1달 전", days: 30 },
  { label: "3달 전", days: 90 },
];

/**
 * datetime-local input format: "YYYY-MM-DDTHH:mm"
 *
 * ⚠️ 중요: 백테스트 입력은 **항상 KST 기준**으로 해석합니다.
 * 사용자 PC의 timezone이 무엇이든(예: UTC+3 모스크바) 일관된 동작을 보장합니다.
 *
 * 한국 사용자 기준 서비스이므로 "분석 시점 5월 12일 22:00"이 항상 같은 절대 시각을 의미.
 */
function toKstDatetimeLocal(d: Date): string {
  // Date 객체를 KST timezone으로 변환한 후 "YYYY-MM-DDTHH:mm" 포맷으로 변환
  const kstMs = d.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    kst.getUTCFullYear() +
    "-" +
    pad(kst.getUTCMonth() + 1) +
    "-" +
    pad(kst.getUTCDate()) +
    "T" +
    pad(kst.getUTCHours()) +
    ":" +
    pad(kst.getUTCMinutes())
  );
}

/** "2026-05-12T22:00" (KST 가정) → UTC ISO "2026-05-12T13:00:00.000Z" */
function kstLocalToUtcIso(local: string): string {
  // 명시적 KST offset(+09:00)으로 해석
  return new Date(local + "+09:00").toISOString();
}

function defaultBacktestTime(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1); // 기본 1일 전
  d.setMinutes(0, 0, 0);
  return toKstDatetimeLocal(d);
}

export function AnalyzeClient(props: {
  accountSize: number;
  riskPct: number;
  currency: "USD" | "KRW";
}) {
  return (
    <Suspense fallback={null}>
      <AnalyzeClientInner {...props} />
    </Suspense>
  );
}

function AnalyzeClientInner({
  accountSize,
  riskPct,
  currency,
}: {
  accountSize: number;
  riskPct: number;
  currency: "USD" | "KRW";
}) {
  const [pending, startTransition] = useTransition();
  const [loadingFromHistory, setLoadingFromHistory] = useState(false);
  const [mode, setMode] = useState<Mode>("live");
  const [backtestAt, setBacktestAt] = useState<string>(defaultBacktestTime);
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadId = searchParams.get("load");

  // 백테스트 시점 검증 (UI에서만 — 서버에서도 한 번 더 검사함)
  // backtestAt은 KST 기준으로 해석.
  const backtestValidation = useMemo(() => {
    if (mode !== "backtest") return { valid: true, message: "" };
    if (!backtestAt) return { valid: false, message: "분석 시점을 선택하세요." };
    const t = new Date(backtestAt + "+09:00").getTime();
    if (Number.isNaN(t)) return { valid: false, message: "날짜 형식이 올바르지 않습니다." };
    const now = Date.now();
    if (t >= now) return { valid: false, message: "백테스트 시점은 과거여야 합니다." };
    const sixMonthsAgo = now - 1000 * 60 * 60 * 24 * 180;
    if (t < sixMonthsAgo)
      return { valid: false, message: "최근 6개월 이내 시점만 지원합니다 (Binance API 제한)." };
    return { valid: true, message: "" };
  }, [mode, backtestAt]);

  function applyOffsetDays(days: number) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setMinutes(0, 0, 0);
    setBacktestAt(toKstDatetimeLocal(d));
  }
  function applyRandom() {
    // 최근 180일 ~ 1일 전 사이 무작위 시점
    const now = Date.now();
    const min = now - 1000 * 60 * 60 * 24 * 179;
    const max = now - 1000 * 60 * 60 * 24 * 1;
    const t = min + Math.random() * (max - min);
    const d = new Date(t);
    d.setMinutes(0, 0, 0);
    setBacktestAt(toKstDatetimeLocal(d));
    toast.success(`무작위 시점: ${d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST`);
  }

  // Persisted state (sessionStorage)
  const result = useAnalysisStore((s) => s.result);
  const setResult = useAnalysisStore((s) => s.setResult);
  const symbol = useAnalysisStore((s) => s.symbol);
  const style = useAnalysisStore((s) => s.style);
  const setForm = useAnalysisStore((s) => s.setForm);
  const clearStore = useAnalysisStore((s) => s.clear);

  // Hydration: zustand persist may not have hydrated on first render
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  // Load past analysis when ?load=<id> is in URL
  useEffect(() => {
    if (!loadId) return;
    let cancelled = false;
    setLoadingFromHistory(true);
    (async () => {
      const r = await loadAnalysisAction(loadId);
      if (cancelled) return;
      if ("error" in r) {
        toast.error(r.error);
      } else {
        setResult({ snapshot: r.snapshot, strategy: r.strategy, report: r.report });
        toast.success("저장된 분석을 불러왔습니다.");
      }
      setLoadingFromHistory(false);
      // Clean URL — remove ?load param so reload doesn't re-fetch
      router.replace("/app/analyze");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadId]);

  function setSymbol(v: string) {
    setForm({ symbol: v.toUpperCase() });
  }
  function setStyle(v: TradingStyle) {
    setForm({ style: v });
  }

  function run() {
    const target = symbol.toUpperCase().trim();
    if (!target) {
      toast.error("심볼을 입력하세요.");
      return;
    }
    if (mode === "backtest" && !backtestValidation.valid) {
      toast.error(backtestValidation.message);
      return;
    }
    // 백테스트면 ISO 문자열로 변환해서 전달
    // 백테스트 시각은 KST로 해석해서 UTC ISO로 변환
    const atIso = mode === "backtest" ? kstLocalToUtcIso(backtestAt) : null;
    startTransition(async () => {
      setResult(null);
      const r = await runAnalysisAction(target, style, { at: atIso });
      if (r.snapshot && r.strategy && r.report) {
        setResult({ snapshot: r.snapshot, strategy: r.strategy, report: r.report });
      }
      if (r.error) toast.error(r.error);
      else toast.success(mode === "backtest" ? "백테스트 분석 완료" : "분석 완료");
    });
  }

  function clearResult() {
    clearStore();
    toast.success("저장된 분석 결과를 비웠습니다.");
  }

  return (
    <div className="space-y-6">
      <AnalysisInfo />
      <Card>
        <CardHeader>
          <CardTitle>분석 대상</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 모드 토글 */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">분석 모드</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("live")}
                className={cn(
                  "flex items-center gap-2 rounded-md border p-3 text-left transition-colors",
                  mode === "live"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background/40 hover:bg-accent/40",
                )}
              >
                <Radio className="h-4 w-4 flex-none text-grade-a" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">라이브</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    현재 시장 분석
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode("backtest")}
                className={cn(
                  "flex items-center gap-2 rounded-md border p-3 text-left transition-colors",
                  mode === "backtest"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background/40 hover:bg-accent/40",
                )}
              >
                <Clock className="h-4 w-4 flex-none text-primary" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">백테스트</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    과거 시점 분석
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 백테스트 시점 피커 */}
          {mode === "backtest" && (
            <div className="space-y-3 rounded-md border border-primary/30 bg-primary/[0.04] p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                <Clock className="h-3.5 w-3.5" />
                백테스트 — 시간 여행 모드
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  분석 시점
                  <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground/80">
                    KST 기준
                  </span>
                </label>
                <Input
                  type="datetime-local"
                  value={backtestAt}
                  onChange={(e) => setBacktestAt(e.target.value)}
                  className="font-mono"
                />
                {!backtestValidation.valid && (
                  <p className="text-[11px] text-grade-d">{backtestValidation.message}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[11px] text-muted-foreground">빠른 선택:</span>
                {QUICK_OFFSETS.map((o) => (
                  <button
                    key={o.days}
                    type="button"
                    onClick={() => applyOffsetDays(o.days)}
                    className="rounded-md border border-border bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                  >
                    {o.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={applyRandom}
                  className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] text-primary transition-colors hover:bg-primary/20"
                  title="편향 없는 자기 평가 — 결과를 모르는 시점에서 분석"
                >
                  <Dices className="h-3 w-3" />
                  무작위 시점
                </button>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                ⓘ 그 시점까지의 캔들·지표로만 분석합니다. 호가창·체결흐름·F&G 등 라이브 전용 데이터는 사용되지 않습니다.
                범위: 최근 6개월 이내.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">분석할 심볼</label>
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="예: BTCUSDT"
              className="font-mono"
            />
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-muted-foreground">자주 쓰는 코인:</span>
              {PRESETS.map((s) => {
                const active = symbol.toUpperCase() === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSymbol(s)}
                    className={
                      "rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors " +
                      (active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background/40 text-muted-foreground hover:bg-accent/40")
                    }
                  >
                    {s.replace("USDT", "")}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">트레이딩 스타일</label>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(STYLE_PRESETS) as TradingStyle[]).map((s) => {
                const p = STYLE_PRESETS[s];
                const active = style === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStyle(s)}
                    className={
                      "rounded-md border p-3 text-left transition-colors " +
                      (active
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background/40 hover:bg-accent/40")
                    }
                  >
                    <div className="text-sm font-medium">{p.label}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{p.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={run}
              disabled={pending || (mode === "backtest" && !backtestValidation.valid)}
              size="lg"
            >
              {pending
                ? "분석 중... (10~20초)"
                : mode === "backtest"
                  ? "백테스트 분석 실행"
                  : "분석 실행"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            분석은 Binance 공개 API에서 다중 타임프레임 데이터를 가져온 뒤 Alpha Gate 자체 분석 엔진이 종합합니다.
            특정 매수/매도 추천이 아닌 시나리오 및 무효화 조건을 제시합니다.
          </p>
        </CardContent>
      </Card>

      {pending ? (
        <Card>
          <CardContent className="flex items-center justify-center p-12 text-sm text-muted-foreground">
            데이터 수집 → AI 분석 중...
          </CardContent>
        </Card>
      ) : null}

      {loadingFromHistory ? (
        <Card>
          <CardContent className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            저장된 분석 불러오는 중...
          </CardContent>
        </Card>
      ) : null}

      {hydrated && result ? (
        <>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-4 py-2.5 text-xs">
            <span className="flex items-center gap-2 text-muted-foreground">
              {result.snapshot.mode === "backtest" ? (
                <>
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    백테스트
                  </span>
                </>
              ) : (
                <History className="h-3.5 w-3.5" />
              )}
              저장된 분석 결과 표시 중 — {result.snapshot.symbol} ·{" "}
              {new Date(
                result.snapshot.historicalAt ?? result.snapshot.generatedAt,
              ).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
              {result.snapshot.mode === "backtest" && " KST 시점"}
            </span>
            <button
              type="button"
              onClick={clearResult}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              결과 지우기
            </button>
          </div>
          <AnalysisResult
            snapshot={result.snapshot}
            strategy={result.strategy}
            report={result.report}
            accountSize={accountSize}
            riskPct={riskPct}
            currency={currency}
          />
        </>
      ) : null}
    </div>
  );
}
