"use client";

import { Suspense, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
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
import { AnalysisInfo } from "@/components/analyze/analysis-info";
import { RadarPanel } from "@/components/analyze/radar-panel";
import type { RadarSnapshot } from "@/lib/analysis/radar-persist";
import { kstStringAgo, kstStringToDate, randomKstStringWithin6Months } from "@/lib/analysis/kst";
import { useT } from "@/lib/i18n/context";

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
  radar: RadarSnapshot;
  /** 최근 분석 기록 (서버 컴포넌트) — 우측 컬럼 분석 대상 아래 배치. */
  history?: ReactNode;
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
  radar,
  history,
}: {
  accountSize: number;
  riskPct: number;
  currency: "USD" | "KRW";
  money: import("@/types/trade").MoneyContext;
  radar: RadarSnapshot;
  history?: ReactNode;
}) {
  const t = useT();
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
        toast.success(t("analyze.client.toast.loaded"));
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

  // 숨김 스타일 마이그레이션 — sessionStorage에 남은 position→swing, scalp→day.
  // (position=선물 장기보유 부적합, scalp=지표 기반 무엣지 확정. 둘 다 UI에서 제거됨.)
  useEffect(() => {
    if (hydrated && style === "position") setForm({ style: "swing" });
    else if (hydrated && style === "scalp") setForm({ style: "day" });
  }, [hydrated, style, setForm]);

  // 후보 레이더에서 코인 선택 → 심볼+추천스타일 prefill + 입력창 스크롤/포커스 (수동 실행).
  function pickCandidate(sym: string, pickedStyle: TradingStyle) {
    const target = sym.toUpperCase();
    setForm({ symbol: target, style: pickedStyle });
    if (typeof document !== "undefined") {
      const el = document.getElementById("symbol-input") as HTMLInputElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus({ preventScroll: true });
    }
    toast.success(t("analyze.client.toast.picked", { symbol: target, style: STYLE_PRESETS[pickedStyle].label }));
  }

  function run() {
    const target = symbol.toUpperCase().trim();
    if (!target) {
      toast.error(t("analyze.client.toast.symbolRequired"));
      return;
    }
    // 백테스트 모드 검증
    let atIso: string | undefined;
    if (mode === "backtest") {
      if (!historicalAtKst) {
        toast.error(t("analyze.client.toast.backtestTimeRequired"));
        return;
      }
      const d = kstStringToDate(historicalAtKst);
      if (isNaN(d.getTime())) {
        toast.error(t("analyze.client.toast.backtestTimeInvalid"));
        return;
      }
      if (d.getTime() > Date.now() - 60 * 60 * 1000) {
        toast.error(t("analyze.client.toast.backtestTimeTooRecent"));
        return;
      }
      // Binance 무료 API는 6개월 한도
      if (d.getTime() < Date.now() - 200 * 24 * 60 * 60 * 1000) {
        toast.error(t("analyze.client.toast.backtestTimeTooOld"));
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
      else toast.success(mode === "backtest" ? t("analyze.client.toast.backtestDone") : t("analyze.client.toast.done"));
    });
  }

  function clearResult() {
    clearStore();
    toast.success(t("analyze.client.toast.cleared"));
  }

  const isBacktest = mode === "backtest";

  return (
    <div className="space-y-6">
      <AnalysisInfo />

      {/* 좌: 후보 레이더(스타일·타이밍·스펙 통합) / 우: 분석 대상 — 넓은 화면 좌우, 좁으면 세로 스택.
          items-start 없음 = 두 컬럼 stretch → 우측 기록 카드(flex-1)가 레이더 하단선까지 채움 */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <RadarPanel initial={radar} style={style} onStyleChange={setStyle} onPick={pickCandidate} />

        {/* 우측 컬럼 — 분석 대상(자연 높이) + 최근 분석 기록(flex-1로 남는 높이 채움 → 하단 정렬) */}
        <div className="flex min-w-0 flex-col gap-5">
        <Card className="flex flex-col">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>{t("analyze.client.targetTitle")}</CardTitle>
            <div className="flex rounded-full border border-border bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setForm({ mode: "live", historicalAtKst: null })}
                className={
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                  (!isBacktest
                    ? "bg-grade-a/15 text-grade-a"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {t("analyze.client.modeLive")}
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm({ mode: "backtest", historicalAtKst: historicalAtKst ?? kstStringAgo({ days: 7 }) })
                }
                className={
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                  (isBacktest
                    ? "bg-grade-c/15 text-grade-c"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {t("analyze.client.modeBacktest")}
              </button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
              <div className="space-y-2">
                <label
                  htmlFor="symbol-input"
                  className="text-sm font-medium text-muted-foreground"
                >
                  {t("analyze.client.symbolLabel")}
                </label>
                <SymbolCombobox value={symbol} onChange={setSymbol} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium text-muted-foreground">
                    {t("analyze.client.fundsRiskLabel")}
                  </label>
                  {(accountSizeOverride !== null || riskPctOverride !== null) ? (
                    <button
                      type="button"
                      onClick={() => setForm({ accountSizeOverride: null, riskPctOverride: null })}
                      className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      {t("analyze.client.reset")}
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
                    placeholder={t("analyze.client.accountPlaceholder", { default: accountSize.toLocaleString() })}
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
                    placeholder={t("analyze.client.riskPlaceholder")}
                    className="font-mono"
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {riskPctOverride !== null ? (
                    <>
                      {t("analyze.client.appliedFixed.pre")} <span className="font-mono text-foreground">${effectiveAccountSize.toLocaleString()}</span> {t("analyze.client.appliedFixed.times")} <span className="font-mono text-foreground">{riskPctOverride}%</span> {t("analyze.client.appliedFixed.perTrade")} <span className="font-mono text-foreground">${(effectiveAccountSize * riskPctOverride / 100).toLocaleString()}</span> {t("analyze.client.appliedFixed.post")}
                    </>
                  ) : (
                    <>
                      {t("analyze.client.appliedAuto.pre")} <span className="font-mono text-foreground">${effectiveAccountSize.toLocaleString()}</span> {t("analyze.client.appliedAuto.mid")} <span className="text-primary font-medium">{t("analyze.client.appliedAuto.highlight")}</span>{t("analyze.client.appliedAuto.post")}
                    </>
                  )}
                </div>
              </div>

              {isBacktest ? (
                <BacktestPicker
                  historicalAtKst={historicalAtKst}
                  onHistoricalChange={(v) => setForm({ historicalAtKst: v })}
                />
              ) : null}

              <div className="mt-auto space-y-2">
                <Button onClick={run} disabled={pending} size="lg" className="w-full">
                  {pending ? t("analyze.client.runPending") : t("analyze.client.run")}
                </Button>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t("analyze.client.runNote")}
                </p>
              </div>
          </CardContent>
        </Card>
        <div className="min-h-0 flex-1">{history}</div>
        </div>
      </div>

      {pending ? (
        <Card>
          <CardContent className="flex items-center justify-center p-12 text-sm text-muted-foreground">
            {t("analyze.client.collectingAnalyzing")}
          </CardContent>
        </Card>
      ) : null}

      {loadingFromHistory ? (
        <Card>
          <CardContent className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            {t("analyze.client.loadingSaved")}
          </CardContent>
        </Card>
      ) : null}

      {hydrated && result ? (
        <>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-4 py-2.5 text-xs">
            <span className="flex items-center gap-2 text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              {t("analyze.client.savedBanner", {
                symbol: result.snapshot.symbol,
                time: new Date(result.snapshot.generatedAt).toLocaleString("ko-KR", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })}
            </span>
            <button
              type="button"
              onClick={clearResult}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("analyze.client.clearResult")}
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

/** 백테스트 기준 시각 — KST datetime 피커 + 빠른 선택 (토글은 카드 헤더의 세그먼트) */
function BacktestPicker({
  historicalAtKst,
  onHistoricalChange,
}: {
  historicalAtKst: string | null;
  onHistoricalChange: (v: string) => void;
}) {
  const t = useT();
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-medium text-amber-300">
              {t("analyze.client.backtest.timeLabel")}
            </label>
            <span className="text-[10px] text-muted-foreground">
              {t("analyze.client.backtest.sixMonthLimit")}
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
              { label: t("analyze.client.backtest.quick.1d"), v: kstStringAgo({ days: 1 }) },
              { label: t("analyze.client.backtest.quick.3d"), v: kstStringAgo({ days: 3 }) },
              { label: t("analyze.client.backtest.quick.1w"), v: kstStringAgo({ days: 7 }) },
              { label: t("analyze.client.backtest.quick.1m"), v: kstStringAgo({ days: 30 }) },
              { label: t("analyze.client.backtest.quick.3m"), v: kstStringAgo({ days: 90 }) },
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
              title={t("analyze.client.backtest.randomTitle")}
            >
              {t("analyze.client.backtest.random")}
            </button>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {t("analyze.client.backtest.note.pre")}<strong>{t("analyze.client.backtest.note.klineOnly")}</strong>{t("analyze.client.backtest.note.post")}
          </div>
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
  const t = useT();
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
          placeholder={t("analyze.client.symbolPlaceholder")}
          className="rounded-r-none font-mono"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-10 items-center justify-center rounded-r-md border border-l-0 border-input bg-background px-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("analyze.client.coinListAria")}
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
              {t("analyze.client.noMatch")}
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
