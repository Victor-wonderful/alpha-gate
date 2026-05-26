"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Clock,
  RefreshCw,
  Target,
  Lightbulb,
  ChevronDown,
  Info,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { gradeTrade } from "@/lib/grading";
import { sizePosition } from "@/lib/sizing";
import { GradeBadge } from "@/components/trade/grade-badge";
import { ScenarioChart } from "@/components/analyze/scenario-chart";
import { ChartErrorBoundary } from "@/components/analyze/chart-error-boundary";
import { DownloadButtons } from "@/components/analyze/download-buttons";
import { SpecialSignalCard } from "@/components/analyze/special-signal-card";
import type { AnalysisSnapshot } from "@/lib/analysis/analyze";
import type { AnalysisReport } from "@/lib/analysis/synthesize";
import {
  STRATEGY_DESCRIPTIONS,
  STRATEGY_LABELS,
  type StrategyResult,
} from "@/lib/analysis/strategy";
import {
  checkRR,
  checkRiskPct,
  checkStop,
  checkTarget,
  effectiveRR,
  type CheckStatus,
} from "@/lib/analysis/standards";
import type { TradingStyle } from "@/lib/analysis/style";
import {
  MARKET_CHECK_KEYS,
  MARKET_CHECK_LABELS,
  TRIGGER_CHECK_KEYS,
  type MarketCheckKey,
  type TradeInput,
} from "@/types/trade";

const GRADE_TEXT: Record<"A" | "B" | "C" | "D", string> = {
  A: "좋은 거래",
  B: "조건부 진입",
  C: "비추천",
  D: "거래 금지",
};

function tradeFormHref(symbol: string, scenario: AnalysisReport["scenarios"][number], scenarioIdx?: number) {
  let entry: number;
  if (scenario.entries && scenario.entries.length > 0) {
    const wSum = scenario.entries.reduce((acc, e) => acc + (e.weight || 0), 0);
    entry = wSum > 0
      ? scenario.entries.reduce((acc, e) => acc + e.price * (e.weight / wSum), 0)
      : scenario.entries.reduce((acc, e) => acc + e.price, 0) / scenario.entries.length;
  } else {
    entry = (scenario.entryZone.low + scenario.entryZone.high) / 2;
  }
  const p = new URLSearchParams({
    symbol,
    direction: scenario.direction,
    entry: entry.toString(),
    stop: scenario.invalidation.toString(),
    target: scenario.target.toString(),
    trigger: scenario.trigger,
  });
  if (scenarioIdx !== undefined) p.set("scenario", String(scenarioIdx));
  for (const key of MARKET_CHECK_KEYS) {
    if (scenario.marketAssessment[key]) p.set(`m_${key}`, "1");
  }
  return `/app/trade?${p.toString()}`;
}

function evaluateScenario(
  symbol: string,
  scenario: AnalysisReport["scenarios"][number],
  accountSize: number,
  riskPct: number,
  mtfTimeframe: TradeInput["timeframe"],
) {
  // Prefer weighted-average from tiered entries; fall back to entryZone midpoint.
  let entry: number;
  if (scenario.entries && scenario.entries.length > 0) {
    const wSum = scenario.entries.reduce((acc, e) => acc + (e.weight || 0), 0);
    if (wSum > 0) {
      entry = scenario.entries.reduce((acc, e) => acc + e.price * (e.weight / wSum), 0);
    } else {
      entry = scenario.entries.reduce((acc, e) => acc + e.price, 0) / scenario.entries.length;
    }
  } else {
    entry = (scenario.entryZone.low + scenario.entryZone.high) / 2;
  }
  // 분석 페이지의 빠른 등급 미리보기 — 트리거/자금/시장 컨텍스트는 낙관적 기본값으로 계산.
  // 실제 등급은 거래 평가 페이지에서 사용자 입력 + 서버 fetch로 다시 계산됨.
  const trigger = Object.fromEntries(TRIGGER_CHECK_KEYS.map((k) => [k, true])) as TradeInput["trigger"];
  const input: TradeInput = {
    symbol,
    direction: scenario.direction,
    timeframe: mtfTimeframe,
    entry,
    stop: scenario.invalidation,
    target: scenario.target,
    accountSize,
    allowedLossPct: riskPct,
    market: scenario.marketAssessment,
    trigger,
    money: { todayCumulativeR: 0, todayClosedCount: 0, openPositions: [], openExposurePct: 0 },
    marketCtx: { btcPrice: null, btc24hChangePct: null, symbolPrice: null, fundingRate: null, minutesToFunding: null },
  };
  const grade = gradeTrade(input);
  const sizing = sizePosition({
    accountSize,
    allowedLossPct: riskPct,
    entry,
    stop: scenario.invalidation,
  });
  return { entry, grade, sizing };
}

export function AnalysisResult({
  snapshot,
  strategy,
  report,
  accountSize,
  riskPct,
  currency,
  historicalStats,
  analysisId,
}: {
  snapshot: AnalysisSnapshot;
  strategy: StrategyResult;
  report: AnalysisReport;
  accountSize: number;
  riskPct: number;
  currency: "USD" | "KRW";
  historicalStats?: import("@/lib/analysis/scenario-stats").ScenarioStats | null;
  analysisId?: string;
}) {
  const [activeScenario, setActiveScenario] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [watchStates, setWatchStates] = useState<Record<number, { id: string; watch: boolean; status: string }>>({});

  // 시나리오 알림 등록 상태 조회
  useEffect(() => {
    if (!analysisId) return;
    let cancelled = false;
    import("./_actions").then(({ loadScenarioWatchStatesAction }) => {
      loadScenarioWatchStatesAction(analysisId).then((r) => {
        if (!cancelled && r.states) setWatchStates(r.states);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [analysisId]);

  async function toggleWatch(scenarioIndex: number) {
    const entry = watchStates[scenarioIndex];
    if (!entry) {
      // 아직 scenario_outcomes 에 등록 안 됨 (저장 직후 race) — 잠시 후 다시 시도
      toast.info("시나리오가 아직 등록 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const newWatch = !entry.watch;
    const optimisticStates = { ...watchStates, [scenarioIndex]: { ...entry, watch: newWatch } };
    setWatchStates(optimisticStates);
    const { toggleScenarioWatchAction } = await import("./_actions");
    const r = await toggleScenarioWatchAction({ scenarioId: entry.id, watch: newWatch });
    if (r.error) {
      // rollback
      setWatchStates(watchStates);
      toast.error(r.error);
    } else {
      toast.success(newWatch ? "🔔 알림 등록됨 — 가격 도달 시 Telegram/Discord 발송" : "알림 해제됨");
    }
  }
  const captureRef = useRef<HTMLDivElement>(null);
  const [elapsedSec, setElapsedSec] = useState(() =>
    Math.floor((Date.now() - new Date(snapshot.generatedAt).getTime()) / 1000),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - new Date(snapshot.generatedAt).getTime()) / 1000));
    }, 15_000);
    return () => clearInterval(id);
  }, [snapshot.generatedAt]);
  const generatedKst = new Date(snapshot.generatedAt).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const isStale = elapsedSec >= 5 * 60;

  // Map LTF to TradeInput["timeframe"]
  const ltf = snapshot.multiTf.find((t) => t.role === "LTF")?.tf ?? "1h";
  const tfMap: Record<string, TradeInput["timeframe"]> = {
    "5m": "15m",
    "15m": "15m",
    "1h": "1h",
    "4h": "4h",
    "1d": "1D",
  };
  const scTimeframe = tfMap[ltf] ?? "1h";

  return (
    <div className="space-y-6">
      <DownloadButtons
        snapshot={snapshot}
        strategy={strategy}
        report={report}
        captureRef={captureRef}
      />
      <div ref={captureRef} className="space-y-6">
      {isStale ? (
        <div className="flex items-start gap-2 rounded-md border border-grade-c/40 bg-grade-c/10 p-3 text-sm text-grade-c">
          <RefreshCw className="mt-0.5 h-4 w-4 flex-none" />
          <div>
            <div className="font-semibold">데이터가 오래됐습니다</div>
            <div className="text-xs">
              {formatElapsed(elapsedSec)} 경과. 다시 분석하는 것을 권장합니다.
            </div>
          </div>
        </div>
      ) : null}

      {/* Header — simplified */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-3">
              <CardTitle className="text-xl">{snapshot.symbol}</CardTitle>
              <span className="font-mono text-2xl font-bold">
                ${formatNumber(snapshot.ticker.last)}
              </span>
              <span
                className={cn(
                  "font-mono text-sm font-medium",
                  snapshot.ticker.change24hPct >= 0 ? "text-grade-a" : "text-grade-d",
                )}
              >
                {snapshot.ticker.change24hPct >= 0 ? "+" : ""}
                {snapshot.ticker.change24hPct.toFixed(2)}%
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{generatedKst} · {formatElapsed(elapsedSec)} 전</span>
              <span>·</span>
              <a
                href={`https://www.binance.com/en/futures/${snapshot.symbol}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                Binance에서 확인 →
              </a>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Market trend snapshot */}
      {report.marketTrend ? <MarketTrendCard trend={report.marketTrend} metrics={snapshot.trendMetrics} dominance={snapshot.macro.dominanceRegime ?? null} /> : null}

      {/* Big AI recommendation card — what to do now */}
      <SimpleRecommendation strategy={strategy} report={report} historicalStats={historicalStats} />

      {/* Special strategy signal evidence (rendered for any special strategy active across scenarios) */}
      <SpecialSignalCard
        snapshot={snapshot}
        strategy={strategy}
        scenarioHints={report.scenarios.map((s) => s.strategyHint)}
      />

      {/* Chart visualization */}
      {report.scenarios.length > 0 ? (
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">차트로 보기</CardTitle>
              {report.scenarios.length > 1 ? (
                <div className="flex flex-wrap gap-1">
                  {report.scenarios.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveScenario(i)}
                      title={s.name}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                        activeScenario === i
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background/40 text-muted-foreground hover:bg-accent/40",
                      )}
                    >
                      {String.fromCharCode(65 + i)} · {s.direction === "long" ? "롱" : "숏"}
                      {i === 0 ? (
                        <span className="ml-1 rounded bg-primary/20 px-1 py-0 text-[9px] uppercase tracking-wider text-primary">
                          메인
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <ScenarioExplainer scenarios={report.scenarios} active={activeScenario} />
          </CardHeader>
          <CardContent>
            <ChartErrorBoundary
              fallback={
                <div className="flex h-[480px] items-center justify-center rounded-md border border-border bg-card/30 text-sm text-muted-foreground">
                  차트를 다시 그리는 중...
                </div>
              }
            >
              <ScenarioChart
                snapshot={snapshot}
                report={report}
                scenarioIndex={activeScenario}
              />
            </ChartErrorBoundary>
          </CardContent>
        </Card>
      ) : null}

      {/* Simple scenario cards */}
      {report.scenarios.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <AlertTriangle className="h-7 w-7 text-grade-c" />
            <div className="text-lg font-semibold">지금 진입하지 마세요</div>
            <p className="max-w-md text-sm text-muted-foreground">
              AI가 보기에 지금은 매매 우위가 없습니다. 시장이 정리될 때까지 기다리세요.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {report.scenarios.map((s, i) => {
            const { entry, grade, sizing } = evaluateScenario(
              snapshot.symbol,
              s,
              accountSize,
              riskPct,
              scTimeframe,
            );
            return (
              <SimpleScenarioCard
                key={i}
                index={i}
                symbol={snapshot.symbol}
                style={snapshot.style}
                currentPrice={snapshot.ticker.last}
                mtfAtrPct={snapshot.atr?.find((a) => a.role === "MTF")?.pctOfPrice}
                scenario={s}
                strategy={strategy}
                entry={entry}
                grade={grade}
                sizing={sizing}
                accountSize={accountSize}
                riskPct={riskPct}
                currency={currency}
                isActive={activeScenario === i}
                onHover={() => setActiveScenario(i)}
                watchState={watchStates[i] ?? null}
                onToggleWatch={() => toggleWatch(i)}
              />
            );
          })}
        </div>
      )}

      {/* Advanced info — collapsed */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-card/40 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/30"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <Target className="h-4 w-4" />
            전문가 정보 보기
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              showAdvanced && "rotate-180",
            )}
          />
        </button>

        {showAdvanced ? (
          <div className="mt-4 space-y-4">
            <StrategyBanner strategy={strategy} />

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">시장 구조</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="큰 시간대 (1D/4H)" value={report.structure.htf} />
                  <Row label="작은 시간대 (1H/15M)" value={report.structure.ltf} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">핵심 가격대</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {report.keyLevels.map((k, i) => (
                      <li
                        key={i}
                        className="flex items-start justify-between gap-3 border-b border-border/40 pb-2 last:border-b-0"
                      >
                        <div>
                          <div className="font-semibold">{k.label}</div>
                          <div className="text-xs text-muted-foreground">{k.note}</div>
                        </div>
                        <div className="font-mono">${formatNumber(k.price)}</div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">시장 상태</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row
                    label="최근 매수 비율"
                    value={`${(snapshot.flow1m.buyRatio * 100).toFixed(1)}%`}
                  />
                  <Row label="펀딩비" value={snapshot.funding.bias} />
                  {snapshot.macro.btcDominance != null ? (
                    <Row label="BTC 도미넌스" value={`${snapshot.macro.btcDominance.toFixed(2)}%`} />
                  ) : null}
                  <div className="border-t border-border pt-2 text-xs text-muted-foreground">
                    {report.flow.note}
                  </div>
                </CardContent>
              </Card>

              {report.warnings.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">주의 사항</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      {report.warnings.map((w, i) => (
                        <li key={i} className="flex gap-2 text-grade-c">
                          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}
            </div>

            {/* Detailed scenario panel (with full checklist + grade actions) */}
            {report.scenarios.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">시나리오 상세 (체크리스트 + 점수)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {report.scenarios.map((s, i) => {
                    const { entry, grade } = evaluateScenario(
                      snapshot.symbol,
                      s,
                      accountSize,
                      riskPct,
                      scTimeframe,
                    );
                    return (
                      <div key={i} className="space-y-2 rounded-md border border-border bg-background/30 p-3 text-xs">
                        <div className="flex items-center gap-2">
                          <GradeBadge grade={grade.grade} size="sm" />
                          <span className="font-semibold">
                            {String.fromCharCode(65 + i)} · {s.direction === "long" ? "롱" : "숏"} · {s.name}
                          </span>
                          <span className="ml-auto text-muted-foreground">손익비 {grade.rr.toFixed(2)}R · {grade.score}점</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                          {MARKET_CHECK_KEYS.map((k: MarketCheckKey) => (
                            <span
                              key={k}
                              className={cn(
                                "flex items-center gap-1.5",
                                s.marketAssessment[k]
                                  ? "text-grade-a"
                                  : "text-muted-foreground",
                              )}
                            >
                              <span
                                className="inline-block h-1.5 w-1.5 rounded-full"
                                style={{
                                  background: s.marketAssessment[k]
                                    ? "currentColor"
                                    : "hsl(var(--border))",
                                }}
                              />
                              {MARKET_CHECK_LABELS[k]}
                            </span>
                          ))}
                        </div>
                        {grade.actions.length > 0 && grade.grade !== "A" ? (
                          <ul className="space-y-0.5 border-t border-border/60 pt-2 text-muted-foreground">
                            {grade.actions.slice(0, 2).map((a, idx) => (
                              <li key={idx}>· {a}</li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="text-muted-foreground">진입 중간값 ${formatNumber(entry)}</div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        본 분석은 투자 자문이 아닙니다. 모든 거래 결정과 결과는 사용자 본인의 책임입니다.
      </p>
      </div>
    </div>
  );
}

/** Market trend snapshot card — direction + strength */
function MarketTrendCard({
  trend,
  metrics,
  dominance,
}: {
  trend: NonNullable<AnalysisReport["marketTrend"]>;
  metrics?: AnalysisSnapshot["trendMetrics"];
  dominance?: NonNullable<AnalysisSnapshot["macro"]>["dominanceRegime"];
}) {
  const dirMap = {
    up: { label: "상승 추세", color: "text-grade-a", bg: "bg-grade-a/10", border: "border-grade-a/30", icon: TrendingUp },
    down: { label: "하락 추세", color: "text-grade-d", bg: "bg-grade-d/10", border: "border-grade-d/30", icon: TrendingDown },
    range: { label: "횡보", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border", icon: ArrowRight },
  } as const;
  const strengthMap = { strong: "강함", moderate: "보통", weak: "약함" } as const;
  const d = dirMap[trend.direction] ?? dirMap.range;
  const Icon = d.icon;
  return (
    <Card className={cn("border", d.border, d.bg)}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn("flex h-10 w-10 flex-none items-center justify-center rounded-md", d.bg, d.color)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">현재 추세</span>
              <span className={cn("text-base font-semibold", d.color)}>{d.label}</span>
              <Badge className={cn("border", d.border, d.color, d.bg)}>강도 {strengthMap[trend.strength] ?? trend.strength}</Badge>
            </div>
            <p className="mt-1 text-sm text-foreground/80">{trend.note}</p>
            {metrics ? (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <TrendIndicator
                    name="ADX"
                    citation="Wilder 1978"
                    value={metrics.adx ? metrics.adx.value.toFixed(1) : "—"}
                    verdict={metrics.adx?.verdict}
                    thresholdLabel="≥25 추세 / <20 횡보"
                    extra={metrics.adx ? `+DI ${metrics.adx.plusDI.toFixed(1)} / −DI ${metrics.adx.minusDI.toFixed(1)}` : undefined}
                  />
                  <TrendIndicator
                    name="KER"
                    citation="Kaufman 1995"
                    value={metrics.ker ? metrics.ker.value.toFixed(2) : "—"}
                    verdict={metrics.ker?.verdict}
                    thresholdLabel="≥0.6 추세 / <0.3 노이즈"
                  />
                  <TrendIndicator
                    name="Choppiness"
                    citation="Dreiss"
                    value={metrics.choppiness ? metrics.choppiness.value.toFixed(1) : "—"}
                    verdict={metrics.choppiness?.verdict}
                    thresholdLabel="<38.2 추세 / >61.8 혼조"
                  />
                </div>
                <div className="text-[10px] text-muted-foreground">
                  3개 지표 다수결 → 추세 {metrics.trendVotes}표 · 횡보 {metrics.rangeVotes}표
                  {" · "}기준 TF {metrics.refTf}
                </div>
              </div>
            ) : null}
            {dominance ? (
              <div className="mt-3 rounded border border-border/60 bg-background/40 p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">시장 국면</span>
                  <Badge className={cn(
                    "border",
                    dominance.regime === "alt_season" || dominance.regime === "risk_on" ? "border-grade-a/40 bg-grade-a/10 text-grade-a"
                    : dominance.regime === "alt_panic" || dominance.regime === "risk_off" ? "border-grade-d/40 bg-grade-d/10 text-grade-d"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-400",
                  )}>
                    {dominance.label}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{dominance.note}</p>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrendIndicator({
  name,
  citation,
  value,
  verdict,
  thresholdLabel,
  extra,
}: {
  name: string;
  citation: string;
  value: string;
  verdict?: "trend" | "developing" | "mixed" | "range";
  thresholdLabel: string;
  extra?: string;
}) {
  const tone =
    verdict === "trend"
      ? "border-grade-a/40 bg-grade-a/10 text-grade-a"
      : verdict === "range"
        ? "border-muted-foreground/40 bg-muted/30 text-muted-foreground"
        : "border-amber-500/40 bg-amber-500/10 text-amber-400";
  const verdictLabel =
    verdict === "trend"
      ? "추세"
      : verdict === "range"
        ? "횡보"
        : verdict === "mixed"
          ? "혼조"
          : verdict === "developing"
            ? "약함"
            : "—";
  return (
    <div className="rounded border border-border/60 bg-background/40 p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider">{name}</span>
        <span className="text-[9px] text-muted-foreground">{citation}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-lg font-bold tabular-nums">{value}</span>
        <Badge className={cn("border text-[10px]", tone)}>{verdictLabel}</Badge>
      </div>
      {extra ? <div className="mt-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">{extra}</div> : null}
      <div className="mt-1 text-[10px] text-muted-foreground">{thresholdLabel}</div>
    </div>
  );
}

/** Big plain-language recommendation card at the top */
function SimpleRecommendation({
  strategy,
  report,
  historicalStats,
}: {
  strategy: StrategyResult;
  report: AnalysisReport;
  historicalStats?: import("@/lib/analysis/scenario-stats").ScenarioStats | null;
}) {
  const isWait = strategy.primary === "wait";
  const accentClass = isWait
    ? "from-grade-c/15 to-card"
    : strategy.direction === "short"
      ? "from-grade-d/10 to-card"
      : "from-primary/10 to-card";
  const dotClass = isWait
    ? "bg-grade-c"
    : strategy.direction === "short"
      ? "bg-grade-d"
      : "bg-primary";

  return (
    <Card className={cn("overflow-hidden bg-gradient-to-br", accentClass)}>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <span className={cn("inline-block h-1.5 w-1.5 animate-pulse rounded-full", dotClass)} />
          AI 추천
        </div>
        <h2 className="mt-3 text-xl font-bold leading-snug sm:text-2xl">{report.actionNow}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{report.summary}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <Badge
            className={cn(
              "border",
              isWait
                ? "border-grade-c/40 bg-grade-c/10 text-grade-c"
                : strategy.direction === "short"
                  ? "border-grade-d/40 bg-grade-d/10 text-grade-d"
                  : "border-primary/40 bg-primary/10 text-primary",
            )}
          >
            {STRATEGY_LABELS[strategy.primary]}
            {strategy.direction
              ? ` · ${strategy.direction === "long" ? "롱" : "숏"}`
              : ""}
          </Badge>
          <span className="text-muted-foreground">
            AI 자신감 <span className="font-mono">{Math.round(strategy.confidence * 100)}%</span>
          </span>
          {historicalStats && historicalStats.target + historicalStats.stop >= 3 ? (
            <span className="text-muted-foreground border-l border-border/40 pl-3 ml-1">
              과거 적중률{" "}
              <span
                className={cn(
                  "font-mono font-semibold",
                  historicalStats.winRate >= 0.6
                    ? "text-grade-a"
                    : historicalStats.winRate >= 0.4
                      ? "text-grade-b"
                      : "text-grade-d",
                )}
              >
                {Math.round(historicalStats.winRate * 100)}%
              </span>
              <span className="text-[10px] ml-1">
                ({historicalStats.target}승 {historicalStats.stop}패
                {historicalStats.avgR !== 0
                  ? `, ${historicalStats.avgR >= 0 ? "+" : ""}${historicalStats.avgR.toFixed(2)}R`
                  : ""}
                )
              </span>
            </span>
          ) : historicalStats && historicalStats.total > 0 ? (
            <span className="text-[10px] text-muted-foreground border-l border-border/40 pl-3 ml-1">
              과거 표본 {historicalStats.total}개 (결정 {historicalStats.target + historicalStats.stop}개, 부족)
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Plain-language scenario card */
function SimpleScenarioCard({
  index,
  symbol,
  style,
  currentPrice,
  mtfAtrPct,
  scenario,
  strategy,
  entry,
  grade,
  sizing,
  accountSize,
  riskPct,
  currency,
  isActive,
  onHover,
  watchState,
  onToggleWatch,
}: {
  index: number;
  symbol: string;
  style: TradingStyle;
  currentPrice: number;
  mtfAtrPct?: number;
  scenario: AnalysisReport["scenarios"][number];
  strategy: StrategyResult;
  entry: number;
  grade: ReturnType<typeof gradeTrade>;
  sizing: ReturnType<typeof sizePosition>;
  accountSize: number;
  riskPct: number;
  currency: "USD" | "KRW";
  isActive: boolean;
  onHover: () => void;
  watchState?: { id: string; watch: boolean; status: string } | null;
  onToggleWatch?: () => void;
}) {
  const isLong = scenario.direction === "long";
  const stopPct = (Math.abs(entry - scenario.invalidation) / entry) * 100;
  const targetPct = (Math.abs(scenario.target - entry) / entry) * 100;
  // Round-trip taker fee (Binance USDT-M 0.04% × 2). 슬리피지는 체결가에 별도 반영.
  const ROUND_TRIP = 0.08;
  const netStopPct = stopPct + ROUND_TRIP;
  const netTargetPct = Math.max(0, targetPct - ROUND_TRIP);
  const netRR = netStopPct === 0 ? 0 : netTargetPct / netStopPct;
  const positionPctOfAccount = sizing.valid
    ? (sizing.positionSize / accountSize) * 100
    : 0;
  const effRR = effectiveRR(entry, scenario.invalidation, scenario.target);
  const effectiveStrategy = scenario.strategyHint ?? strategy.primary;
  const stopCheck = checkStop(stopPct, style, effectiveStrategy);
  const targetCheck = checkTarget(targetPct, style, effectiveStrategy);
  const rrCheck = checkRR(grade.rr, style, effectiveStrategy);
  const riskCheck = checkRiskPct(riskPct);
  const allChecks = [stopCheck, targetCheck, rrCheck, riskCheck];
  const entryVsCurrentPct = ((entry - currentPrice) / currentPrice) * 100;

  return (
    <Card
      onMouseEnter={onHover}
      className={cn(
        "overflow-hidden transition-colors",
        isActive && "border-primary/40",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          isLong ? "bg-grade-a" : "bg-grade-d",
        )}
      />

      <div className="space-y-5 p-5 pl-6">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-md text-white",
              isLong ? "bg-grade-a" : "bg-grade-d",
            )}
          >
            {isLong ? (
              <TrendingUp className="h-5 w-5" />
            ) : (
              <TrendingDown className="h-5 w-5" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                시나리오 {String.fromCharCode(65 + index)}
              </span>
              <Badge
                className={cn(
                  "border",
                  isLong
                    ? "border-grade-a/40 bg-grade-a/10 text-grade-a"
                    : "border-grade-d/40 bg-grade-d/10 text-grade-d",
                )}
              >
                {isLong ? "사기 (롱)" : "팔기 (숏)"}
              </Badge>
              {(() => {
                const absDist = Math.abs(entryVsCurrentPct);
                // Color tone by distance — closer = green, mid = amber, far = red-ish
                const tone =
                  absDist < 0.5
                    ? "border-grade-a/40 bg-grade-a/10 text-grade-a"
                    : absDist < 3
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                      : "border-grade-d/40 bg-grade-d/10 text-grade-d";
                const typeLabel =
                  scenario.entryType === "pending"
                    ? "도달 대기"
                    : scenario.entryType === "immediate"
                      ? "지금 진입"
                      : "진입";
                return (
                  <Badge className={cn("border px-2 py-0.5 text-[11px] font-bold", tone)}>
                    {typeLabel} · 진입까지 {entryVsCurrentPct >= 0 ? "+" : ""}
                    {entryVsCurrentPct.toFixed(2)}%
                  </Badge>
                );
              })()}
              {(() => {
                const sid = scenario.strategyHint ?? strategy.primary;
                const isAlt = scenario.strategyHint && scenario.strategyHint !== strategy.primary;
                return (
                  <Badge
                    title={STRATEGY_DESCRIPTIONS[sid]}
                    className={cn(
                      "border",
                      isAlt
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                        : "border-primary/30 bg-primary/5 text-primary",
                    )}
                  >
                    <Sparkles className="mr-1 h-3 w-3" />
                    {STRATEGY_LABELS[sid]}
                    {isAlt ? <span className="ml-1 text-[9px] uppercase opacity-70">보조</span> : null}
                  </Badge>
                );
              })()}
            </div>
            <h3 className="mt-1 text-base font-semibold">{scenario.name}</h3>
          </div>
          <div className="flex items-center gap-2">
            <GradeBadge grade={grade.grade} size="sm" />
            <div className="text-right">
              <div className="text-xs text-muted-foreground">매매 등급</div>
              <div className="text-sm font-semibold">{GRADE_TEXT[grade.grade]}</div>
            </div>
            {onToggleWatch && watchState !== undefined ? (
              <button
                type="button"
                onClick={onToggleWatch}
                disabled={!watchState}
                title={
                  watchState?.watch
                    ? "알림 해제 (가격 도달 알림 받지 않음)"
                    : "알림 등록 (entry/target/stop 도달 시 Telegram/Discord 발송)"
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors",
                  watchState?.watch
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  !watchState && "opacity-50 cursor-not-allowed",
                )}
              >
                <span>{watchState?.watch ? "🔔" : "🔕"}</span>
                <span>{watchState?.watch ? "알림 등록됨" : "알림 등록"}</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* When to enter */}
        <div className="rounded-lg border border-border bg-background/40 p-4">
          <div className="flex items-start gap-2">
            <Lightbulb className="mt-0.5 h-4 w-4 flex-none text-primary" />
            <div className="text-sm">
              <span className="font-semibold">언제: </span>
              <span className="text-foreground">{scenario.trigger}</span>
            </div>
          </div>
        </div>

        {/* Quality issues — soft warnings, let trader decide */}
        {scenario.qualityIssues && scenario.qualityIssues.length > 0 ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              검토 항목 — 표준 미달 (진입 전 본인 판단)
            </div>
            <ul className="space-y-0.5 text-[11px] text-amber-300/80">
              {scenario.qualityIssues.map((q, qi) => (
                <li key={qi}>· {q}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Tiered entry plan — if entries provided, show layered scale-in */}
        {scenario.entries && scenario.entries.length > 0 ? (
          <div className="space-y-1.5">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {isLong ? "분할 매수 계획" : "분할 매도 계획"}
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-background/40">
              {scenario.entries.map((e, ei) => {
                const dist = e.distancePct ?? ((e.price - currentPrice) / currentPrice) * 100;
                const tierColor = ei === 0 ? "text-primary" : ei === 1 ? "text-foreground" : "text-muted-foreground";
                return (
                  <div
                    key={e.tier}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 text-sm",
                      ei > 0 && "border-t border-border/50",
                    )}
                  >
                    <span className={cn("flex h-6 w-6 flex-none items-center justify-center rounded text-xs font-bold", tierColor, ei === 0 ? "bg-primary/15" : "bg-muted/40")}>
                      {e.tier}
                    </span>
                    <span className="flex-1 truncate text-xs text-muted-foreground">{e.label} · {e.note}</span>
                    <span className="font-mono font-semibold tabular-nums">${formatNumber(e.price)}</span>
                    <span className="w-16 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {dist >= 0 ? "+" : ""}{dist.toFixed(2)}%
                    </span>
                    <Badge className="border border-border bg-muted/40 text-[10px] text-foreground">
                      {e.weight}%
                    </Badge>
                  </div>
                );
              })}
            </div>
            <div className="text-[10px] text-muted-foreground">
              평균 진입가는 단계별 가격 × 비중. 손절·목표는 아래 공유.
            </div>
          </div>
        ) : null}

        {/* Stop / target row */}
        <div className="grid grid-cols-3 gap-2">
          <BigNumber
            color="primary"
            label={scenario.entries && scenario.entries.length > 0 ? "평균 진입가" : isLong ? "사는 가격" : "파는 가격"}
            value={`$${formatNumber(entry)}`}
            sub={
              Math.abs(entryVsCurrentPct) < 0.05
                ? "현재가"
                : `현재가 ${entryVsCurrentPct >= 0 ? "+" : ""}${entryVsCurrentPct.toFixed(2)}%`
            }
            sub2=""
          />
          <BigNumber
            color="grade-d"
            label="손절"
            value={`$${formatNumber(scenario.invalidation)}`}
            sub={`실현 -${netStopPct.toFixed(2)}%`}
            sub2={`(정가 -${stopPct.toFixed(2)}% + 수수료)`}
          />
          <BigNumber
            color="grade-a"
            label="목표"
            value={`$${formatNumber(scenario.target)}`}
            sub={`실현 +${netTargetPct.toFixed(2)}% (${netRR.toFixed(1)}배)`}
            sub2={`(정가 +${targetPct.toFixed(2)}% − 수수료)`}
          />
        </div>
        <div className="-mt-1 text-[10px] text-muted-foreground">
          ※ "실현"은 왕복 수수료 0.08% (Binance Taker × 2) 차감 + 슬리피지는 체결가에 별도 반영
        </div>

        {/* Position sizing — risk-based */}
        {sizing.valid ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-border bg-card-2/40 p-3 space-y-2.5">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Cell
                  label="잃을 한도"
                  value={`${riskPct.toFixed(2)}%`}
                  sub={`${formatCurrency(sizing.maxLoss, currency)} (계좌의)`}
                  tone="bad"
                />
                <Cell
                  label="노출 금액"
                  value={`${positionPctOfAccount.toFixed(1)}%`}
                  sub={`${formatCurrency(sizing.positionSize, currency)} (계좌의)`}
                />
                <Cell
                  label="매수 수량"
                  value={`${formatNumber(sizing.quantity)}`}
                  sub={`@ $${formatNumber(entry)}`}
                />
                <Cell
                  label="실효 손익비"
                  value={`${effRR.toFixed(2)}R`}
                  sub="수수료 차감"
                  tone={effRR >= 1.5 ? "good" : "bad"}
                />
              </div>
              <div className="text-[10px] text-muted-foreground">
                계좌 {formatCurrency(accountSize, currency)} 기준. <strong>노출 금액</strong>은 진입가 × 수량 (레버리지 무관, 시장에 노출되는 총 금액). 레버리지는 주문 검토 화면에서 선택하면 필요 마진이 나옵니다.
              </div>
            </div>

            {/* Standard range badges */}
            <div className="flex flex-wrap gap-1.5">
              <StandardBadge check={stopCheck} />
              <StandardBadge check={targetCheck} />
              <StandardBadge check={rrCheck} />
              <StandardBadge check={riskCheck} />
              {mtfAtrPct ? (
                (() => {
                  const atrFloor = mtfAtrPct * 0.7;
                  const noisy = stopPct < atrFloor;
                  return (
                    <Badge
                      className={cn(
                        "border text-[10px]",
                        noisy
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                          : "border-grade-a/40 bg-grade-a/10 text-grade-a",
                      )}
                    >
                      {noisy ? "⚠" : "✓"} 현재 변동성(ATR) {mtfAtrPct.toFixed(2)}% — 손절{" "}
                      {stopPct.toFixed(2)}% {noisy ? `< ${atrFloor.toFixed(2)}% (노이즈 위험)` : "안전"}
                    </Badge>
                  );
                })()
              ) : null}
            </div>
          </div>
        ) : null}

        {/* CTA */}
        <Link href={tradeFormHref(symbol, scenario, index)}>
          <Button className="w-full" size="lg">
            이 시나리오로 주문 검토
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}

function BigNumber({
  label,
  value,
  sub,
  sub2,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  sub2?: string;
  color: "primary" | "grade-a" | "grade-d";
}) {
  const colorClass = {
    primary: "text-primary",
    "grade-a": "text-grade-a",
    "grade-d": "text-grade-d",
  };
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className={cn("text-[11px] font-medium uppercase tracking-wider", colorClass[color])}>
        {label}
      </div>
      <div className="mt-1 font-mono text-base font-bold leading-tight sm:text-lg">{value}</div>
      <div className={cn("mt-0.5 text-[10px] font-medium", colorClass[color])}>{sub}</div>
      {sub2 ? <div className="text-[10px] text-muted-foreground/70">{sub2}</div> : null}
    </div>
  );
}

function StrategyBanner({ strategy }: { strategy: StrategyResult }) {
  const isWait = strategy.primary === "wait";
  const confPct = Math.round(strategy.confidence * 100);
  const directionLabel =
    strategy.direction === "long" ? "롱" : strategy.direction === "short" ? "숏" : null;

  return (
    <Card className={cn("overflow-hidden", isWait && "border-grade-c/40")}>
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          isWait ? "bg-grade-c" : strategy.direction === "short" ? "bg-grade-d" : "bg-primary",
        )}
      />
      <div className="flex flex-col gap-3 p-4 pl-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            AI 전략 진단
            <span className="text-muted-foreground/70">·</span>
            <span>자신감 {confPct}%</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{STRATEGY_LABELS[strategy.primary]}</span>
            {directionLabel ? (
              <Badge
                className={cn(
                  "border",
                  strategy.direction === "long"
                    ? "border-grade-a/40 bg-grade-a/10 text-grade-a"
                    : "border-grade-d/40 bg-grade-d/10 text-grade-d",
                )}
              >
                {directionLabel}
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {strategy.reasoning}
          </p>
        </div>
        {strategy.rejected.length > 0 ? (
          <details className="group sm:max-w-xs">
            <summary className="cursor-pointer list-none rounded-md border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/30">
              <span className="flex items-center justify-between gap-2">
                <span>왜 다른 전략은 아닌가? ({strategy.rejected.length})</span>
                <span className="transition-transform group-open:rotate-180">▾</span>
              </span>
            </summary>
            <ul className="mt-2 space-y-2 px-1 text-xs">
              {strategy.rejected.map((r, i) => (
                <li key={i} className="rounded-md border border-border/60 bg-background/40 p-2">
                  <div className="font-medium text-foreground/80">
                    {STRATEGY_LABELS[r.strategy as keyof typeof STRATEGY_LABELS] ?? r.strategy}
                  </div>
                  <div className="mt-0.5 text-muted-foreground">{r.reason}</div>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </Card>
  );
}

function formatElapsed(sec: number) {
  if (sec < 60) return `${sec}초`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분`;
  const hr = Math.floor(min / 60);
  return `${hr}시간 ${min % 60}분`;
}

function Row({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono",
          tone === "good" && "text-grade-a",
          tone === "bad" && "text-grade-d",
        )}
      >
        {value}
      </span>
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
          "mt-0.5 font-mono text-sm font-medium",
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

function StandardBadge({
  check,
}: {
  check: { status: CheckStatus; label: string };
}) {
  const cls =
    check.status === "ok"
      ? "border-grade-a/40 bg-grade-a/10 text-grade-a"
      : check.status === "warn"
        ? "border-grade-c/40 bg-grade-c/10 text-grade-c"
        : "border-grade-d/40 bg-grade-d/10 text-grade-d";
  const icon = check.status === "ok" ? "✓" : check.status === "warn" ? "⚠" : "✕";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        cls,
      )}
    >
      <span>{icon}</span>
      <span>{check.label}</span>
    </span>
  );
}

function ScenarioExplainer({
  scenarios,
  active,
}: {
  scenarios: AnalysisReport["scenarios"];
  active: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = scenarios.length;
  const current = scenarios[active];
  const activeLetter = String.fromCharCode(65 + active);

  return (
    <div className="rounded-md border border-border bg-background/40 p-3 text-xs">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-none text-primary" />
        <div className="flex-1 space-y-1.5">
          {count === 1 ? (
            <div className="leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">시나리오 1개</span> — 현재는 메인 시나리오 1개만 잡혔습니다. AI가 보조 시나리오를 만들 만큼 명확한 대안 구조를 찾지 못했다는 뜻입니다.
            </div>
          ) : (
            <div className="leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">시나리오 {count}개</span> —
              <span className="ml-1 font-semibold text-primary">A는 메인</span>(가장 확률 높은 진입),
              <span className="ml-1">B{count >= 3 ? "/C" : ""}는 대안</span>(같은 방향의 다른 트리거 또는 메인 무효화 시 작동). 탭을 눌러 비교하고, <strong className="text-foreground">동시에 진입하지 마세요</strong> — 트리거가 가장 먼저 발생한 1개만 진입.
            </div>
          )}

          {/* Now showing */}
          {current ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                지금 보는 중: {activeLetter}
              </span>
              <span className="text-muted-foreground">{current.name}</span>
            </div>
          ) : null}

          {expanded ? (
            <ul className="mt-2 space-y-1 border-t border-border pt-2 leading-relaxed text-muted-foreground">
              <li>• AI는 시장 상황에 따라 1~3개의 시나리오를 만듭니다. 억지로 양방향을 만들지 않습니다.</li>
              <li>• 각 시나리오의 <span className="font-mono">트리거 / 진입가 / 손절 / 목표</span>는 모두 다릅니다.</li>
              <li>• 진입 후에는 그 시나리오의 손절가만 지키세요. 다른 시나리오의 손절은 무관합니다.</li>
            </ul>
          ) : null}

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-primary hover:underline"
          >
            {expanded ? "접기" : "자세히 보기"}
          </button>
        </div>
      </div>
    </div>
  );
}
