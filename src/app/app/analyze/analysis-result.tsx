"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  ChartCandlestick,
  Clock,
  Megaphone,
  RefreshCw,
  Target,
  ChevronDown,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { gradeTrade } from "@/lib/grading";
import { sizePosition } from "@/lib/sizing";
import { GradeBadge } from "@/components/trade/grade-badge";
import { recommendTradeParams } from "@/lib/recommend";
import { ScenarioChart } from "@/components/analyze/scenario-chart";
import { ScenarioProbability } from "@/components/analyze/scenario-probability";
import { simulateRange } from "@/lib/analysis/monte-carlo";
import { ChartErrorBoundary } from "@/components/analyze/chart-error-boundary";
import { DownloadButtons } from "@/components/analyze/download-buttons";
import { SpecialSignalCard } from "@/components/analyze/special-signal-card";
import type { AnalysisSnapshot } from "@/lib/analysis/analyze";
import type { AnalysisReport } from "@/lib/analysis/synthesize";
import {
  STRATEGY_LABELS,
  type StrategyResult,
} from "@/lib/analysis/strategy";
import { effectiveRR } from "@/lib/analysis/standards";
import type { TradingStyle } from "@/lib/analysis/style";
import {
  MARKET_CHECK_KEYS,
  MARKET_CHECK_LABELS,
  TRIGGER_CHECK_KEYS,
  type MarketCheckKey,
  type MoneyContext,
  type TradeInput,
} from "@/types/trade";

// 예상 변동폭 콘 horizon (스타일 기준 TF 봉 수) — 레이더와 동일.
const RANGE_HORIZON: Record<TradingStyle, number> = { scalp: 8, day: 12, swing: 20, position: 14 };

// 시나리오 카드 A/B/C 배지 색 (시안: A 초록 · B 스카이 · C 바이올렛).
const SCENARIO_BADGE = [
  "bg-grade-a/15 text-grade-a",
  "bg-sky-500/15 text-sky-300",
  "bg-violet-500/15 text-violet-300",
  "bg-amber-500/15 text-amber-300",
];

/** 시안 시나리오 카드의 진입가/손절가/목표가/손익비 셀. 값 + 괄호 델타. */
function StatCell({
  label,
  value,
  delta,
  tone = "muted",
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "good" | "bad" | "muted";
}) {
  return (
    <div className="rounded-lg bg-muted/30 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-mono text-base font-bold tabular-nums">{value}</span>
        {delta ? (
          <span
            className={cn(
              "font-mono text-xs tabular-nums",
              tone === "good" && "text-grade-a",
              tone === "bad" && "text-grade-d",
              tone === "muted" && "text-muted-foreground",
            )}
          >
            {delta}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** 등급 헤드라인 — D는 원인(계좌/셋업)에 따라 다른 문구. "금지" 단정 안 함. */
function tradeFormHref(
  symbol: string,
  scenario: AnalysisReport["scenarios"][number],
  scenarioIdx?: number,
  accountSize?: number,
  riskPct?: number,
) {
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
  if (accountSize !== undefined && accountSize > 0) p.set("accountSize", String(accountSize));
  if (riskPct !== undefined && riskPct > 0) p.set("riskPct", String(riskPct));
  for (const key of MARKET_CHECK_KEYS) {
    if (scenario.marketAssessment[key]) p.set(`m_${key}`, "1");
  }
  return `/app/trade?${p.toString()}`;
}

function evaluateScenario(
  symbol: string,
  scenario: AnalysisReport["scenarios"][number],
  accountSize: number,
  riskPctOverride: number | null,
  userPreferredRiskPct: number,
  style: TradingStyle,
  confidence: number,
  mtfTimeframe: TradeInput["timeframe"],
  money: MoneyContext,
  marketCtx: TradeInput["marketCtx"],
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
  // 트리거는 AI 시나리오 클릭 = 사용자가 진입 의사 있는 거니까 통과로 가정.
  const trigger = Object.fromEntries(TRIGGER_CHECK_KEYS.map((k) => [k, true])) as TradeInput["trigger"];
  // Grade 계산용 baseline risk (사용자 override가 있으면 그것, 아니면 프로필 기본)
  // grading.ts의 risk 체크는 >3% 일 때만 발동하므로 baseline 선택은 권장 산정 결과를 거의 안 바꿈.
  const baselineRiskPct = riskPctOverride ?? userPreferredRiskPct;
  const input: TradeInput = {
    symbol,
    direction: scenario.direction,
    timeframe: mtfTimeframe,
    entry,
    stop: scenario.invalidation,
    target: scenario.target,
    accountSize,
    allowedLossPct: baselineRiskPct,
    market: scenario.marketAssessment,
    trigger,
    money,
    marketCtx,
  };
  const grade = gradeTrade(input);

  // AI 권장 리스크 산정: override 없으면 등급/신뢰도/손절폭 기반.
  const stopPct = (Math.abs(entry - scenario.invalidation) / entry) * 100;
  const recommended = recommendTradeParams({
    style,
    grade: grade.grade,
    confidence,
    stopPct,
    userPreferredRiskPct,
  });
  const effectiveRiskPct = riskPctOverride !== null ? riskPctOverride : recommended.riskPct;

  const sizing = sizePosition({
    accountSize,
    allowedLossPct: effectiveRiskPct,
    entry,
    stop: scenario.invalidation,
  });
  return { entry, grade, sizing, recommended, effectiveRiskPct, isAiRisk: riskPctOverride === null };
}

export function AnalysisResult({
  snapshot,
  strategy,
  report,
  accountSize,
  riskPctOverride,
  userPreferredRiskPct,
  currency,
  historicalStats,
  analysisId,
  money,
}: {
  snapshot: AnalysisSnapshot;
  strategy: StrategyResult;
  report: AnalysisReport;
  accountSize: number;
  /** 사용자가 분석 폼에서 수동 입력한 리스크 % — null이면 AI 자동 산정 */
  riskPctOverride: number | null;
  /** 프로필 기본 리스크 % (자동 산정 상한 cap에 사용) */
  userPreferredRiskPct: number;
  currency: "USD" | "KRW";
  historicalStats?: import("@/lib/analysis/scenario-stats").ScenarioStats | null;
  analysisId?: string;
  /** 서버에서 fetch한 실제 자금 관리 컨텍스트 (오늘 R, 진행 포지션 등) */
  money: MoneyContext;
}) {
  const [activeScenario, setActiveScenario] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [showChart, setShowChart] = useState(false);
  const [watchStates, setWatchStates] = useState<Record<number, { id: string; watch: boolean; status: string }>>({});

  // 시장 컨텍스트 (펀딩비, 정산까지 분) — 심볼 단위로 1회 fetch.
  // 백테스트 모드면 라이브 컨텍스트 무의미하니 fetch 안 함.
  const isBacktest = snapshot.mode === "backtest";
  const [marketCtx, setMarketCtx] = useState<TradeInput["marketCtx"]>({
    btcPrice: null,
    btc24hChangePct: null,
    symbolPrice: null,
    fundingRate: null,
    minutesToFunding: null,
  });
  useEffect(() => {
    if (isBacktest) return;
    let alive = true;
    fetch(`/api/market-context?symbol=${snapshot.symbol}`)
      .then((r) => r.json())
      .then((d) => alive && setMarketCtx(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [snapshot.symbol, isBacktest]);

  // 백테스트 모드면 자금 관리 감점 무시 (가상 시뮬이라 실제 잔액·노출과 무관).
  // → 라이브 손실이 과거 분석 등급에 영향 주지 않게.
  const effectiveMoney: MoneyContext = isBacktest
    ? { todayCumulativeR: 0, todayClosedCount: 0, openPositions: [], openExposurePct: 0 }
    : money;

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

  // 몬테카를로 확률용 MTF 종가 시계열 (안정적 참조 — 매 렌더 재계산 방지).
  const mtfCloses = useMemo(
    () => snapshot.mtfChart?.candles?.map((c) => c.close) ?? [],
    [snapshot.mtfChart],
  );
  // 예상 변동 범위 콘 (다음 horizon봉 80% 구간, 드리프트 0 = 방향 예측 아님).
  const rangeCone = useMemo(
    () => simulateRange(mtfCloses, RANGE_HORIZON[snapshot.style] ?? 20, 2000),
    [mtfCloses, snapshot.style],
  );

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
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="rounded border border-border bg-muted/30 px-2 py-0.5 text-muted-foreground">
                스타일 <span className="font-mono text-foreground">{snapshot.style}</span>
              </span>
              {!rangeCone.insufficient ? (
                <span
                  className="rounded border border-border bg-muted/30 px-2 py-0.5 text-muted-foreground"
                  title={`다음 구간 80% 예상 변동폭 (${rangeCone.lowPct.toFixed(1)}% ~ +${rangeCone.highPct.toFixed(1)}%). 과거 변동성 부트스트랩(드리프트 0) — 방향 예측 아님.`}
                >
                  예상폭 <span className="font-mono text-foreground">±{((rangeCone.highPct - rangeCone.lowPct) / 2).toFixed(1)}%</span>
                </span>
              ) : null}
              <span className="rounded border border-border bg-muted/30 px-2 py-0.5 text-muted-foreground">
                자금 <span className="font-mono text-foreground">{formatCurrency(accountSize, currency)}</span>
              </span>
              {riskPctOverride !== null ? (
                <>
                  <span className="rounded border border-border bg-muted/30 px-2 py-0.5 text-muted-foreground">
                    리스크 <span className="font-mono text-foreground">{riskPctOverride}%</span> (고정)
                  </span>
                  <span className="text-[10px] text-muted-foreground/70">
                    = 거래당 <span className="font-mono">{formatCurrency(accountSize * riskPctOverride / 100, currency)}</span> 손실
                  </span>
                </>
              ) : (
                <span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary">
                  리스크 <span className="font-mono">AI 자동</span> (시나리오마다 다름)
                </span>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* 지금 할 일 — 결론 먼저 (시안: ActionNow 배너) */}
      {report.actionNow ? (
        <section
          className={cn(
            "flex items-start gap-3 rounded-xl border px-5 py-4",
            strategy.primary === "wait"
              ? "border-grade-c/40 bg-grade-c/10"
              : "border-ring/40 bg-ring/10",
          )}
        >
          <Megaphone
            className={cn(
              "mt-0.5 h-5 w-5 flex-none",
              strategy.primary === "wait" ? "text-grade-c" : "text-primary",
            )}
          />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              지금 할 일
            </div>
            <h2 className="mt-1 text-lg font-bold leading-snug sm:text-xl">{report.actionNow}</h2>
          </div>
        </section>
      ) : null}

      {/* 결과 본문 — 좌: 시나리오·차트 / 우: 전략·전문가 레일 (시안 2컬럼) */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-4">
      {/* Simple scenario cards — 결론 다음, 근거(추세·차트)보다 먼저 */}
      {report.scenarios.length === 0 ? (
        report.noEntry?.kind === "filtered" ? (
          // 방향은 잡혔으나 손절폭·수수료·근접 기준 미달로 셋업이 전부 폐기된 경우.
          // "신호 없음"이 아니라 "이 스타일/변동성에선 거래가 안 됨"을 정확히 안내한다.
          <Card className="border-primary/30">
            <CardContent className="flex flex-col items-start gap-3 p-6">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 flex-none text-primary" />
                <div className="text-lg font-semibold">지금은 진입 보류</div>
                {report.noEntry.direction ? (
                  <span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {report.noEntry.direction === "short" ? "하락 우위" : "상승 우위"}
                  </span>
                ) : null}
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                방향성 우위는 보이지만, <strong className="text-foreground">현재 변동성에서는 {snapshot.styleLabel} 기준 셋업이 수수료·노이즈 기준을 넘지 못해</strong> 진입 가능한 시나리오가 없습니다. 무리하게 들어가면 수수료가 손익비를 잠식합니다.
              </p>
              {strategy.reasoning ? (
                <p className="rounded-md bg-muted/40 px-3 py-2 text-sm leading-relaxed text-foreground">
                  {strategy.reasoning}
                </p>
              ) : null}
              {report.noEntry.reasons.length > 0 ? (
                <div className="w-full">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    폐기된 셋업 사유
                  </div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {report.noEntry.reasons.map((r, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-grade-c">·</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm leading-relaxed text-primary">
                {report.noEntry.suggestion}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <AlertTriangle className="h-7 w-7 text-grade-c" />
              <div className="text-lg font-semibold">지금 진입하지 마세요</div>
              <p className="max-w-md text-sm text-muted-foreground">
                {report.noEntry?.suggestion ??
                  "AI가 보기에 지금은 매매 우위가 없습니다. 시장이 정리될 때까지 기다리세요."}
              </p>
            </CardContent>
          </Card>
        )
      ) : (
        <div className="space-y-3">
          {report.scenarios.map((s, i) => {
            const { entry, grade, effectiveRiskPct } = evaluateScenario(
              snapshot.symbol,
              s,
              accountSize,
              riskPctOverride,
              userPreferredRiskPct,
              snapshot.style,
              strategy.confidence,
              scTimeframe,
              effectiveMoney,
              marketCtx,
            );
            return (
              <SimpleScenarioCard
                key={i}
                index={i}
                symbol={snapshot.symbol}
                style={snapshot.style}
                mtfCloses={mtfCloses}
                scenario={s}
                entry={entry}
                grade={grade}
                accountSize={accountSize}
                riskPct={effectiveRiskPct}
                isActive={activeScenario === i}
                onHover={() => setActiveScenario(i)}
                onShowChart={() => {
                  setActiveScenario(i);
                  setShowChart(true);
                }}
                expectedRangeHalfPct={(rangeCone.highPct - rangeCone.lowPct) / 2}
                watchState={watchStates[i] ?? null}
                onToggleWatch={() => toggleWatch(i)}
              />
            );
          })}
        </div>
      )}

      {/* 차트로 보기 — 접힘 (필요할 때만 펼침, 시안 결정) */}
      {report.scenarios.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setShowChart(!showChart)}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-card/40 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/30"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <ChartCandlestick className="h-4 w-4" />
              차트로 보기
              <span className="hidden text-xs font-normal text-muted-foreground/60 sm:inline">
                — 진입·손절·목표 레벨을 캔들 차트에 표시
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                showChart && "rotate-180",
              )}
            />
          </button>

          {showChart ? (
            <Card className="mt-4">
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
        </div>
      ) : null}
      </div>

      {/* 우측 레일 — 전략 판정 요약 · 전문가 정보 (시안) */}
      <div className="min-w-0 space-y-4">
      <RailVerdictCard
        symbol={snapshot.symbol}
        price={snapshot.ticker.last}
        strategy={strategy}
        report={report}
        historicalStats={historicalStats}
      />

      <SpecialSignalCard
        snapshot={snapshot}
        strategy={strategy}
        scenarioHints={report.scenarios.map((s) => s.strategyHint)}
      />

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
          <div className="mt-3 space-y-2">
            {report.marketTrend ? (
              <ExpertRow
                title="추세 · 지표"
                summary={`${
                  report.marketTrend.direction === "up"
                    ? "상승"
                    : report.marketTrend.direction === "down"
                      ? "하락"
                      : "횡보"
                }${snapshot.trendMetrics?.adx ? ` · ADX ${snapshot.trendMetrics.adx.value.toFixed(1)}` : ""}${
                  snapshot.trendMetrics?.ker ? ` · KER ${snapshot.trendMetrics.ker.value.toFixed(2)}` : ""
                }`}
              >
                <MarketTrendBody
                  trend={report.marketTrend}
                  metrics={snapshot.trendMetrics}
                  dominance={snapshot.macro.dominanceRegime ?? undefined}
                />
              </ExpertRow>
            ) : null}

            <ExpertRow title="시장 구조" summary={report.structure.htf}>
              <div className="space-y-2 text-sm">
                <Row label="큰 시간대 (1D/4H)" value={report.structure.htf} />
                <Row label="작은 시간대 (1H/15M)" value={report.structure.ltf} />
              </div>
            </ExpertRow>

            <ExpertRow title="핵심 가격대" summary={`${report.keyLevels.length}개 레벨`}>
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
            </ExpertRow>

            <ExpertRow
              title="시장 상태"
              summary={`매수 ${(snapshot.flow1m.buyRatio * 100).toFixed(0)}% · 펀딩 ${snapshot.funding.bias}`}
            >
              <div className="space-y-2 text-sm">
                <Row label="최근 매수 비율" value={`${(snapshot.flow1m.buyRatio * 100).toFixed(1)}%`} />
                <Row label="펀딩비" value={snapshot.funding.bias} />
                {snapshot.macro.btcDominance != null ? (
                  <Row label="BTC 도미넌스" value={`${snapshot.macro.btcDominance.toFixed(2)}%`} />
                ) : null}
                <div className="border-t border-border pt-2 text-xs text-muted-foreground">
                  {report.flow.note}
                </div>
              </div>
            </ExpertRow>

            {report.warnings.length > 0 ? (
              <ExpertRow title="주의 사항" summary={`${report.warnings.length}건`}>
                <ul className="space-y-2 text-sm">
                  {report.warnings.map((w, i) => (
                    <li key={i} className="flex gap-2 text-grade-c">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </ExpertRow>
            ) : null}

            {/* Detailed scenario panel (with full checklist + grade actions) */}
            {report.scenarios.length > 0 ? (
              <ExpertRow
                title="시나리오 상세"
                summary={`체크리스트 + 점수 · ${report.scenarios.length}개`}
              >
                <div className="space-y-4">
                  {report.scenarios.map((s, i) => {
                    const { entry, grade } = evaluateScenario(
                      snapshot.symbol,
                      s,
                      accountSize,
                      riskPctOverride,
                      userPreferredRiskPct,
                      snapshot.style,
                      strategy.confidence,
                      scTimeframe,
                      effectiveMoney,
                      marketCtx,
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
                </div>
              </ExpertRow>
            ) : null}
          </div>
        ) : null}
      </div>
      </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        본 분석은 투자 자문이 아닙니다. 모든 거래 결정과 결과는 사용자 본인의 책임입니다.
      </p>
      </div>
    </div>
  );
}

/** 전문가 정보 — 접이식 한 줄 요약 행 (펼치면 상세). 시안의 압축 행 스타일. */
function ExpertRow({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-lg border border-border bg-card/40">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5">
        <span className="flex-none text-sm font-medium">{title}</span>
        {summary ? (
          <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
            {summary}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <ChevronDown className="h-4 w-4 flex-none text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border/50 px-4 py-3">{children}</div>
    </details>
  );
}

/** 우측 레일 상단 — 심볼·가격 + 전략 판정 + 근거 + 경고 + 제외 전략 (시안). */
function RailVerdictCard({
  symbol,
  price,
  strategy,
  report,
  historicalStats,
}: {
  symbol: string;
  price: number;
  strategy: StrategyResult;
  report: AnalysisReport;
  historicalStats?: import("@/lib/analysis/scenario-stats").ScenarioStats | null;
}) {
  const isWait = strategy.primary === "wait";
  const dirLabel =
    strategy.direction === "long"
      ? "롱"
      : strategy.direction === "short"
        ? "숏"
        : strategy.primary === "range_fade"
          ? "양방향"
          : null;
  const decided = historicalStats ? historicalStats.target + historicalStats.stop : 0;
  // 내부용 "시나리오 제외:" 로그는 숨기고, 사용자용 경고만 노출.
  const warnings = report.warnings.filter((w) => !w.startsWith("시나리오 제외"));

  return (
    <Card>
      <div className="space-y-3 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-mono text-lg font-bold">{symbol}</h3>
          <span className="font-mono text-lg font-bold tabular-nums">${formatNumber(price)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
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
            {dirLabel ? ` · ${dirLabel}` : ""}
          </Badge>
          <span className="text-muted-foreground">
            신뢰도 <span className="font-mono text-foreground">{Math.round(strategy.confidence * 100)}%</span>
          </span>
          {historicalStats && decided >= 3 ? (
            <span className="text-muted-foreground">
              · 과거 적중률{" "}
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
              </span>{" "}
              ({decided}건)
            </span>
          ) : historicalStats && historicalStats.total > 0 ? (
            <span className="text-[11px] text-muted-foreground">· 과거 표본 {historicalStats.total}개 (부족)</span>
          ) : null}
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">{report.summary}</p>

        {warnings.length > 0 ? (
          <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        ) : null}

        {strategy.rejected.length > 0 ? (
          <div className="border-t border-border/50 pt-2.5">
            <div className="text-[11px] font-semibold text-muted-foreground">검토 후 제외한 전략</div>
            <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground/80">
              {strategy.rejected.map((r, i) => (
                <li key={i}>
                  <span className="text-foreground/70">
                    {STRATEGY_LABELS[r.strategy as keyof typeof STRATEGY_LABELS] ?? r.strategy}
                  </span>{" "}
                  — {r.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function MarketTrendBody({
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
    <div className="flex h-full items-start gap-3">
      <div className={cn("flex h-10 w-10 flex-none items-center justify-center rounded-md", d.bg, d.color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
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

/** Plain-language scenario card */
function SimpleScenarioCard({
  index,
  symbol,
  style,
  mtfCloses,
  scenario,
  entry,
  grade,
  accountSize,
  riskPct,
  isActive,
  onHover,
  onShowChart,
  expectedRangeHalfPct,
  watchState,
  onToggleWatch,
}: {
  index: number;
  symbol: string;
  style: TradingStyle;
  mtfCloses: number[];
  scenario: AnalysisReport["scenarios"][number];
  entry: number;
  grade: ReturnType<typeof gradeTrade>;
  accountSize: number;
  /** Effective risk % used for sizing (tradeFormHref carry-over) */
  riskPct: number;
  isActive: boolean;
  onHover: () => void;
  /** [차트로 보기] — 공유 차트를 열고 이 시나리오를 활성화 */
  onShowChart: () => void;
  /** 몬테카를로 예상 변동폭 ±% (헤더 sub용) */
  expectedRangeHalfPct: number;
  watchState?: { id: string; watch: boolean; status: string } | null;
  onToggleWatch?: () => void;
}) {
  const isLong = scenario.direction === "long";
  const stopPct = (Math.abs(entry - scenario.invalidation) / entry) * 100;
  const targetPct = (Math.abs(scenario.target - entry) / entry) * 100;
  const effRR = effectiveRR(entry, scenario.invalidation, scenario.target);
  // 주문 유형 라벨 (시안 sub) — orderHint 우선, 없으면 entryType로 추정.
  const orderTypeLabel =
    scenario.orderHint === "stop"
      ? "역지정가"
      : scenario.orderHint === "market" || scenario.entryType === "immediate"
        ? "시장가"
        : "지정가";

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

      <div className="space-y-3.5 p-5 pl-6">
        {/* Header — A/B 배지 + 제목 + 알림 (시안) */}
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-9 w-9 flex-none items-center justify-center rounded-lg text-sm font-bold",
              SCENARIO_BADGE[index % SCENARIO_BADGE.length],
            )}
          >
            {String.fromCharCode(65 + index)}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold leading-snug">
              시나리오 {index + 1} — {scenario.name}
            </h3>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {orderTypeLabel}
              {Number.isFinite(expectedRangeHalfPct) && expectedRangeHalfPct > 0
                ? ` · 예상폭 ±${expectedRangeHalfPct.toFixed(1)}%`
                : ""}
              {onToggleWatch ? " · 시나리오 알림 등록 가능" : ""}
            </div>
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
                "inline-flex h-8 w-8 flex-none items-center justify-center rounded-full border text-base transition-colors",
                watchState?.watch
                  ? "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20"
                  : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                !watchState && "cursor-not-allowed opacity-50",
              )}
            >
              {watchState?.watch ? "🔔" : "🔕"}
            </button>
          ) : null}
        </div>

        {/* 트리거 */}
        <div className="rounded-lg bg-muted/30 px-4 py-3 text-sm leading-relaxed">
          <span className="font-semibold">트리거</span>
          <span className="ml-2 text-foreground/90">{scenario.trigger}</span>
        </div>

        {/* 검토 항목 — 표준 미달 (있을 때만) */}
        {scenario.qualityIssues && scenario.qualityIssues.length > 0 ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-400">
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

        {/* 진입가 / 손절가 / 목표가 / 손익비 (시안 4칸) */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCell
            label={scenario.entries && scenario.entries.length > 0 ? "평균 진입가" : "진입가"}
            value={formatNumber(entry)}
          />
          <StatCell
            label="손절가"
            value={formatNumber(scenario.invalidation)}
            delta={`(-${stopPct.toFixed(1)}%)`}
            tone="bad"
          />
          <StatCell
            label="목표가"
            value={formatNumber(scenario.target)}
            delta={`(+${targetPct.toFixed(1)}%)`}
            tone="good"
          />
          <StatCell label="손익비" value={grade.rr.toFixed(2)} delta={`(실효 ${effRR.toFixed(2)})`} />
        </div>

        {/* 도달 확률 (몬테카를로) — 한 줄 */}
        <ScenarioProbability
          compact
          entry={entry}
          stop={scenario.invalidation}
          target={scenario.target}
          direction={scenario.direction}
          closes={mtfCloses}
          style={style}
        />

        {/* 백테스트 결과 (백테스트 모드에서만) */}
        {scenario.simulation ? (
          <BacktestSimulationInline sim={scenario.simulation} direction={scenario.direction} />
        ) : null}

        {/* 액션 — 차트로 보기 / 거래 실행으로 (시안) */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
          <button
            type="button"
            onClick={onShowChart}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            차트로 보기
            <ChartCandlestick className="h-4 w-4" />
          </button>
          <Link href={tradeFormHref(symbol, scenario, index, accountSize, riskPct)}>
            <Button size="lg">
              거래 실행으로
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
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

/** 백테스트 모드 시뮬 결과 inline 표시 — 시나리오 카드 우측 상단에. */
function BacktestSimulationInline({
  sim,
  direction,
}: {
  sim: NonNullable<AnalysisReport["scenarios"][number]["simulation"]>;
  direction: "long" | "short";
}) {
  const reasonLabel = {
    target: { text: "🎯 목표 도달", tone: "border-grade-a/40 bg-grade-a/10 text-grade-a" },
    stop: { text: "🛑 손절", tone: "border-grade-d/40 bg-grade-d/10 text-grade-d" },
    time: { text: "⏰ 시간 만료", tone: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
    no_entry: { text: "❌ 미체결", tone: "border-muted-foreground/40 bg-muted/30 text-muted-foreground" },
  }[sim.exitReason];
  const rPos = sim.resultR >= 0;
  const formatTime = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
          ⏮ 백테스트 결과
        </span>
        <Badge className={cn("border text-[10px]", reasonLabel.tone)}>{reasonLabel.text}</Badge>
      </div>
      {sim.exitReason !== "no_entry" ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase text-muted-foreground">실현 R</span>
            <span
              className={cn(
                "font-mono text-lg font-bold tabular-nums",
                rPos ? "text-grade-a" : "text-grade-d",
              )}
            >
              {rPos ? "+" : ""}
              {sim.resultR.toFixed(2)}R
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {sim.meta.barsHeld}봉 보유 ({sim.meta.interval})
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">진입</span>
              <span className="font-mono">${formatNumber(sim.entryFillPrice)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">청산</span>
              <span className="font-mono">${formatNumber(sim.exitPrice)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">최대 유리</span>
              <span className="font-mono text-grade-a">+{sim.meta.mfePct.toFixed(2)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">최대 불리</span>
              <span className="font-mono text-grade-d">-{sim.meta.maePct.toFixed(2)}%</span>
            </div>
          </div>
          <div className="border-t border-amber-500/20 pt-1.5 text-[10px] text-muted-foreground">
            진입봉 {formatTime(sim.meta.entryCandleTime)} · 청산봉 {formatTime(sim.meta.exitCandleTime)}
          </div>
        </>
      ) : (
        <div className="text-[11px] text-muted-foreground">
          진입가 도달 없이 시간 만료 — 트리거 미발생 시나리오.
        </div>
      )}
      <div className="text-[10px] text-muted-foreground/70">
        ※ 실제 체결과 다를 수 있음 (슬리피지·수수료 미반영, 같은 봉 손절·목표 동시 터치 시 보수적 손절)
      </div>
      {/* direction은 향후 long/short 별도 표기에 사용 — 현재 reason 라벨로 충분 */}
      <span className="sr-only">{direction}</span>
    </div>
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
