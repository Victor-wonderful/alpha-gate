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
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadId = searchParams.get("load");
  const urlSymbol = searchParams.get("symbol");

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
    startTransition(async () => {
      setResult(null);
      const r = await runAnalysisAction(target, style);
      if (r.snapshot && r.strategy && r.report) {
        setResult({ snapshot: r.snapshot, strategy: r.strategy, report: r.report });
      }
      if (r.error) toast.error(r.error);
      else toast.success("분석 완료");
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
          <div className="space-y-2">
            <label
              htmlFor="symbol-input"
              className="text-xs text-muted-foreground"
            >
              분석할 심볼
            </label>
            <SymbolCombobox value={symbol} onChange={setSymbol} />
            <div className="pt-1">
              <div className="mb-1.5 text-[11px] text-muted-foreground">
                자주 쓰는 코인:
              </div>
              <div
                className="flex items-center gap-1.5 overflow-x-auto pb-1.5"
                style={{ scrollbarWidth: "thin" }}
              >
                {PRESETS.map((s) => {
                  const active = symbol.toUpperCase() === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSymbol(s)}
                      className={
                        "shrink-0 rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors " +
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

          <AnalysisTimingHint style={style} />

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
            accountSize={accountSize}
            riskPct={riskPct}
            currency={currency}
            historicalStats={stats}
          />
        </>
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
