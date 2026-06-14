"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { MIN_STOP_PCT_VS_FEES, ROUND_TRIP_COST_PCT } from "@/lib/analysis/standards";
import { AlertTriangle, TrendingUp, TrendingDown, ArrowRight, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MARKET_CHECK_KEYS,
  MARKET_CHECK_LABELS,
  TRIGGER_CHECK_KEYS,
  TRIGGER_CHECK_LABELS,
  ENTRY_BAND_PCT,
  DAILY_LOSS_LIMIT_R,
  SAME_DIRECTION_EXPOSURE_PCT,
  type Direction,
  type MarketContext,
  type MoneyContext,
  type Timeframe,
  type TradeInput,
} from "@/types/trade";
import { gradeTrade } from "@/lib/grading";
import { sizePosition } from "@/lib/sizing";
import { ResultPanel } from "./result-panel";
import { saveTradeAction } from "@/app/app/_actions";
import { placeLiveTradeAction } from "@/app/app/trade/_actions";
import { loadScenarioWatchStatesAction, toggleScenarioWatchAction } from "@/app/app/analyze/_actions";
import { useAnalysisStore } from "@/lib/stores/analysis-store";
import { STRATEGY_LABELS } from "@/lib/analysis/strategy";
import type { AnalysisReport } from "@/lib/analysis/synthesize";
import { recommendTradeParams } from "@/lib/recommend";
import { monteCarloSim, STYLE_BAR_LIMITS, type MonteCarloResult } from "@/lib/simulation/monte-carlo";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

const ENTRY_ACCENT = "border-primary/40 focus-within:border-primary";
const STOP_ACCENT = "border-grade-d/40 focus-within:border-grade-d";
const TARGET_ACCENT = "border-grade-a/40 focus-within:border-grade-a";

/** 입력창에 자연스러운 가격 문자열 — 큰 수는 정수, 작은 수는 4자리 이하. */
function formatPriceForInput(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "";
  if (p >= 1000) return String(Math.round(p));
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function formatRPreview(entry: number, stop: number, target: number, kind: "stop" | "target") {
  const risk = Math.abs(entry - stop);
  if (risk === 0) return "—";
  if (kind === "stop") return "1R";
  const reward = Math.abs(target - entry);
  const r = reward / risk;
  return `${r.toFixed(2)}R`;
}

function PriceRow({
  label,
  value,
  onChange,
  hint,
  accent,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint: string | null;
  accent: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 rounded-md border bg-background/40 px-3 py-1.5", accent)}>
      <span className="w-16 flex-none text-xs font-semibold text-muted-foreground">{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 border-0 bg-transparent px-0 font-mono text-base font-semibold focus-visible:ring-0"
      />
      {hint ? (
        <span className="flex-none font-mono text-[11px] text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT"];
const TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h", "1D"];

const defaultMarket = Object.fromEntries(MARKET_CHECK_KEYS.map((k) => [k, false])) as TradeInput["market"];
const defaultTrigger = Object.fromEntries(TRIGGER_CHECK_KEYS.map((k) => [k, false])) as TradeInput["trigger"];

export type ApiKeyOption = {
  id: string;
  exchange: "binance" | "upbit";
  nickname: string;
  apiKeyMasked: string;
  canTrade: boolean;
};

export type PaperWalletSummary = {
  balance: number;
  available: number;
  usedMargin: number;
};

export function TradeForm(props: {
  initialAccountSize: number;
  initialRiskPct: number;
  currency: "USD" | "KRW";
  initialSymbol: string;
  money: MoneyContext;
  apiKeys?: ApiKeyOption[];
  paperWallet?: PaperWalletSummary;
}) {
  return (
    <Suspense fallback={null}>
      <TradeFormInner {...props} />
    </Suspense>
  );
}

function TradeFormInner({
  initialAccountSize,
  initialRiskPct,
  currency,
  initialSymbol,
  money,
  apiKeys = [],
  paperWallet,
}: {
  initialAccountSize: number;
  initialRiskPct: number;
  currency: "USD" | "KRW";
  initialSymbol: string;
  money: MoneyContext;
  apiKeys?: ApiKeyOption[];
  paperWallet?: PaperWalletSummary;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  // Pull scenario context from analysis store (set during AI analysis flow).
  const analysisResult = useAnalysisStore((s) => s.result);
  const scenarioIdx = params.get("scenario");
  const activeScenario: AnalysisReport["scenarios"][number] | null = useMemo(() => {
    if (!analysisResult || scenarioIdx == null) return null;
    const idx = Number(scenarioIdx);
    if (!Number.isInteger(idx) || idx < 0) return null;
    return analysisResult.report.scenarios[idx] ?? null;
  }, [analysisResult, scenarioIdx]);
  const activeStrategy = analysisResult?.strategy ?? null;
  const activeTrend = analysisResult?.report.marketTrend ?? null;

  // Selected tier index for tier picker (only used when activeScenario has entries).
  const [selectedTier, setSelectedTier] = useState<number | "avg">("avg");

  function selectTier(tier: number | "avg") {
    setSelectedTier(tier);
    if (!activeScenario || !activeScenario.entries || activeScenario.entries.length === 0) return;
    if (tier === "avg") {
      const wSum = activeScenario.entries.reduce((acc, e) => acc + (e.weight || 0), 0);
      const avg = wSum > 0
        ? activeScenario.entries.reduce((acc, e) => acc + e.price * (e.weight / wSum), 0)
        : activeScenario.entries.reduce((acc, e) => acc + e.price, 0) / activeScenario.entries.length;
      setEntry(avg.toFixed(2));
    } else {
      const e = activeScenario.entries.find((x) => x.tier === tier);
      if (e) setEntry(e.price.toFixed(2));
    }
  }

  const triggerHint = params.get("trigger") ?? "";

  const [symbol, setSymbol] = useState(() => {
    const q = params.get("symbol");
    return q && SYMBOLS.includes(q) ? q : q && /^[A-Z0-9]{2,15}USDT$/i.test(q) ? q.toUpperCase() : initialSymbol;
  });
  const [direction, setDirection] = useState<Direction>(() => {
    const q = params.get("direction");
    return q === "short" ? "short" : "long";
  });
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [orderType, setOrderType] = useState<"market" | "limit" | "stop">("market");
  const [orderTypeTouched, setOrderTypeTouched] = useState(false);
  const [entry, setEntry] = useState(() => params.get("entry") ?? "");
  const [stop, setStop] = useState(() => params.get("stop") ?? "");
  const [target, setTarget] = useState(() => params.get("target") ?? "");
  /** AI 또는 사용자가 마지막에 입력한 "지정가" 값들 — 시장가↔지정가 토글 시 복원용. */
  const [limitEntry, setLimitEntry] = useState(() => params.get("entry") ?? "");
  const [limitStop, setLimitStop] = useState(() => params.get("stop") ?? "");
  const [limitTarget, setLimitTarget] = useState(() => params.get("target") ?? "");
  const [accountSize, setAccountSize] = useState(String(initialAccountSize || 10000));
  const [riskPct, setRiskPct] = useState(String(initialRiskPct || 1));
  const [leverage, setLeverage] = useState(5);
  const [market, setMarket] = useState<TradeInput["market"]>(() => {
    const prefilled = { ...defaultMarket };
    for (const k of MARKET_CHECK_KEYS) {
      if (params.get(`m_${k}`) === "1") prefilled[k] = true;
    }
    return prefilled;
  });
  const [trigger, setTrigger] = useState<TradeInput["trigger"]>(defaultTrigger);

  // AI mode: came from analysis page with a scenario. Simplify the form.
  const aiMode = activeScenario !== null;

  // Backtest mode: came from a backtest analysis. saveTradeAction will auto-simulate.
  const isBacktestMode =
    aiMode &&
    analysisResult?.snapshot.mode === "backtest" &&
    !!analysisResult.snapshot.historicalAt;
  const backtestAtKst = isBacktestMode && analysisResult?.snapshot.historicalAt
    ? new Date(analysisResult.snapshot.historicalAt).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // In AI mode the trigger checks are implicitly confirmed (user clicked through
  // an AI scenario after reviewing the trigger). Auto-flip them on entry.
  useEffect(() => {
    if (!aiMode) return;
    setTrigger((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const k of TRIGGER_CHECK_KEYS) {
        if (!next[k]) {
          next[k] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [aiMode]);

  // AI 모드 + 시나리오 기반 주문 유형 기본값 자동 설정.
  // - orderHint(코드가 방향까지 보고 산출): "market"/"limit"/"stop" 우선 사용
  //   · limit = 되돌림 대기(진입가가 현재가 대비 유리한 쪽)
  //   · stop  = 돌파 추격(진입가가 불리한 쪽 — 가격이 통과하면 진입)
  // - orderHint 없으면(구버전 분석) entryType으로 폴백: pending→limit, immediate→market
  // 사용자가 토글을 한 번이라도 만지면(orderTypeTouched) 더 이상 자동 변경 안 함.
  useEffect(() => {
    if (!aiMode || !activeScenario || orderTypeTouched) return;
    const hint = activeScenario.orderHint;
    if (hint === "market" || hint === "limit" || hint === "stop") {
      setOrderType(hint);
    } else {
      setOrderType(activeScenario.entryType === "pending" ? "limit" : "market");
    }
  }, [aiMode, activeScenario, orderTypeTouched]);

  // 시장 컨텍스트: 심볼 변경 시 재fetch
  const [marketCtx, setMarketCtx] = useState<MarketContext>({
    btcPrice: null,
    btc24hChangePct: null,
    symbolPrice: null,
    fundingRate: null,
    minutesToFunding: null,
  });
  // 시장가 진입가↔손절/목표 동기화를 심볼/세션당 1회만 하기 위한 플래그.
  const marketSyncedRef = useRef(false);
  // "주문 금액(USDT)" 직접 입력 중 표시값 (포커스 동안만 사용 — controlled-input jitter 방지).
  const [notionalDraft, setNotionalDraft] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    marketSyncedRef.current = false; // 심볼 바뀌면 시장가 재동기화 허용
    fetch(`/api/market-context?symbol=${symbol}`)
      .then((r) => r.json())
      .then((d) => alive && setMarketCtx(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [symbol]);

  // 현재가가 진입 구간 안에 있는지 자동 판정 (within_entry_band)
  // 시장가는 marketCtx.btcPrice가 BTC만 알려주므로, 여기선 사용자가 "현재가 입력" 없이
  // 진입가 ±ENTRY_BAND_PCT를 기준으로 안내만 표시. 체크박스는 사용자가 수동 토글.
  const entryNum = Number(entry) || 0;
  const entryBandLow = entryNum * (1 - ENTRY_BAND_PCT / 100);
  const entryBandHigh = entryNum * (1 + ENTRY_BAND_PCT / 100);

  // 백테스트 거래는 가상 시뮬이라 실제 자금 관리·라이브 시장 컨텍스트와 무관.
  // 분석 페이지와 동일한 등급이 나오도록 빈 컨텍스트로 산정.
  const effectiveMoney = isBacktestMode
    ? { todayCumulativeR: 0, todayClosedCount: 0, openPositions: [], openExposurePct: 0 }
    : money;
  const effectiveMarketCtx = isBacktestMode
    ? { btcPrice: null, btc24hChangePct: null, symbolPrice: null, fundingRate: null, minutesToFunding: null }
    : marketCtx;

  const input: TradeInput = useMemo(
    () => ({
      symbol,
      direction,
      timeframe,
      entry: Number(entry) || 0,
      stop: Number(stop) || 0,
      target: Number(target) || 0,
      accountSize: Number(accountSize) || 0,
      allowedLossPct: Number(riskPct) || 0,
      market,
      trigger,
      money: effectiveMoney,
      marketCtx: effectiveMarketCtx,
    }),
    [symbol, direction, timeframe, entry, stop, target, accountSize, riskPct, market, trigger, effectiveMoney, effectiveMarketCtx],
  );

  const grade = useMemo(() => gradeTrade(input), [input]);
  const sizing = useMemo(
    () =>
      sizePosition({
        accountSize: input.accountSize,
        allowedLossPct: input.allowedLossPct,
        entry: input.entry,
        stop: input.stop,
      }),
    [input.accountSize, input.allowedLossPct, input.entry, input.stop],
  );

  // AI mode: live-sync recommended risk % + leverage. Stops syncing once user
  // has manually overridden either input — that way tier switches / grade changes
  // re-flow the recommendation without overwriting user intent.
  const [userOverride, setUserOverride] = useState(false);

  // Live-trading state
  const tradableKeys = apiKeys.filter((k) => k.canTrade && k.exchange === "binance");
  // 실행 방식 3택: 가상 진입 / 실거래(준비 중) / 알림(가격 도달 시 텔레그램).
  const [execMode, setExecMode] = useState<"paper" | "live" | "alert">("paper");
  const mode = execMode === "live" ? "live" : "paper"; // 지갑·라이브 로직은 paper/live만 사용
  const [selectedKeyId, setSelectedKeyId] = useState<string>(() => tradableKeys[0]?.id ?? "");
  const [showLiveConfirm, setShowLiveConfirm] = useState(false);
  const [showDOverride, setShowDOverride] = useState(false);
  const [dConfirmText, setDConfirmText] = useState("");
  // 알림(가격 도달) — 이 시나리오에 해당하는 scenario_outcomes 행 id + 등록 상태.
  const analysisId = analysisResult?.analysisId;
  const scenarioOutcomeRef = useRef<{ id: string; watch: boolean } | null>(null);
  const [alertRegistered, setAlertRegistered] = useState(false);
  const [alertPending, setAlertPending] = useState(false);
  useEffect(() => {
    let alive = true;
    scenarioOutcomeRef.current = null;
    setAlertRegistered(false);
    const idx = scenarioIdx != null ? Number(scenarioIdx) : NaN;
    if (!analysisId || !Number.isInteger(idx) || idx < 0) return;
    loadScenarioWatchStatesAction(analysisId)
      .then((res) => {
        if (!alive || !res.states) return;
        const st = res.states[idx];
        if (st) {
          scenarioOutcomeRef.current = { id: st.id, watch: st.watch };
          setAlertRegistered(st.watch);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [analysisId, scenarioIdx]);

  async function registerAlert() {
    const row = scenarioOutcomeRef.current;
    if (!row) {
      toast.error("이 시나리오는 알림 등록을 지원하지 않습니다 (분석이 저장되지 않았거나 관망 시나리오).", {
        duration: 7000,
      });
      return;
    }
    if (alertRegistered) {
      toast("이미 알림이 등록돼 있습니다. 가격 도달 시 텔레그램으로 알려드려요.", { icon: "🔔" });
      return;
    }
    setAlertPending(true);
    const res = await toggleScenarioWatchAction({ scenarioId: row.id, watch: true });
    setAlertPending(false);
    if (res.error) {
      toast.error(res.error, { duration: 7000 });
      return;
    }
    scenarioOutcomeRef.current = { ...row, watch: true };
    setAlertRegistered(true);
    toast.success("알림 등록 완료 — 진입가·손절·목표 도달 시 텔레그램으로 알려드립니다.", { duration: 6000 });
  }
  useEffect(() => {
    // Default to first key if nothing selected after keys load.
    if (!selectedKeyId && tradableKeys.length > 0) {
      setSelectedKeyId(tradableKeys[0].id);
    }
  }, [selectedKeyId, tradableKeys]);
  const recommendation = useMemo(() => {
    if (!aiMode || !analysisResult) return null;
    const entryN = Number(entry) || 0;
    const stopN = Number(stop) || 0;
    if (entryN <= 0 || stopN <= 0) return null;
    const stopPct = (Math.abs(stopN - entryN) / entryN) * 100;
    return recommendTradeParams({
      style: analysisResult.snapshot.style,
      grade: grade.grade,
      confidence: analysisResult.strategy.confidence ?? 0.6,
      stopPct,
      userPreferredRiskPct: initialRiskPct,
    });
  }, [aiMode, analysisResult, entry, stop, grade.grade, initialRiskPct]);

  // Live-apply recommendation whenever it changes (no override).
  useEffect(() => {
    if (!aiMode || !recommendation || userOverride) return;
    setRiskPct(recommendation.riskPct.toFixed(2));
    setLeverage(recommendation.leverage);
  }, [aiMode, recommendation, userOverride]);

  // Reset override on scenario switch (entering a fresh AI flow).
  useEffect(() => {
    setUserOverride(false);
  }, [scenarioIdx]);

  // Monte Carlo trade simulation (AI mode) — projects probable outcome from current ATR.
  const mcResult: MonteCarloResult | null = useMemo(() => {
    if (!aiMode || !analysisResult) return null;
    const entryN = Number(entry) || 0;
    const stopN = Number(stop) || 0;
    const targetN = Number(target) || 0;
    if (entryN <= 0 || stopN <= 0 || targetN <= 0) return null;
    // Use MTF ATR (1H for day, 4H for swing etc.) — matches the trade timeframe best.
    const mtfAtrPct = analysisResult.snapshot.atr?.find((a) => a.role === "MTF")?.pctOfPrice;
    if (!mtfAtrPct || mtfAtrPct <= 0) return null;
    const barLimit = STYLE_BAR_LIMITS[analysisResult.snapshot.style] ?? 48;
    return monteCarloSim({
      entry: entryN,
      stop: stopN,
      target: targetN,
      direction,
      atrPctPerBar: mtfAtrPct,
      barLimit,
      runs: 1000,
    });
  }, [aiMode, analysisResult, entry, stop, target, direction]);

  function save(gradeOverride = false) {
    if (!sizing.valid) {
      toast.error("입력을 확인하세요. 포지션 사이징이 유효하지 않습니다.");
      return;
    }
    // D 등급은 모달 통과 없이는 진행 불가
    if (grade.grade === "D" && !gradeOverride) {
      setShowDOverride(true);
      return;
    }
    if (isBacktestMode && mode === "live") {
      toast.error("백테스트 거래는 실거래 모드로 저장할 수 없습니다. 가상 모드로 전환되어 자동 시뮬됩니다.");
      return;
    }
    if (mode === "live") {
      // Two-step: first click opens the confirm panel (handled in JSX).
      setShowLiveConfirm(true);
      return;
    }
    // 백테스트 분석에서 넘어왔으면 자동 시뮬 → DB 즉시 결과 저장
    const backtestAt =
      analysisResult?.snapshot.mode === "backtest" && analysisResult.snapshot.historicalAt
        ? analysisResult.snapshot.historicalAt
        : undefined;

    startTransition(async () => {
      const res = await saveTradeAction({
        input,
        grade,
        sizing,
        leverage,
        forecast: mcResult ?? undefined,
        orderType,
        gradeOverride,
        backtestAt,
      });
      if (res.error) {
        toast.error(res.error, { duration: 8000 });
        return;
      }
      if (backtestAt) {
        toast.success("백테스트 거래 저장 — 자동 시뮬 결과가 저널에 기록됐습니다.", { duration: 6000 });
        router.push(`/app/journal?view=trades`);
      } else if (res.orderType === "limit" || res.orderType === "stop") {
        toast.success(
          res.orderType === "stop"
            ? "역지정가 주문이 등록됐습니다. 트리거 돌파 시 자동 체결됩니다."
            : "지정가 주문이 등록됐습니다. 가격 도달 시 자동 체결됩니다.",
          { duration: 6000 },
        );
        router.push(`/app/journal`);
      } else {
        toast.success("가상 트레이딩에 진입했습니다.");
        router.push(`/app/virtual-trade`);
      }
    });
  }

  function executeLiveTrade() {
    if (!sizing.valid) {
      toast.error("포지션 사이징이 유효하지 않습니다.");
      return;
    }
    if (!selectedKeyId) {
      toast.error("실거래용 API 키가 선택되지 않았습니다.");
      return;
    }
    setShowLiveConfirm(false);
    startTransition(async () => {
      toast.loading("실거래 주문 전송 중...", { id: "live-trade" });
      const res = await placeLiveTradeAction({
        input,
        grade,
        sizing,
        leverage,
        apiKeyId: selectedKeyId,
        forecast: mcResult ?? undefined,
      });
      toast.dismiss("live-trade");
      if (!res.ok) {
        toast.error(res.error ?? "실거래 실패", { duration: 10_000 });
        if (res.tradeId) {
          // Still navigate so user can inspect the failed trade row.
          router.push(`/app/journal/${res.tradeId}`);
        }
        return;
      }
      toast.success(
        `실거래 진입 완료. 주문 ${res.orders?.length ?? 0}건 등록됨.`,
        { duration: 6_000 },
      );
      if (res.tradeId) router.push(`/app/journal/${res.tradeId}`);
    });
  }

  // 거래소 스타일 계산값
  const entryNumV = Number(entry) || 0;
  const stopNumV = Number(stop) || 0;
  const targetNumV = Number(target) || 0;
  const accountNumV = Number(accountSize) || 0;
  // 해당 심볼의 현재가 (선물 last price). 시장가 진입 시 자동 입력에 사용.
  // ⚠️ btcPrice로 폴백하면 알트인데 BTC 가격이 진입가로 들어가므로 절대 폴백하지 않는다.
  const currentPrice = marketCtx.symbolPrice;

  /** 시장가/지정가 토글 시 진입가/손절/목표를 함께 갱신.
   *  - 시장가: AI 시나리오의 entry/stop/target를 현재가 기준 동일 delta로
   *    평행이동(R:R 그대로 보존). 즉시 체결되면서도 손익비는 유지.
   *  - 지정가: 백업해둔 AI 원래 값(entry/stop/target)으로 복원. */
  function changeOrderType(next: "market" | "limit" | "stop") {
    setOrderTypeTouched(true);
    if (next === orderType) return;
    if (next === "market") {
      marketSyncedRef.current = true; // 토글에서 직접 평행이동하므로 자동 sync는 스킵
      // 백업: 지금 입력값들이 곧 limit 기준값이 됨
      if (entry) setLimitEntry(entry);
      if (stop) setLimitStop(stop);
      if (target) setLimitTarget(target);
      if (currentPrice && currentPrice > 0 && entry) {
        const oldEntry = Number(entry);
        const oldStop = Number(stop);
        const oldTarget = Number(target);
        if (oldEntry > 0) {
          const delta = currentPrice - oldEntry;
          setEntry(formatPriceForInput(currentPrice));
          if (oldStop > 0) setStop(formatPriceForInput(oldStop + delta));
          if (oldTarget > 0) setTarget(formatPriceForInput(oldTarget + delta));
        }
      } else if (currentPrice && currentPrice > 0) {
        setEntry(formatPriceForInput(currentPrice));
      }
    } else {
      marketSyncedRef.current = false; // 다음 시장가 진입 시 현재가에 재동기화
      // 지정가 복원: AI 원래 값으로 (entry/stop/target 모두)
      if (limitEntry) setEntry(limitEntry);
      if (limitStop) setStop(limitStop);
      if (limitTarget) setTarget(limitTarget);
    }
    setOrderType(next);
  }

  /** 지정가가 무효(현재가가 이미 통과)일 때: 손절·목표는 AI가 잡은 구조 그대로 두고
   *  진입가만 현재가로 바꿔 시장가 진입으로 전환한다. 평행이동(R:R 보존)이 아니라
   *  "구조 유지 + 진입가만 현재가" → 손익비가 실제로 재계산된다. */
  function switchToMarketAtCurrent() {
    if (!currentPrice || currentPrice <= 0) return;
    setOrderTypeTouched(true);
    marketSyncedRef.current = true; // 자동 재동기화(평행이동) 스킵
    if (entry) setLimitEntry(entry);
    if (stop) setLimitStop(stop);
    if (target) setLimitTarget(target);
    setEntry(formatPriceForInput(currentPrice));
    // 손절/목표는 그대로 유지 (구조 기반 레벨 보존)
    setOrderType("market");
    toast.success("시장가로 전환했습니다. 손절·목표는 유지, 손익비는 현재가 기준으로 재계산됩니다.", { duration: 5000 });
  }

  // 시장가 모드: 현재가 도착 시 진입가를 현재가로 맞추고, 손절/목표도 같은 delta로
  // 평행이동(R:R 보존). AI 시나리오가 곧장 시장가로 로드된 경우에도 entry/손절/목표가
  // 어긋나지 않도록 심볼당 1회 동기화한다. (이후엔 사용자가 자유롭게 수정 가능)
  useEffect(() => {
    if (orderType !== "market") return;
    if (!currentPrice || currentPrice <= 0) return;
    if (marketSyncedRef.current) return;
    marketSyncedRef.current = true;
    const baseEntry = Number(limitEntry) || Number(entry) || 0;
    if (baseEntry <= 0) {
      setEntry(formatPriceForInput(currentPrice));
      return;
    }
    const delta = currentPrice - baseEntry;
    setEntry(formatPriceForInput(currentPrice));
    const baseStop = Number(limitStop) || Number(stop) || 0;
    const baseTarget = Number(limitTarget) || Number(target) || 0;
    if (baseStop > 0) setStop(formatPriceForInput(baseStop + delta));
    if (baseTarget > 0) setTarget(formatPriceForInput(baseTarget + delta));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice, orderType]);

  // 지정가/역지정가 모드에서 사용자가 직접 수정하면 백업값도 동기화(시장가 토글 복원용).
  useEffect(() => {
    if (orderType === "market") return;
    if (entry) setLimitEntry(entry);
    if (stop) setLimitStop(stop);
    if (target) setLimitTarget(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, stop, target, orderType]);
  const stopPct =
    entryNumV > 0 && stopNumV > 0
      ? ((stopNumV - entryNumV) / entryNumV) * 100
      : 0;
  const targetPct =
    entryNumV > 0 && targetNumV > 0
      ? ((targetNumV - entryNumV) / entryNumV) * 100
      : 0;

  // ── 대기 주문 무효(현재가가 이미 트리거 레벨 통과) 감지 + 현재가 진입 R:R 재계산 ──
  // LIMIT(되돌림): 롱은 현재가 아래·숏은 위여야 유효 → 반대면 즉시 체결(무효).
  // STOP(돌파):    롱은 현재가 위·숏은 아래여야 유효 → 반대면 트리거를 이미 지난 것(무효).
  const cp = currentPrice ?? 0;
  const isLongDir = stopNumV > 0 ? stopNumV < entryNumV : targetNumV > entryNumV;
  const orderCrossed =
    (orderType === "limit" || orderType === "stop") &&
    cp > 0 &&
    entryNumV > 0 &&
    (orderType === "limit"
      ? isLongDir
        ? cp <= entryNumV
        : cp >= entryNumV
      : isLongDir
        ? cp >= entryNumV
        : cp <= entryNumV);
  const orderKindLabel = orderType === "stop" ? "역지정가" : "지정가";
  // 예약 주문 UX: 사용자에겐 "지금 바로 / 예약 주문" 2택만 노출.
  // 내부 주문유형(limit=되돌림 대기 / stop=돌파 추격)은 AI orderHint로 자동 결정.
  const isScheduled = orderType !== "market";
  const scheduledKind: "limit" | "stop" =
    orderType === "stop"
      ? "stop"
      : orderType === "limit"
        ? "limit"
        : activeScenario?.orderHint === "stop"
          ? "stop"
          : "limit";
  function setBooking(next: "now" | "scheduled") {
    changeOrderType(next === "now" ? "market" : scheduledKind);
  }
  // 통과 방향 문구: LIMIT은 진입가 아래/위로 빠짐, STOP은 위/아래로 돌파.
  const crossedDirWord =
    orderType === "stop"
      ? isLongDir
        ? "위로"
        : "아래로"
      : isLongDir
        ? "아래로"
        : "위로";
  // 현재가로 진입했을 때(손절·목표 유지)의 손익비.
  const mktRisk = cp > 0 && stopNumV > 0 ? Math.abs(cp - stopNumV) : 0;
  const mktReward = cp > 0 && targetNumV > 0 ? Math.abs(targetNumV - cp) : 0;
  const mktRR = mktRisk > 0 ? mktReward / mktRisk : 0;
  // 현재가가 손절/목표를 이미 통과했는지 (시장가로도 진입 불가).
  const mktStopPassed =
    cp > 0 && stopNumV > 0 && (isLongDir ? cp <= stopNumV : cp >= stopNumV);
  const mktTargetPassed =
    cp > 0 && targetNumV > 0 && (isLongDir ? cp >= targetNumV : cp <= targetNumV);

  // 수수료 가드: 손절폭이 수수료×3 미만이면 진입 차단(저장 시). 미리 인라인 경고로 표시.
  const absStopPct = Math.abs(stopPct);
  const feeUnsafe =
    entryNumV > 0 && stopNumV > 0 && absStopPct > 0 && absStopPct < MIN_STOP_PCT_VS_FEES;
  // 손절 적중 시 실제 실현 손실(R) = (손절폭 + 왕복수수료) / 손절폭.
  const realizedRIfStopped = absStopPct > 0 ? (absStopPct + ROUND_TRIP_COST_PCT) / absStopPct : 0;
  function widenStopToFeeSafe() {
    if (entryNumV <= 0) return;
    const targetDistPct = MIN_STOP_PCT_VS_FEES + 0.05; // 버퍼 0.05%
    const isLongStop = stopNumV < entryNumV; // 손절이 진입가 아래 = 롱
    const newStop = isLongStop
      ? entryNumV * (1 - targetDistPct / 100)
      : entryNumV * (1 + targetDistPct / 100);
    setStop(formatPriceForInput(newStop));
    toast.success(`손절을 ${targetDistPct.toFixed(2)}%로 넓혔습니다 (수수료 안전선).`);
  }

  // 리스크%에서 도출되는 사이즈 (read-only 미리보기)
  const lossUsd = accountNumV * (Number(riskPct) || 0) / 100;
  const riskPerUnit = Math.abs(entryNumV - stopNumV);
  const previewQty = riskPerUnit > 0 ? lossUsd / riskPerUnit : 0;
  const previewNotional = previewQty * entryNumV;
  const notionalPctOfAccount = accountNumV > 0 ? (previewNotional / accountNumV) * 100 : 0;
  // 청산가 (대략) — Isolated 가정, 유지증거금 무시. 거래소 주문창처럼 참고 표시.
  const liqPrice =
    entryNumV > 0 && leverage > 0
      ? direction === "long"
        ? entryNumV * (1 - 1 / leverage)
        : entryNumV * (1 + 1 / leverage)
      : 0;

  function applyAccountPct(pct: number) {
    // pct = 25/50/75/100 → riskPct를 그 % 만큼의 손실 한도로 환산
    // 여기서는 "노출 금액 = 계좌의 pct%"로 해석하고, 그에 대응하는 손실%를 거꾸로 계산
    // 노출 = 계좌 × pct/100, 손실 = 노출 × (riskPerUnit / entry)
    // 결과 손실% = pct × (riskPerUnit/entry)
    if (entryNumV > 0 && riskPerUnit > 0) {
      const notional = accountNumV * (pct / 100);
      const qty = notional / entryNumV;
      const loss = qty * riskPerUnit;
      const newRiskPct = accountNumV > 0 ? (loss / accountNumV) * 100 : 0;
      setRiskPct(newRiskPct.toFixed(2));
    } else {
      // 기본: 리스크 자체를 pct로 (단순 fallback)
      setRiskPct(String(pct / 25));
    }
    setUserOverride(true);
  }

  // Without an AI scenario this page has no purpose — guide user to either
  // run an analysis or use the virtual exchange directly.
  if (!aiMode) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="overflow-hidden">
          <CardContent className="space-y-5 p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">거래 실행는 AI 분석 후에 사용합니다</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                이 페이지는 AI가 만든 시나리오의 등급·사이징·시장 구조를 확인하고 가상 트레이딩에 진입하는 화면입니다.
                직접 진입하려면 <span className="text-foreground">가상 트레이딩</span>의 주문 패널을 사용하세요.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link
                href="/app/analyze"
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Sparkles className="h-4 w-4" />
                AI 분석으로
              </Link>
              <Link
                href="/app/virtual-trade"
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background/40 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40"
              >
                가상 트레이딩으로 →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 백테스트 모드 배너 — 라이브 거래 차단 + 자동 시뮬 안내 */}
      {isBacktestMode ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base">⏮</span>
            <span className="font-semibold text-amber-300">백테스트 거래</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              기준 시각 <span className="font-mono text-foreground">{backtestAtKst} KST</span> · 저장 시 walk-forward 시뮬 자동 실행 → 결과가 저널에 백테스트 거래로 기록됩니다 (실거래·가상지갑 미차감).
            </span>
          </div>
        </div>
      ) : null}
      {/* ① 요약바 — 등급 결론 (시안) */}
      <SummaryBar
        grade={grade}
        symbol={symbol}
        direction={direction}
        entry={entryNumV}
        stop={stopNumV}
        target={targetNumV}
        scenarioName={activeScenario?.name ?? null}
      />

    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="space-y-6">
        {/* AI 분석 시나리오 컨텍스트 — 분석 페이지에서 넘어왔을 때만 표시 */}
        {activeScenario ? (
          <ScenarioContextCard
            scenario={activeScenario}
            strategyLabel={activeStrategy ? STRATEGY_LABELS[activeStrategy.primary] : null}
            strategyConfidence={activeStrategy ? activeStrategy.confidence : null}
            trend={activeTrend}
            selectedTier={selectedTier}
            onSelectTier={selectTier}
            recommendation={recommendation}
            grade={grade.grade}
            sizing={sizing}
            currency={currency}
            accountSize={Number(accountSize) || 0}
            riskPct={Number(riskPct) || 0}
            leverage={leverage}
            onApplyRecommendation={() => {
              if (!recommendation) return;
              setRiskPct(recommendation.riskPct.toFixed(2));
              setLeverage(recommendation.leverage);
              setUserOverride(false); // 다시 권장값 따르기로 — 이후 tier 변경 시 자동 동기화
            }}
            mcResult={mcResult}
            mtfTf={analysisResult?.snapshot.atr?.find((a) => a.role === "MTF")?.tf ?? null}
          />
        ) : null}

        {/* 1. 주문 입력 — 거래소 스타일 */}
        <Card className="overflow-hidden">
          {/* Header: symbol + futures meta */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/40 px-5 py-3">
            <div className="flex items-center gap-2">
              <Select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="h-8 w-auto min-w-[120px] border-border bg-background font-mono text-sm font-bold"
              >
                {(SYMBOLS.includes(symbol) ? SYMBOLS : [symbol, ...SYMBOLS]).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <span className="rounded border border-border bg-background/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Perpetual
              </span>
              <span className="rounded border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                {leverage}x
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              {!aiMode ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">TF</span>
                  <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/60 p-0.5">
                    {TIMEFRAMES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTimeframe(t)}
                        className={cn(
                          "rounded px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors",
                          timeframe === t
                            ? "bg-primary/15 text-primary"
                            : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {currentPrice ? (
                <div className="font-mono text-xs">
                  <span className="text-muted-foreground">현재가</span>{" "}
                  <span className="font-semibold text-foreground">${currentPrice.toLocaleString()}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Big direction buttons */}
          <div className="grid grid-cols-2 gap-2 p-4">
            <button
              type="button"
              onClick={() => setDirection("long")}
              className={cn(
                "rounded-md py-3 text-sm font-bold uppercase tracking-wide transition-all",
                direction === "long"
                  ? "bg-grade-a text-white shadow-md shadow-grade-a/30"
                  : "border border-border bg-background/40 text-muted-foreground hover:bg-grade-a/10 hover:text-grade-a",
              )}
            >
              롱 매수 / Long
            </button>
            <button
              type="button"
              onClick={() => setDirection("short")}
              className={cn(
                "rounded-md py-3 text-sm font-bold uppercase tracking-wide transition-all",
                direction === "short"
                  ? "bg-grade-d text-white shadow-md shadow-grade-d/30"
                  : "border border-border bg-background/40 text-muted-foreground hover:bg-grade-d/10 hover:text-grade-d",
              )}
            >
              숏 매도 / Short
            </button>
          </div>

          <CardContent className="space-y-4 pt-0">
            {/* Order method toggle — 시안: 지금 바로 / 예약 주문 (2택) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-semibold">주문 방식</Label>
                <span className="text-[10px] text-muted-foreground">
                  {!isScheduled
                    ? "현재가로 즉시 체결"
                    : scheduledKind === "stop"
                      ? "목표 가격 돌파 시 자동 진입 (24시간 유효)"
                      : "목표 가격 도달 시 자동 진입 (24시간 유효)"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-background/40 p-0.5">
                {([
                  { key: "now", label: "지금 바로", active: !isScheduled },
                  { key: "scheduled", label: "예약 주문", active: isScheduled },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setBooking(opt.key)}
                    className={cn(
                      "rounded px-2 py-1.5 text-xs font-semibold transition-colors",
                      opt.active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {isScheduled ? (
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  예약 주문은 지정한 가격에 도달하면 자동으로 진입합니다.{" "}
                  {scheduledKind === "stop"
                    ? `가격이 ${isLongDir ? "위로 돌파" : "아래로 이탈"}할 때 진입(돌파 추종)`
                    : `가격이 ${isLongDir ? "내려와" : "올라와"} 도달할 때 진입(되돌림 대기)`}하도록
                  AI 시나리오 기준으로 자동 설정됩니다.
                </p>
              ) : null}
            </div>

            {/* Price inputs with auto-% */}
            <div className="space-y-2">
              {orderType === "market" ? (
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md border bg-background/40 px-3 py-2.5",
                    ENTRY_ACCENT,
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      진입가
                    </span>
                    <span className="font-mono text-base font-bold tabular-nums">
                      {currentPrice ? `$${currentPrice.toLocaleString()}` : "—"}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    시장가 · 체결 시점 가격으로 진입
                  </span>
                </div>
              ) : (
                <PriceRow
                  label="예약가"
                  value={entry}
                  onChange={setEntry}
                  accent={ENTRY_ACCENT}
                  hint={
                    currentPrice && entryNumV > 0
                      ? `현재가 대비 ${(((entryNumV - currentPrice) / currentPrice) * 100).toFixed(2)}%`
                      : null
                  }
                />
              )}
              <PriceRow
                label="손절 SL"
                value={stop}
                onChange={setStop}
                accent={STOP_ACCENT}
                hint={
                  entryNumV > 0 && stopNumV > 0
                    ? `${stopPct.toFixed(2)}% (${formatRPreview(entryNumV, stopNumV, targetNumV, "stop")})`
                    : null
                }
              />
              <PriceRow
                label="익절 TP"
                value={target}
                onChange={setTarget}
                accent={TARGET_ACCENT}
                hint={
                  entryNumV > 0 && targetNumV > 0
                    ? `${targetPct >= 0 ? "+" : ""}${targetPct.toFixed(2)}% (${formatRPreview(entryNumV, stopNumV, targetNumV, "target")})`
                    : null
                }
              />
            </div>

            {/* 대기 주문(지정가/역지정가) 무효 경고 — 현재가가 이미 트리거를 통과한 경우 */}
            {orderCrossed ? (
              <div
                className={cn(
                  "space-y-2 rounded-md border p-3 text-xs",
                  mktStopPassed || mktTargetPassed
                    ? "border-grade-d/40 bg-grade-d/10"
                    : "border-amber-500/40 bg-amber-500/10",
                )}
              >
                <p className="font-semibold text-foreground">
                  ⚠️ {orderKindLabel}가 무효입니다 — 현재가($
                  {cp.toLocaleString()})가 이미 {orderKindLabel}($
                  {entryNumV.toLocaleString()})를 {crossedDirWord} 통과했습니다.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  {orderType === "stop"
                    ? `${isLongDir ? "롱" : "숏"} 역지정가는 가격이 ${isLongDir ? "올라가" : "내려가"} 트리거를 돌파할 때 진입하는 주문입니다. 이미 통과해 지금 걸면 즉시 체결됩니다.`
                    : `${isLongDir ? "롱" : "숏"} 지정가는 가격이 ${isLongDir ? "내려와" : "올라와"} 도달하길 기다리는 주문입니다. 이미 통과해 거래소에 걸어도 즉시 체결(시장가와 동일)됩니다.`}
                </p>

                {mktStopPassed ? (
                  <p className="font-medium text-grade-d">
                    현재가가 손절가($
                    {stopNumV.toLocaleString()})도 통과했습니다. <span className="font-semibold">진입 거부</span> — 새 셋업을 기다리세요.
                  </p>
                ) : mktTargetPassed ? (
                  <p className="font-medium text-grade-d">
                    현재가가 목표가($
                    {targetNumV.toLocaleString()})를 이미 통과했습니다. <span className="font-semibold">추격 금지</span> — 목표를 다시 잡거나 포기하세요.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between rounded bg-background/40 px-2 py-1.5">
                      <span className="text-muted-foreground">
                        현재가로 진입 시 손익비 (손절·목표 유지)
                      </span>
                      <span
                        className={cn(
                          "font-mono font-bold tabular-nums",
                          mktRR >= 1.5 ? "text-grade-a" : "text-grade-d",
                        )}
                      >
                        {mktRR.toFixed(2)} R
                      </span>
                    </div>
                    {mktRR < 1.5 ? (
                      <p className="text-grade-d">
                        목표가가 너무 가까워 손익비가 나오지 않습니다. 시장가로 들어가도 불리한 거래입니다 — 목표 재조정 또는 포기를 권장합니다.
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        손익비는 유효합니다. 시장가로 전환해 현재가에 진입할 수 있습니다.
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={switchToMarketAtCurrent}
                    >
                      시장가로 전환 (진입가 → 현재가, 손익비 {mktRR.toFixed(2)}R)
                    </Button>
                  </>
                )}
              </div>
            ) : null}

            {/* Leverage slider — 거래소 순서대로 사이즈 위에 배치 */}
            <div className="space-y-2 rounded-md border border-border bg-background/30 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">레버리지</Label>
                <span className="font-mono text-sm font-bold text-foreground">{leverage}x</span>
              </div>
              {liqPrice > 0 ? (
                <div className="flex items-center justify-between rounded bg-muted/30 px-2 py-1 text-[11px]">
                  <span className="text-muted-foreground">청산가 (대략 · Isolated)</span>
                  <span className="font-mono text-amber-400">${formatPriceForInput(liqPrice)}</span>
                </div>
              ) : null}
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={leverage}
                onChange={(e) => { setLeverage(Number(e.target.value)); setUserOverride(true); }}
                className="w-full accent-primary"
              />
              <div className="flex flex-wrap gap-1">
                {[1, 3, 5, 10, 20, 50].map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    onClick={() => { setLeverage(lv); setUserOverride(true); }}
                    className={cn(
                      "rounded border px-2 py-0.5 font-mono text-[11px] transition-colors",
                      leverage === lv
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background/40 text-muted-foreground hover:bg-accent/40",
                    )}
                  >
                    {lv}x
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                레버리지는 손익비/등급과 무관. 필요 마진만 달라집니다.
              </p>
            </div>

            {/* 수수료 가드 인라인 경고 — 진입 클릭 전에 표시 */}
            {feeUnsafe ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-grade-d/40 bg-grade-d/10 p-3 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 text-grade-d" />
                <span className="flex-1 text-grade-d">
                  손절폭 {absStopPct.toFixed(3)}%가 수수료의 3배({MIN_STOP_PCT_VS_FEES.toFixed(2)}%) 미만 —
                  손절 적중 시 수수료 포함 약 <strong>{realizedRIfStopped.toFixed(1)}R</strong> 손실(계획 1R 대비). 이대로는 진입이 차단됩니다.
                </span>
                <button
                  type="button"
                  onClick={widenStopToFeeSafe}
                  className="shrink-0 rounded border border-grade-d/50 bg-grade-d/10 px-2.5 py-1 font-medium text-grade-d transition-colors hover:bg-grade-d/20"
                >
                  손절 자동 넓히기
                </button>
              </div>
            ) : null}

            {/* Size / quantity section */}
            <div className="space-y-2 rounded-md border border-border bg-background/30 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">사이즈 (리스크 기반)</span>
                <span className="font-mono text-muted-foreground">
                  {previewQty > 0 ? `${formatNumber(previewQty, { maximumFractionDigits: 4 })} ${symbol.replace("USDT", "")}` : "—"}
                </span>
              </div>
              {/* 거래소식 사이즈 슬라이더 (계좌 노출 % 기준) */}
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.min(100, Math.max(0, Math.round(notionalPctOfAccount)))}
                  onChange={(e) => applyAccountPct(Number(e.target.value))}
                  className="w-full accent-primary"
                  aria-label="포지션 사이즈 (계좌 대비 %)"
                />
                <span className="w-10 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                  {notionalPctOfAccount.toFixed(0)}%
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">계좌의:</span>
                {[10, 25, 50, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => applyAccountPct(pct)}
                    className={cn(
                      "rounded border px-2 py-0.5 font-mono text-[11px] transition-colors",
                      Math.abs(notionalPctOfAccount - pct) < 1
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background/40 text-muted-foreground hover:bg-accent/40",
                    )}
                  >
                    {pct === 100 ? "Max" : `${pct}%`}
                  </button>
                ))}
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  노출 {notionalPctOfAccount.toFixed(1)}%
                </span>
              </div>

              {/* 실제 USDT 금액 — 수량/노출/마진/잃을 한도 */}
              {previewQty > 0
                ? (() => {
                    const acct = Math.max(Number(accountSize) || 0, 0);
                    const notionalUsd = acct * (notionalPctOfAccount / 100);
                    const riskUsd = acct * (Number(riskPct) / 100);
                    const marginUsd = leverage > 0 ? notionalUsd / leverage : notionalUsd;
                    const base = symbol.replace("USDT", "");
                    return (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md bg-muted/30 px-2.5 py-2 text-[11px] sm:grid-cols-4">
                        <div>
                          <div className="text-muted-foreground">수량</div>
                          <div className="font-mono text-foreground">
                            {formatNumber(previewQty, { maximumFractionDigits: 4 })} {base}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">노출 금액</div>
                          <div className="font-mono text-foreground">
                            {formatCurrency(notionalUsd, currency)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">필요 마진</div>
                          <div className="font-mono text-foreground">
                            {formatCurrency(marginUsd, currency)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">잃을 한도</div>
                          <div className="font-mono text-grade-d">
                            {formatCurrency(riskUsd, currency)}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                : null}

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="space-y-1">
                  <Label className="text-[11px]">주문 금액 (USDT)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={notionalDraft ?? (previewNotional > 0 ? String(Math.round(previewNotional)) : "")}
                    onFocus={() =>
                      setNotionalDraft(previewNotional > 0 ? String(Math.round(previewNotional)) : "")
                    }
                    onChange={(e) => {
                      setNotionalDraft(e.target.value);
                      const usd = Number(e.target.value) || 0;
                      const pct = accountNumV > 0 ? (usd / accountNumV) * 100 : 0;
                      applyAccountPct(pct);
                    }}
                    onBlur={() => setNotionalDraft(null)}
                    placeholder="노출 USDT"
                    className="h-9 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">계좌 ({currency})</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={accountSize}
                    onChange={(e) => setAccountSize(e.target.value)}
                    className="h-9 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">리스크 / 거래 (%)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={riskPct}
                    onChange={(e) => { setRiskPct(e.target.value); setUserOverride(true); }}
                    className="h-9 font-mono"
                  />
                </div>
              </div>
            </div>

          </CardContent>
        </Card>

        {/* 2. 시장 구조 체크리스트 — AI 모드에서는 분석이 이미 평가했으므로 숨김 */}
        {!aiMode ? (
        <details open className="group">
          <summary className="cursor-pointer select-none rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 list-none flex items-center gap-1">
            <span className="transition-transform group-open:rotate-90">▶</span>
            시장 구조 체크리스트
          </summary>
          <div className="mt-2">
            <Card>
              <CardHeader>
                <CardTitle>시장 구조 체크리스트</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {MARKET_CHECK_KEYS.map((k) => (
                  <Checkbox
                    key={k}
                    checked={market[k]}
                    onChange={(e) => setMarket({ ...market, [k]: e.target.checked })}
                    label={MARKET_CHECK_LABELS[k]}
                  />
                ))}
              </CardContent>
            </Card>
          </div>
        </details>
        ) : null}

        {/* ③ 자동 점검 — 자금 관리 상태 (접힘, 자동 집계) */}
        <details className="group">
          <summary className="cursor-pointer select-none rounded-md border border-border bg-background/40 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 list-none flex items-center gap-2">
            <span className="transition-transform group-open:rotate-90">▶</span>
            <span className="font-semibold text-foreground">자동 점검</span>
            <span className="text-xs">— 자금 관리 상태</span>
            {(money.todayCumulativeR <= DAILY_LOSS_LIMIT_R + 0.5 ||
              money.openExposurePct >= SAME_DIRECTION_EXPOSURE_PCT) ? (
              <span className="ml-auto rounded bg-grade-d/15 px-1.5 py-0.5 text-[10px] font-semibold text-grade-d">
                ⚠️ 주의
              </span>
            ) : (
              <span className="ml-auto rounded bg-grade-a/15 px-1.5 py-0.5 text-[10px] font-semibold text-grade-a">
                이상 없음
              </span>
            )}
          </summary>
          <div className="mt-2">
            <Card>
              <CardHeader>
                <CardTitle>자금 관리 상태</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-3">
                  <StatCell
                    label="오늘 거래"
                    value={`${money.todayClosedCount}건`}
                    sub="종료된 건수"
                  />
                  <StatCell
                    label="오늘 누적"
                    value={`${money.todayCumulativeR >= 0 ? "+" : ""}${money.todayCumulativeR.toFixed(2)}R`}
                    sub={`한도 ${DAILY_LOSS_LIMIT_R}R`}
                    tone={
                      money.todayCumulativeR <= DAILY_LOSS_LIMIT_R + 0.5
                        ? "bad"
                        : money.todayCumulativeR < 0
                          ? undefined
                          : "good"
                    }
                  />
                  <StatCell
                    label="진행 중 노출"
                    value={`${money.openExposurePct.toFixed(0)}%`}
                    sub={`${money.openPositions.length}개 포지션`}
                    tone={money.openExposurePct >= SAME_DIRECTION_EXPOSURE_PCT ? "bad" : undefined}
                  />
                </div>
                {money.openPositions.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="text-[11px] uppercase text-muted-foreground">진행 중 포지션</div>
                    <div className="space-y-1">
                      {money.openPositions.slice(0, 5).map((p) => {
                        const isDuplicate = p.symbol === symbol;
                        return (
                          <div
                            key={p.id}
                            className={cn(
                              "flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs",
                              isDuplicate
                                ? "border-amber-500/40 bg-amber-500/5"
                                : "border-border bg-background/30",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold">{p.symbol}</span>
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[10px] uppercase",
                                  p.direction === "long"
                                    ? "bg-emerald-500/10 text-emerald-400"
                                    : "bg-red-500/10 text-red-400",
                                )}
                              >
                                {p.direction}
                              </span>
                              {isDuplicate ? (
                                <span className="text-[10px] text-amber-400">⚠️ 현재 입력과 중복</span>
                              ) : null}
                            </div>
                            <span className="font-mono tabular-nums text-muted-foreground">
                              ${p.positionSize.toFixed(0)}
                            </span>
                          </div>
                        );
                      })}
                      {money.openPositions.length > 5 ? (
                        <div className="text-[10px] text-muted-foreground text-center">
                          + {money.openPositions.length - 5}개 더
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {money.todayCumulativeR <= DAILY_LOSS_LIMIT_R + 0.5 ? (
                  <WarnBar
                    text={`오늘 누적 ${money.todayCumulativeR.toFixed(2)}R — 일일 손실 한도(${DAILY_LOSS_LIMIT_R}R) 근접. 추가 진입은 신중히.`}
                  />
                ) : null}
                {money.openExposurePct >= SAME_DIRECTION_EXPOSURE_PCT ? (
                  <WarnBar
                    text={`진행 중 포지션이 계좌의 ${money.openExposurePct.toFixed(0)}%를 차지. 추가 진입은 과노출.`}
                  />
                ) : null}
              </CardContent>
            </Card>
          </div>
        </details>

        {/* 4. 시장 컨텍스트 — AI 모드에서는 분석 결과에 이미 포함되므로 숨김 */}
        {!aiMode ? (
        <details open className="group">
          <summary className="cursor-pointer select-none rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 list-none flex items-center gap-1">
            <span className="transition-transform group-open:rotate-90">▶</span>
            시장 컨텍스트 (BTC/펀딩비)
          </summary>
          <div className="mt-2">
        <Card>
          <CardHeader>
            <CardTitle>시장 컨텍스트</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <StatCell
                label="BTC"
                value={marketCtx.btcPrice ? `$${marketCtx.btcPrice.toLocaleString()}` : "—"}
                sub={
                  marketCtx.btc24hChangePct !== null
                    ? `24h ${marketCtx.btc24hChangePct >= 0 ? "+" : ""}${marketCtx.btc24hChangePct.toFixed(2)}%`
                    : ""
                }
                tone={
                  marketCtx.btc24hChangePct === null
                    ? undefined
                    : marketCtx.btc24hChangePct >= 0
                    ? "good"
                    : "bad"
                }
              />
              <StatCell
                label={`${symbol} 펀딩비`}
                value={
                  marketCtx.fundingRate !== null
                    ? `${(marketCtx.fundingRate * 100).toFixed(4)}%`
                    : "—"
                }
                sub={
                  marketCtx.fundingRate !== null
                    ? marketCtx.fundingRate > 0
                      ? "롱이 숏에 지급"
                      : "숏이 롱에 지급"
                    : ""
                }
                tone={
                  marketCtx.fundingRate !== null && Math.abs(marketCtx.fundingRate) >= 0.0005
                    ? "bad"
                    : undefined
                }
              />
              <StatCell
                label="다음 펀딩"
                value={
                  marketCtx.minutesToFunding !== null
                    ? `${marketCtx.minutesToFunding}분`
                    : "—"
                }
                sub="정산까지"
                tone={
                  marketCtx.minutesToFunding !== null && marketCtx.minutesToFunding <= 10
                    ? "bad"
                    : undefined
                }
              />
            </div>
            {marketCtx.minutesToFunding !== null && marketCtx.minutesToFunding <= 10 ? (
              <WarnBar text="펀딩 정산이 10분 이내입니다. 정산 직전 진입은 슬리피지/펀딩비 부담이 큽니다." />
            ) : null}
          </CardContent>
        </Card>
          </div>
        </details>
        ) : null}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <ResultPanel
          grade={grade}
          sizing={sizing}
          currency={currency}
          accountSize={Number(accountSize) || 0}
          riskPct={Number(riskPct) || 0}
          leverage={leverage}
          onApplyLeverage={(lv) => { setLeverage(lv); setUserOverride(true); }}
        />

        {/* ④ 실행 방법 — 3택: 가상 진입 / 실거래 / 알림 (시안) */}
        <Card className="overflow-hidden">
          <CardContent className="space-y-3 p-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                주문 방법을 선택하세요
              </div>
              <div className="mt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => setExecMode("paper")}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                    execMode === "paper"
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background/40 hover:bg-muted/30",
                  )}
                >
                  <span className="text-lg">🧪</span>
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-semibold", execMode === "paper" ? "text-primary" : "text-foreground")}>
                      가상 거래 진입
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      실제 자금 없이 동일한 체결·수수료로 학습
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled
                  className="flex w-full cursor-not-allowed items-center gap-3 rounded-md border border-border bg-background/20 px-3 py-2.5 text-left opacity-60"
                  title="현재 비활성 — Binance IP 제한 정책 때문에 자동 주문 불가. 추후 프록시 인프라 도입 시 활성화."
                >
                  <span className="text-lg grayscale">⚡</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground/60">
                      실거래 주문
                      <span className="rounded bg-muted/60 px-1 py-0.5 text-[9px] uppercase">준비 중</span>
                    </span>
                    <span className="block text-[10px] text-muted-foreground/50">
                      거래소에 실제 시장가 주문 전송
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setExecMode("alert")}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                    execMode === "alert"
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background/40 hover:bg-muted/30",
                  )}
                >
                  <span className="text-lg">🔔</span>
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-semibold", execMode === "alert" ? "text-primary" : "text-foreground")}>
                      알림만 받기
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      진입가·손절·목표 도달 시 텔레그램 알림 {alertRegistered ? "· 등록됨 ✓" : ""}
                    </span>
                  </span>
                </button>
              </div>
            </div>

            {/* Paper-mode wallet preview */}
            {execMode === "paper" && paperWallet ? (() => {
              const requiredMargin = sizing.valid && leverage > 0 ? sizing.positionSize / leverage : 0;
              const afterAvailable = paperWallet.available - requiredMargin;
              const insufficient = requiredMargin > paperWallet.available;
              return (
                <div className="space-y-2">
                  <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        가상 지갑 미리보기
                      </span>
                      <Link
                        href="/app/virtual-trade/wallet"
                        className="text-[10px] text-primary underline-offset-2 hover:underline"
                      >
                        지갑 관리 →
                      </Link>
                    </div>
                    <div className="space-y-0.5 font-mono tabular-nums">
                      <Row label="vUSDT 잔액" value={formatCurrency(paperWallet.balance, "USD")} />
                      <Row label="사용 가능" value={formatCurrency(paperWallet.available, "USD")} />
                      <Row
                        label="필요 마진"
                        value={formatCurrency(requiredMargin, "USD")}
                        tone={insufficient ? "bad" : "default"}
                      />
                      <Row
                        label="진입 후 사용 가능"
                        value={formatCurrency(Math.max(0, afterAvailable), "USD")}
                        tone={insufficient ? "bad" : "default"}
                      />
                    </div>
                    {insufficient ? (
                      <div className="mt-2 rounded border border-grade-d/40 bg-grade-d/10 p-2 text-[11px] text-grade-d">
                        <div className="flex items-center gap-1 font-semibold">
                          <AlertTriangle className="h-3 w-3" />
                          가상 잔액 부족
                        </div>
                        <p className="mt-0.5 text-grade-d/80">
                          필요 마진 {formatCurrency(requiredMargin, "USD")}, 사용 가능 {formatCurrency(paperWallet.available, "USD")}.{" "}
                          <Link href="/app/virtual-trade/wallet" className="underline">가상 자금 추가</Link>하거나 리스크%·레버리지를 조정하세요.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })() : null}

            <p className="text-[10px] text-muted-foreground">
              {execMode === "alert"
                ? "알림만 받기: 지금은 진입하지 않고, 가격이 시나리오 레벨에 도달하면 텔레그램으로 알려드립니다. 텔레그램 미연결 시 설정에서 연결하세요."
                : <>가상 거래: 실제 자금 없이 거래소와 동일한 흐름(체결가·슬리피지·수수료·마진)으로 학습. 진입 후 <Link href="/app/virtual-trade" className="text-primary underline-offset-2 hover:underline">가상 거래 화면</Link>에서 포지션이 추적됩니다.</>}
            </p>
          </CardContent>
        </Card>

        {execMode === "alert" ? (
          <Button
            className="w-full"
            size="lg"
            variant="outline"
            onClick={registerAlert}
            disabled={alertPending || alertRegistered}
          >
            {alertPending ? "알림 등록 중..." : alertRegistered ? "🔔 알림 등록됨" : "🔔 가격 도달 알림 설정"}
          </Button>
        ) : (
          <Button
            className="w-full"
            size="lg"
            onClick={() => save()}
            disabled={
              pending ||
              (mode === "paper" && paperWallet != null && sizing.valid && (sizing.positionSize / Math.max(leverage, 1)) > paperWallet.available)
            }
          >
            {pending
              ? isScheduled
                ? "예약 주문 등록 중..."
                : "진입 처리 중..."
              : isScheduled
                ? aiMode
                  ? "이 계획으로 예약 주문"
                  : "예약 주문 등록"
                : aiMode
                  ? "이 계획으로 가상 진입"
                  : "가상 진입"}
          </Button>
        )}
        {aiMode ? (
          <p className="text-center text-[11px] text-muted-foreground">
            진입가·손절·목표는 AI 분석에서 가져왔습니다. 위 단계 버튼으로 진입 시점을 바꿀 수 있습니다.
          </p>
        ) : null}

        {/* D 등급 override 모달 */}
        {showDOverride ? (
          <Card className="border-grade-d/60 bg-grade-d/10">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2 text-grade-d">
                <AlertTriangle className="h-4 w-4" />
                <div className="text-sm font-semibold">
                  D등급 — 강한 자제 (원하면 축소 사이즈로 진입 가능)
                </div>
              </div>
              <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs leading-relaxed">
                <div className="mb-2 font-semibold text-foreground">
                  이 거래가 D등급인 이유:
                </div>
                <ul className="space-y-1 font-mono text-muted-foreground">
                  {grade.reasons
                    .filter((r) => r.points < 0)
                    .map((r, i) => (
                      <li key={i} className="text-grade-d">
                        {r.points}점 · {r.label}
                      </li>
                    ))}
                </ul>
                <div className="mt-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                  D등급은 통계상 손실 확률이 높은 패턴입니다. 사이즈가 평소의
                  10%로 작게 잡혀있어도 추천하지 않습니다.
                </div>
              </div>
              <div>
                <Label className="text-[11px]">
                  계속 진행하시려면 아래에 <strong>D 진입</strong> 을 정확히
                  입력하세요:
                </Label>
                <Input
                  value={dConfirmText}
                  onChange={(e) => setDConfirmText(e.target.value)}
                  placeholder="D 진입"
                  className="mt-1 font-mono"
                  autoComplete="off"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowDOverride(false);
                    setDConfirmText("");
                  }}
                  disabled={pending}
                >
                  취소 (권장)
                </Button>
                <Button
                  className="flex-1 bg-grade-d hover:bg-grade-d/90"
                  onClick={() => {
                    setShowDOverride(false);
                    setDConfirmText("");
                    save(true);
                  }}
                  disabled={pending || dConfirmText.trim() !== "D 진입"}
                >
                  진행 (override)
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Live trade confirmation dialog */}
        {showLiveConfirm ? (
          <Card className="border-grade-d/60 bg-grade-d/10">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2 text-grade-d">
                <AlertTriangle className="h-4 w-4" />
                <div className="text-sm font-semibold">실거래 최종 확인</div>
              </div>
              <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs font-mono leading-relaxed">
                <div>심볼: <span className="text-foreground">{input.symbol}</span></div>
                <div>방향: <span className="text-foreground">{input.direction === "long" ? "롱 (BUY)" : "숏 (SELL)"}</span></div>
                <div>수량: <span className="text-foreground">{sizing.quantity}</span></div>
                <div>레버리지: <span className="text-foreground">{leverage}×</span></div>
                <div>진입: <span className="text-foreground">${formatNumber(Number(entry) || 0)}</span></div>
                <div>손절: <span className="text-grade-d">${formatNumber(Number(stop) || 0)}</span></div>
                <div>목표: <span className="text-grade-a">${formatNumber(Number(target) || 0)}</span></div>
                <div className="mt-1.5 border-t border-border/60 pt-1.5">
                  노출 금액: <span className="text-foreground">{formatCurrency(sizing.positionSize, currency)}</span> ({((sizing.positionSize / Math.max(Number(accountSize), 1)) * 100).toFixed(1)}%)
                </div>
                <div>최대 손실: <span className="text-grade-d">{formatCurrency(sizing.maxLoss, currency)}</span> ({riskPct}% of 계좌)</div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                이 버튼을 누르면 거래소에 즉시 시장가 진입이 전송됩니다.
                손절·익절 주문이 자동으로 등록되며, 한 번 진입한 후에는 거래소에서 직접 관리해야 합니다.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowLiveConfirm(false)} disabled={pending}>
                  취소
                </Button>
                <Button
                  className="flex-1 bg-grade-d hover:bg-grade-d/90"
                  onClick={executeLiveTrade}
                  disabled={pending}
                >
                  확인 — 실제 주문 전송
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </aside>
    </div>
    </div>
  );
}

const GRADE_VERDICT: Record<"A" | "B" | "C" | "D", string> = {
  A: "진입 가능",
  B: "조건부 진입",
  C: "비추천 · 축소",
  D: "강한 자제",
};

// Tailwind JIT는 동적 조합 클래스를 생성하지 못하므로 전체 문자열을 정적으로 둔다.
const GRADE_CLASSES: Record<"A" | "B" | "C" | "D", { bg: string; text: string; border: string; soft: string }> = {
  A: { bg: "bg-grade-a", text: "text-grade-a", border: "border-grade-a/40", soft: "bg-grade-a/10" },
  B: { bg: "bg-grade-b", text: "text-grade-b", border: "border-grade-b/40", soft: "bg-grade-b/10" },
  C: { bg: "bg-grade-c", text: "text-grade-c", border: "border-grade-c/40", soft: "bg-grade-c/10" },
  D: { bg: "bg-grade-d", text: "text-grade-d", border: "border-grade-d/40", soft: "bg-grade-d/10" },
};

/** ① 요약바 — 등급 결론을 한 줄로. 시안의 상단 바. */
function SummaryBar({
  grade,
  symbol,
  direction,
  entry,
  stop,
  target,
  scenarioName,
}: {
  grade: ReturnType<typeof gradeTrade>;
  symbol: string;
  direction: Direction;
  entry: number;
  stop: number;
  target: number;
  scenarioName: string | null;
}) {
  const g = grade.grade as "A" | "B" | "C" | "D";
  const rr =
    entry > 0 && stop > 0 && target > 0 && Math.abs(entry - stop) > 0
      ? Math.abs(target - entry) / Math.abs(entry - stop)
      : grade.rr || 0;
  const action = grade.actions[0] ?? null;
  const gc = GRADE_CLASSES[g];
  return (
    <div className={cn("rounded-xl border px-4 py-3", gc.border, gc.soft)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-11 w-11 flex-none items-center justify-center rounded-lg text-xl font-black text-white shadow-sm",
              gc.bg,
            )}
          >
            {g}
          </div>
          <div className="min-w-0">
            <div className={cn("text-base font-bold leading-tight", gc.text)}>
              {GRADE_VERDICT[g]}
              <span className="ml-2 text-xs font-medium text-muted-foreground">
                {grade.score >= 0 ? "+" : ""}
                {grade.score}점
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">{symbol}</span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                  direction === "long"
                    ? "bg-grade-a/15 text-grade-a"
                    : "bg-grade-d/15 text-grade-d",
                )}
              >
                {direction === "long" ? "롱" : "숏"}
              </span>
              {scenarioName ? <span className="truncate">· {scenarioName}</span> : null}
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">손익비</div>
            <div
              className={cn(
                "font-mono text-lg font-bold tabular-nums",
                rr >= 1.5 ? "text-grade-a" : rr > 0 ? "text-grade-c" : "text-muted-foreground",
              )}
            >
              {rr > 0 ? `${rr.toFixed(2)}R` : "—"}
            </div>
          </div>
        </div>
      </div>
      {action ? (
        <p className="mt-2 border-t border-border/40 pt-2 text-xs leading-relaxed text-muted-foreground">
          {action}
        </p>
      ) : null}
    </div>
  );
}

function StatCell({
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
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-base tabular-nums font-semibold",
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

function WarnBar({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-grade-d/40 bg-grade-d/10 p-2 text-xs text-grade-d">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
      <span>{text}</span>
    </div>
  );
}

function ScenarioContextCard({
  scenario,
  strategyLabel,
  strategyConfidence,
  trend,
  selectedTier,
  onSelectTier,
  recommendation,
  grade,
  sizing,
  currency,
  accountSize,
  riskPct,
  leverage,
  onApplyRecommendation,
  mcResult,
  mtfTf,
}: {
  scenario: AnalysisReport["scenarios"][number];
  strategyLabel: string | null;
  strategyConfidence: number | null;
  trend: NonNullable<AnalysisReport["marketTrend"]> | null;
  selectedTier: number | "avg";
  onSelectTier: (t: number | "avg") => void;
  recommendation: ReturnType<typeof recommendTradeParams> | null;
  grade: "A" | "B" | "C" | "D";
  sizing: ReturnType<typeof sizePosition>;
  currency: "USD" | "KRW";
  accountSize: number;
  riskPct: number;
  leverage: number;
  onApplyRecommendation: () => void;
  mcResult: MonteCarloResult | null;
  mtfTf: string | null;
}) {
  const isLong = scenario.direction === "long";
  const entries = scenario.entries ?? [];
  const wSum = entries.reduce((acc, e) => acc + (e.weight || 0), 0);
  const avgPrice = entries.length === 0 ? null
    : wSum > 0
      ? entries.reduce((acc, e) => acc + e.price * (e.weight / wSum), 0)
      : entries.reduce((acc, e) => acc + e.price, 0) / entries.length;
  const trendDir = trend?.direction;
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="space-y-1 pb-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold uppercase tracking-wider text-primary">AI 분석에서 가져온 시나리오</span>
        </div>
        <CardTitle className="text-base">{scenario.name}</CardTitle>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge className={cn("border", isLong ? "border-grade-a/40 bg-grade-a/10 text-grade-a" : "border-grade-d/40 bg-grade-d/10 text-grade-d")}>
            {isLong ? "롱 (사기)" : "숏 (팔기)"}
          </Badge>
          {strategyLabel ? (
            <Badge className="border border-border bg-muted/40 text-foreground">
              {strategyLabel}{strategyConfidence != null ? ` · 신뢰도 ${Math.round(strategyConfidence * 100)}%` : ""}
            </Badge>
          ) : null}
          {trend ? (
            <Badge className={cn(
              "border",
              trendDir === "up" ? "border-grade-a/40 bg-grade-a/10 text-grade-a"
              : trendDir === "down" ? "border-grade-d/40 bg-grade-d/10 text-grade-d"
              : "border-border bg-muted/40 text-muted-foreground",
            )}>
              {trendDir === "up" ? <TrendingUp className="mr-1 inline h-3 w-3" /> : trendDir === "down" ? <TrendingDown className="mr-1 inline h-3 w-3" /> : <ArrowRight className="mr-1 inline h-3 w-3" />}
              {trendDir === "up" ? "상승 추세" : trendDir === "down" ? "하락 추세" : "횡보"} · 강도 {trend.strength === "strong" ? "강함" : trend.strength === "moderate" ? "보통" : "약함"}
            </Badge>
          ) : null}
        </div>
        {scenario.trigger ? (
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">조건: </span>{scenario.trigger}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {entries.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              분할 진입 — 어느 단계로 진입가를 채울지 선택
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {avgPrice != null ? (
                <TierButton
                  active={selectedTier === "avg"}
                  onClick={() => onSelectTier("avg")}
                  label="평균"
                  price={avgPrice}
                  weight={100}
                  note="가중 평균"
                />
              ) : null}
              {entries.map((e) => (
                <TierButton
                  key={e.tier}
                  active={selectedTier === e.tier}
                  onClick={() => onSelectTier(e.tier)}
                  label={`${e.tier}차`}
                  price={e.price}
                  weight={e.weight}
                  note={e.note}
                  dist={e.distancePct}
                />
              ))}
            </div>
            {/* 단계별 상세 — 진입가에 따라 손절폭/목표폭/R:R/수량이 어떻게 달라지는지 */}
            <details open className="group">
              <summary className="cursor-pointer select-none rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 list-none flex items-center gap-1">
                <span className="transition-transform group-open:rotate-90">▶</span>
                진입 단계 상세 보기
              </summary>
              <div className="mt-2">
                <TierMetricsTable
                  entries={entries}
                  avgPrice={avgPrice ?? 0}
                  invalidation={scenario.invalidation}
                  target={scenario.target}
                  accountSize={accountSize}
                  riskPct={riskPct}
                  currency={currency}
                  selectedTier={selectedTier}
                />
              </div>
            </details>
          </div>
        ) : null}
        {/* AI 권장 사이징 — 즉시 적용된 값 + 도출 근거 */}
        {recommendation ? (
          <div className="rounded-lg border border-primary/30 bg-background/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                AI 권장 사이징 (자동 적용됨)
              </span>
              <button
                type="button"
                onClick={onApplyRecommendation}
                className="text-[10px] underline-offset-2 hover:underline text-muted-foreground hover:text-foreground"
              >
                다시 적용
              </button>
            </div>
            {grade === "D" || grade === "C" ? (
              <div className={cn(
                "mb-2 flex items-start gap-2 rounded border p-2 text-[11px]",
                grade === "D" ? "border-grade-d/40 bg-grade-d/10 text-grade-d" : "border-amber-500/40 bg-amber-500/10 text-amber-400",
              )}>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                <span>
                  <strong>등급 {grade} — {grade === "D" ? "진입 비추천" : "주의 필요"}.</strong>{" "}
                  권장 사이징이 평소보다 작게 잡혔습니다. 표준 미달 항목을 확인하고 진입 여부를 신중히 결정하세요.
                </span>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SizeStat
                label="리스크 한도"
                value={`${riskPct.toFixed(2)}%`}
                sub={sizing.valid ? `${formatCurrency(sizing.maxLoss, currency)} 잃을 한도` : "—"}
                recommended={recommendation.riskPct.toFixed(2) + "%"}
                applied={Math.abs(riskPct - recommendation.riskPct) < 0.01}
              />
              <SizeStat
                label="레버리지"
                value={`${leverage}x`}
                sub={sizing.valid ? `필요 마진 ${(((sizing.positionSize / leverage) / accountSize) * 100).toFixed(1)}%` : "—"}
                recommended={`${recommendation.leverage}x`}
                applied={leverage === recommendation.leverage}
              />
              <SizeStat
                label="노출 금액"
                value={sizing.valid ? `${((sizing.positionSize / accountSize) * 100).toFixed(1)}%` : "—"}
                sub={sizing.valid ? formatCurrency(sizing.positionSize, currency) : ""}
              />
              <SizeStat
                label="수량 / 등급"
                value={sizing.valid ? `${formatNumber(sizing.quantity)}` : "—"}
                sub={`등급 ${grade}`}
                tone={grade === "A" ? "good" : grade === "D" ? "bad" : undefined}
              />
            </div>
            <div className="mt-2 text-[10px] text-muted-foreground">
              <span className="font-semibold">근거:</span> {recommendation.reasoning}
            </div>
          </div>
        ) : null}

        {/* Monte Carlo 결과 시뮬레이션 */}
        {mcResult ? (
          <details open className="group">
            <summary className="cursor-pointer select-none rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 list-none flex items-center gap-1">
              <span className="transition-transform group-open:rotate-90">▶</span>
              시뮬레이션 결과 보기
            </summary>
            <div className="mt-2">
              <MonteCarloPreview mc={mcResult} mtfTf={mtfTf} />
            </div>
          </details>
        ) : null}

        {scenario.qualityIssues && scenario.qualityIssues.length > 0 ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              검토 항목 — 표준 미달 (진입 전 본인 판단)
            </div>
            <ul className="space-y-0.5 text-[10px] text-amber-300/80">
              {scenario.qualityIssues.map((q, i) => (
                <li key={i}>· {q}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MonteCarloPreview({ mc, mtfTf }: { mc: MonteCarloResult; mtfTf: string | null }) {
  const winPct = mc.winRate * 100;
  const lossPct = mc.lossRate * 100;
  const timeoutPct = mc.timeoutRate * 100;
  const evTone = mc.expectedR > 0 ? "text-grade-a" : mc.expectedR < 0 ? "text-grade-d" : "text-muted-foreground";
  const winBarsLabel = mc.medianBarsToWin != null && mtfTf ? `${mc.medianBarsToWin}봉` : "—";
  const lossBarsLabel = mc.medianBarsToLoss != null && mtfTf ? `${mc.medianBarsToLoss}봉` : "—";
  return (
    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400">
          결과 시뮬레이션 (Monte Carlo · {mc.runs.toLocaleString()}회 · {mtfTf ?? "MTF"} 변동성 기준)
        </span>
      </div>
      {/* 비율 바 */}
      <div className="mb-2 flex h-2.5 w-full overflow-hidden rounded-full border border-border bg-background/40">
        <div className="bg-grade-a" style={{ width: `${winPct}%` }} title={`목표 도달 ${winPct.toFixed(1)}%`} />
        <div className="bg-grade-d" style={{ width: `${lossPct}%` }} title={`손절 ${lossPct.toFixed(1)}%`} />
        <div className="bg-muted-foreground/40" style={{ width: `${timeoutPct}%` }} title={`시간 만료 ${timeoutPct.toFixed(1)}%`} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SizeStat label="목표 도달" value={`${winPct.toFixed(1)}%`} sub={`평균 ${winBarsLabel}`} tone="good" />
        <SizeStat label="손절 적중" value={`${lossPct.toFixed(1)}%`} sub={`평균 ${lossBarsLabel}`} tone="bad" />
        <SizeStat label="시간 만료" value={`${timeoutPct.toFixed(1)}%`} sub={`${mc.barLimit}봉 한도`} />
        <SizeStat label="기대 결과" value={`${mc.expectedR >= 0 ? "+" : ""}${mc.expectedR.toFixed(2)}R`} sub={`R:R ${mc.rrRatio.toFixed(2)}`} tone={mc.expectedR > 0 ? "good" : mc.expectedR < 0 ? "bad" : undefined} />
      </div>
      <div className={cn("mt-2 text-[10px]", evTone)}>
        <span className="font-semibold">해석:</span>{" "}
        {mc.expectedR > 0.3
          ? "기대값 양수. 같은 셋업을 반복하면 통계적으로 이익."
          : mc.expectedR > 0
            ? "기대값 약하게 양수. 빈도 높지 않으면 의미 약함."
            : mc.expectedR > -0.3
              ? "기대값 0 부근. 통계적 우위 거의 없음 — 재검토 권장."
              : "기대값 음수. 같은 셋업 반복 시 손실 누적."}
        {" "}변동성 {mc.atrPctPerBar.toFixed(2)}% / 봉 기준 1000회 무작위 경로 시뮬.
      </div>
    </div>
  );
}

function TierMetricsTable({
  entries,
  avgPrice,
  invalidation,
  target,
  accountSize,
  riskPct,
  currency,
  selectedTier,
}: {
  entries: NonNullable<AnalysisReport["scenarios"][number]["entries"]>;
  avgPrice: number;
  invalidation: number;
  target: number;
  accountSize: number;
  riskPct: number;
  currency: "USD" | "KRW";
  selectedTier: number | "avg";
}) {
  const ROUND_TRIP = 0.12; // 왕복 수수료/슬리피지
  const rows: Array<{
    key: string;
    label: string;
    price: number;
    weight: number;
    selected: boolean;
  }> = [
    { key: "avg", label: "평균", price: avgPrice, weight: 100, selected: selectedTier === "avg" },
    ...entries.map((e) => ({
      key: `t${e.tier}`,
      label: `${e.tier}차`,
      price: e.price,
      weight: e.weight,
      selected: selectedTier === e.tier,
    })),
  ];

  const maxLoss = accountSize * (riskPct / 100);

  const colGrid = "grid-cols-[auto_repeat(7,minmax(0,1fr))]";

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-background/40">
      <div className={cn("grid gap-x-2 border-b border-border bg-background/60 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[640px]", colGrid)}>
        <span>단계</span>
        <span className="text-right">진입</span>
        <span className="text-right">손절폭</span>
        <span className="text-right">목표폭</span>
        <span className="text-right">R:R</span>
        <span className="text-right">수량</span>
        <span className="text-right">노출 금액</span>
        <span className="text-right">잃을 한도</span>
      </div>
      {rows.map((r) => {
        const stopPct = r.price > 0 ? (Math.abs(invalidation - r.price) / r.price) * 100 : 0;
        const targetPct = r.price > 0 ? (Math.abs(target - r.price) / r.price) * 100 : 0;
        const netStop = stopPct + ROUND_TRIP;
        const netTarget = Math.max(0, targetPct - ROUND_TRIP);
        const rr = netStop > 0 ? netTarget / netStop : 0;
        const riskPerUnit = Math.abs(r.price - invalidation);
        const qty = riskPerUnit > 0 ? Math.floor((maxLoss / riskPerUnit) * 1e4) / 1e4 : 0;
        const positionSize = qty * r.price;
        const exposurePct = accountSize > 0 ? (positionSize / accountSize) * 100 : 0;
        return (
          <div
            key={r.key}
            className={cn(
              "grid gap-x-2 border-b border-border/30 px-2.5 py-1.5 font-mono text-[11px] tabular-nums last:border-b-0 min-w-[640px]",
              colGrid,
              r.selected && "bg-primary/10",
            )}
          >
            <span className="font-sans font-semibold">
              {r.label}
              <span className="ml-1 text-[9px] text-muted-foreground">{r.weight}%</span>
            </span>
            <span className="text-right">${formatNumber(r.price)}</span>
            <span className="text-right text-grade-d">−{stopPct.toFixed(2)}%</span>
            <span className="text-right text-grade-a">+{targetPct.toFixed(2)}%</span>
            <span className={cn("text-right font-semibold", rr >= 1.5 ? "text-grade-a" : "text-grade-c")}>
              {rr.toFixed(2)}R
            </span>
            <span className="text-right">{formatNumber(qty)}</span>
            <span className="text-right">
              {formatCurrency(positionSize, currency)}
              <span className="ml-1 text-[9px] text-muted-foreground">({exposurePct.toFixed(1)}%)</span>
            </span>
            <span className="text-right text-muted-foreground">{formatCurrency(maxLoss, currency)}</span>
          </div>
        );
      })}
      <div className="px-2.5 py-1 text-[10px] text-muted-foreground min-w-[640px]">
        손절·목표 가격은 시나리오 공유. 단계별 진입가에 따라 손절폭·목표폭·R:R·수량·노출 금액이 달라집니다. 잃을 한도는 리스크 % 설정으로 고정.
      </div>
    </div>
  );
}

function SizeStat({
  label,
  value,
  sub,
  recommended,
  applied,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  recommended?: string;
  applied?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded border border-border bg-background/40 p-2">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        {recommended && applied ? (
          <span className="rounded bg-primary/20 px-1 py-0.5 text-[9px] font-semibold text-primary">권장</span>
        ) : null}
      </div>
      <div
        className={cn(
          "mt-0.5 font-mono text-base font-bold tabular-nums",
          tone === "good" && "text-grade-a",
          tone === "bad" && "text-grade-d",
        )}
      >
        {value}
      </div>
      {sub ? <div className="text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function TierButton({
  active,
  onClick,
  label,
  price,
  weight,
  note,
  dist,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  price: number;
  weight: number;
  note: string;
  dist?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border p-2 text-left transition-colors",
        active
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
        <span className="text-[10px]">{weight}%</span>
      </div>
      <div className="mt-0.5 font-mono text-sm font-bold tabular-nums">${formatNumber(price)}</div>
      {dist != null ? (
        <div className="text-[10px] font-mono tabular-nums">
          현재가 {dist >= 0 ? "+" : ""}{dist.toFixed(2)}%
        </div>
      ) : null}
      <div className="truncate text-[10px] text-muted-foreground">{note}</div>
    </button>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "default" | "bad" }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono tabular-nums", tone === "bad" ? "text-grade-d" : "text-foreground")}>{value}</span>
    </div>
  );
}

