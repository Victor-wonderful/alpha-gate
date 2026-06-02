"use client";

import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ChevronDown, History } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { runAnalysisAction, loadAnalysisAction, loadScenarioStatsAction } from "./_actions";
import type { ScenarioStats } from "@/lib/analysis/scenario-stats";
import { AnalysisResult } from "./analysis-result";
import { useAnalysisStore } from "@/lib/stores/analysis-store";
import { STYLE_PRESETS, type TradingStyle } from "@/lib/analysis/style";
import { AnalysisTimingHint } from "@/components/analyze/analysis-timing-hint";
import { AnalysisInfo } from "@/components/analyze/analysis-info";
import { SessionsClock } from "@/components/market/sessions-clock";
import { kstStringAgo, kstStringToDate, randomKstStringWithin6Months } from "@/lib/analysis/kst";

// Top Binance USDT-Perp by recent volume — wide enough for most use cases.
const PRESETS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "BNBUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "TRXUSDT",
  "TONUSDT",
  "DOTUSDT",
  "MATICUSDT",
  "ARBUSDT",
  "OPUSDT",
  "SUIUSDT",
  "APTUSDT",
  "INJUSDT",
  "NEARUSDT",
  "ATOMUSDT",
  "LTCUSDT",
  "BCHUSDT",
  "FILUSDT",
  "ICPUSDT",
  "ETCUSDT",
  "UNIUSDT",
  "AAVEUSDT",
  "RNDRUSDT",
  "TIAUSDT",
  "SEIUSDT",
];

export function AnalyzeClient(props: {
  accountSize: number;
  riskPct: number;
  currency: "USD" | "KRW";
  money: import("@/types/trade").MoneyContext;
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
  money,
}: {
  accountSize: number;
  riskPct: number;
  currency: "USD" | "KRW";
  money: import("@/types/trade").MoneyContext;
}) {
  const [pending, startTransition] = useTransition();
  const [loadingFromHistory, setLoadingFromHistory] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadId = searchParams.get("load");
  const urlSymbol = searchParams.get("symbol");

  // Persisted state (sessionStorage)
  const result = useAnalysisStore((s) => s.result);
  const setResult = useAnalysisStore((s) => s.setResult);
  const symbol = useAnalysisStore((s) => s.symbol);
  const style = useAnalysisStore((s) => s.style);
  const accountSizeOverride = useAnalysisStore((s) => s.accountSizeOverride);
  const riskPctOverride = useAnalysisStore((s) => s.riskPctOverride);
  const mode = useAnalysisStore((s) => s.mode);
  const historicalAtKst = useAnalysisStore((s) => s.historicalAtKst);
  const setForm = useAnalysisStore((s) => s.setForm);
  const clearStore = useAnalysisStore((s) => s.clear);

  // Effective values — override if set, else profile default from props.
  const effectiveAccountSize = accountSizeOverride ?? accountSize;
  const effectiveRiskPct = riskPctOverride ?? riskPct;

  // Hydration: zustand persist may not have hydrated on first render
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  // 시나리오 적중률 통계 — result 바뀔 때마다 fetch
  const [stats, setStats] = useState<ScenarioStats | null>(null);
  useEffect(() => {
    if (!result) {
      setStats(null);
      return;
    }
    let cancelled = false;
    loadScenarioStatsAction({
      symbol: result.snapshot.symbol,
      strategyPrimary: result.strategy.primary,
      days: 30,
    }).then((r) => {
      if (!cancelled && r.stats) setStats(r.stats);
    });
    return () => {
      cancelled = true;
    };
  }, [result]);

  // Prefill symbol from ?symbol=<pair> (e.g. coming from Snapshot · Today)
  useEffect(() => {
    if (!hydrated || !urlSymbol) return;
    setForm({ symbol: urlSymbol.toUpperCase() });
    // Clean URL so reload doesn't re-apply
    router.replace("/app/analyze");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, urlSymbol]);

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
        setResult({ snapshot: r.snapshot, strategy: r.strategy, report: r.report, analysisId: loadId });
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
    // 백테스트 모드 검증
    let atIso: string | undefined;
    if (mode === "backtest") {
      if (!historicalAtKst) {
        toast.error("백테스트 시점을 선택하세요.");
        return;
      }
      const d = kstStringToDate(historicalAtKst);
      if (isNaN(d.getTime())) {
        toast.error("백테스트 시점 형식이 올바르지 않습니다.");
        return;
      }
      if (d.getTime() > Date.now() - 60 * 60 * 1000) {
        toast.error("백테스트 시점은 최소 1시간 전이어야 합니다.");
        return;
      }
      // Binance 무료 API는 6개월 한도
      if (d.getTime() < Date.now() - 200 * 24 * 60 * 60 * 1000) {
        toast.error("백테스트 시점은 최근 6개월 이내여야 합니다 (Binance 데이터 한계).");
        return;
      }
      atIso = d.toISOString();
    }
    startTransition(async () => {
      setResult(null);
      const r = await runAnalysisAction(target, style, atIso);
      if (r.snapshot && r.strategy && r.report) {
        setResult({ snapshot: r.snapshot, strategy: r.strategy, report: r.report, analysisId: r.analysisId });
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
      <SessionsClock />
      <Card>
        <CardHeader>
          <CardTitle>분석 대상</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* 모드 토글: 라이브 vs 백테스트 */}
          <ModeToggle
            mode={mode}
            historicalAtKst={historicalAtKst}
            onModeChange={(m) => setForm({ mode: m, historicalAtKst: m === "live" ? null : (historicalAtKst ?? kstStringAgo({ days: 7 })) })}
            onHistoricalChange={(v) => setForm({ historicalAtKst: v })}
          />
          <div className="grid gap-5 lg:grid-cols-2">
            {/* LEFT — 트레이딩 스타일 + 분석 가능 여부 */}
            <section className="flex h-full flex-col gap-3">
              <label className="text-xs font-medium text-muted-foreground">트레이딩 스타일</label>
              <div className="grid grid-cols-2 gap-2">
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
                      <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{p.description}</div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-auto">
                <AnalysisTimingHint style={style} />
              </div>
            </section>

            {/* RIGHT — 운영 자금/리스크 + 분석할 심볼 */}
            <section className="flex h-full flex-col gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-medium text-muted-foreground">
                    💰 운영 자금 · 리스크
                  </label>
                  {(accountSizeOverride !== null || riskPctOverride !== null) ? (
                    <button
                      type="button"
                      onClick={() => setForm({ accountSizeOverride: null, riskPctOverride: null })}
                      className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      초기화
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    id="account-size-input"
                    type="number"
                    min={0}
                    step={100}
                    value={accountSizeOverride !== null ? String(accountSizeOverride) : ""}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setForm({ accountSizeOverride: v === "" ? null : Number(v) });
                    }}
                    placeholder={`운영 자금 (USD) — 기본 ${accountSize.toLocaleString()}`}
                    className="font-mono"
                  />
                  <Input
                    id="risk-pct-input"
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={riskPctOverride !== null ? String(riskPctOverride) : ""}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setForm({ riskPctOverride: v === "" ? null : Number(v) });
                    }}
                    placeholder="거래당 리스크 (%) — 비워두면 AI 자동"
                    className="font-mono"
                  />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {riskPctOverride !== null ? (
                    <>
                      적용: <span className="font-mono text-foreground">${effectiveAccountSize.toLocaleString()}</span> × <span className="font-mono text-foreground">{riskPctOverride}%</span> = 거래당 <span className="font-mono text-foreground">${(effectiveAccountSize * riskPctOverride / 100).toLocaleString()}</span> 손실 한도 (고정)
                    </>
                  ) : (
                    <>
                      적용: <span className="font-mono text-foreground">${effectiveAccountSize.toLocaleString()}</span> · 리스크는 <span className="text-primary font-medium">시나리오마다 AI 권장값</span>으로 자동 산정
                    </>
                  )}
                </div>
              </div>

              <div className="mt-auto space-y-2">
                <label
                  htmlFor="symbol-input"
                  className="text-xs font-medium text-muted-foreground"
                >
                  분석할 심볼
                </label>
                <SymbolCombobox value={symbol} onChange={setSymbol} />
              </div>
            </section>
          </div>

          <div className="flex justify-end">
            <Button onClick={run} disabled={pending} size="lg">
              {pending ? "분석 중... (10~20초)" : "분석 실행"}
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
              <History className="h-3.5 w-3.5" />
              저장된 분석 결과 표시 중 — {result.snapshot.symbol} ·{" "}
              {new Date(result.snapshot.generatedAt).toLocaleString("ko-KR", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
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
            accountSize={effectiveAccountSize}
            riskPctOverride={riskPctOverride}
            userPreferredRiskPct={riskPct}
            currency={currency}
            historicalStats={stats}
            analysisId={result.analysisId}
            money={money}
          />
        </>
      ) : null}
    </div>
  );
}

/** 라이브 / 백테스트 모드 토글 + KST datetime 피커 + 빠른 선택 */
function ModeToggle({
  mode,
  historicalAtKst,
  onModeChange,
  onHistoricalChange,
}: {
  mode: "live" | "backtest";
  historicalAtKst: string | null;
  onModeChange: (m: "live" | "backtest") => void;
  onHistoricalChange: (v: string) => void;
}) {
  const isBacktest = mode === "backtest";
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onModeChange("live")}
          className={
            "rounded-md border p-3 text-left transition-colors " +
            (!isBacktest
              ? "border-primary bg-primary/10"
              : "border-border bg-background/40 hover:bg-accent/40")
          }
        >
          <div className="text-sm font-medium">🟢 라이브</div>
          <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
            현재 시점 데이터로 분석
          </div>
        </button>
        <button
          type="button"
          onClick={() => onModeChange("backtest")}
          className={
            "rounded-md border p-3 text-left transition-colors " +
            (isBacktest
              ? "border-primary bg-primary/10"
              : "border-border bg-background/40 hover:bg-accent/40")
          }
        >
          <div className="text-sm font-medium">⏮ 백테스트</div>
          <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
            과거 시점 시뮬 (호가/체결흐름 제외)
          </div>
        </button>
      </div>

      {isBacktest ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-medium text-amber-300">
              ⏰ 분석 기준 시각 (KST)
            </label>
            <span className="text-[10px] text-muted-foreground">
              Binance 무료 API 한계로 최근 6개월까지
            </span>
          </div>
          <Input
            type="datetime-local"
            value={historicalAtKst ?? ""}
            onChange={(e) => onHistoricalChange(e.target.value)}
            className="font-mono"
          />
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "1일 전", v: kstStringAgo({ days: 1 }) },
              { label: "3일 전", v: kstStringAgo({ days: 3 }) },
              { label: "1주일 전", v: kstStringAgo({ days: 7 }) },
              { label: "1달 전", v: kstStringAgo({ days: 30 }) },
              { label: "3달 전", v: kstStringAgo({ days: 90 }) },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => onHistoricalChange(opt.v)}
                className="rounded-md border border-border bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onHistoricalChange(randomKstStringWithin6Months())}
              className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] text-primary transition-colors hover:bg-primary/10"
              title="블라인드 백테스트 — 편향 제거"
            >
              🎲 무작위
            </button>
          </div>
          <div className="text-[10px] text-muted-foreground">
            백테스트 모드: <strong>kline(봉 데이터)만</strong> 과거 시점으로 fetch.
            호가창 · 체결흐름 · 펀딩 · BTC 도미넌스 등 라이브 전용 데이터는 0/빈값.
            AI 분석은 사용 가능한 데이터만으로 진행됩니다.
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Input with a chevron button that opens a scrollable preset picker.
 *  Also supports free typing — useful for symbols not in the preset list. */
function SymbolCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const q = value.toUpperCase().trim();
  // If input is empty OR already matches a preset exactly, show full list
  // (user wants to browse). Only filter when user is mid-typing a partial.
  const exactMatch = PRESETS.includes(q);
  const filtered =
    !q || exactMatch
      ? PRESETS
      : PRESETS.filter(
          (s) => s.includes(q) || s.replace("USDT", "").includes(q),
        );

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-stretch gap-0">
        <Input
          id="symbol-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="예: BTCUSDT"
          className="rounded-r-none font-mono"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-10 items-center justify-center rounded-r-md border border-l-0 border-input bg-background px-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="코인 목록"
        >
          <ChevronDown
            className={
              "h-4 w-4 transition-transform " + (open ? "rotate-180" : "")
            }
          />
        </button>
      </div>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-popover shadow-xl">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              일치하는 코인이 없습니다. 입력값 그대로 분석합니다.
            </div>
          ) : (
            filtered.map((s) => {
              const active = value.toUpperCase() === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    onChange(s);
                    setOpen(false);
                  }}
                  className={
                    "flex w-full items-center justify-between gap-3 px-3 py-2 text-sm transition-colors " +
                    (active
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground")
                  }
                >
                  <span className="font-mono text-foreground">
                    {s.replace("USDT", "")}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {s}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
