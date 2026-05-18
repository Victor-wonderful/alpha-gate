"use client";

import { Suspense, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  MARKET_CHECK_KEYS,
  MARKET_CHECK_LABELS,
  TRIGGER_CHECK_KEYS,
  TRIGGER_CHECK_LABELS,
  ENTRY_BAND_PCT,
  type Direction,
  type MarketContext,
  type MoneyContext,
  type Timeframe,
  type TradeInput,
} from "@/types/trade";
import { gradeTrade } from "@/lib/grading";
import { sizePosition } from "@/lib/sizing";
import { ResultPanel } from "./result-panel";
import { SizingPanel } from "./sizing-panel";
import { saveTradeAction } from "@/app/app/_actions";
import { cn, formatNumber } from "@/lib/utils";

const ENTRY_ACCENT = "border-primary/40 focus-within:border-primary";
const STOP_ACCENT = "border-grade-d/40 focus-within:border-grade-d";
const TARGET_ACCENT = "border-grade-a/40 focus-within:border-grade-a";

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

export function TradeForm(props: {
  initialAccountSize: number;
  initialRiskPct: number;
  currency: "USD" | "KRW";
  initialSymbol: string;
  money: MoneyContext;
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
}: {
  initialAccountSize: number;
  initialRiskPct: number;
  currency: "USD" | "KRW";
  initialSymbol: string;
  money: MoneyContext;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const triggerHint = params.get("trigger") ?? "";

  // 백테스트 모드: 분석 페이지에서 ?mode=backtest&at=ISO 로 넘어옴
  const backtestMode = params.get("mode") === "backtest";
  const backtestAtIso = backtestMode ? params.get("at") : null;

  const [symbol, setSymbol] = useState(() => {
    const q = params.get("symbol");
    return q && SYMBOLS.includes(q) ? q : q && /^[A-Z0-9]{2,15}USDT$/i.test(q) ? q.toUpperCase() : initialSymbol;
  });
  const [direction, setDirection] = useState<Direction>(() => {
    const q = params.get("direction");
    return q === "short" ? "short" : "long";
  });
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [entry, setEntry] = useState(() => params.get("entry") ?? "");
  const [stop, setStop] = useState(() => params.get("stop") ?? "");
  const [target, setTarget] = useState(() => params.get("target") ?? "");
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

  // 시장 컨텍스트: 심볼 변경 시 재fetch
  const [marketCtx, setMarketCtx] = useState<MarketContext>({
    btcPrice: null,
    btc24hChangePct: null,
    fundingRate: null,
    minutesToFunding: null,
  });
  useEffect(() => {
    let alive = true;
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
      money,
      marketCtx,
    }),
    [symbol, direction, timeframe, entry, stop, target, accountSize, riskPct, market, trigger, money, marketCtx],
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

  function save() {
    if (!sizing.valid) {
      toast.error("입력을 확인하세요. 포지션 사이징이 유효하지 않습니다.");
      return;
    }
    startTransition(async () => {
      const res = await saveTradeAction({
        input,
        grade,
        sizing,
        leverage,
        mode: backtestMode ? "backtest" : "live",
        simulatedAt: backtestAtIso,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (backtestMode && res.backtest) {
        const r = res.backtest.resultR;
        toast.success(
          `백테스트 완료 — ${r >= 0 ? "+" : ""}${r.toFixed(2)}R · ${res.backtest.exitReason === "target" ? "목표 도달" : res.backtest.exitReason === "stop" ? "손절" : "시간 만료"}`,
        );
      } else {
        toast.success("거래를 저널에 저장했습니다.");
      }
      router.push(`/app/journal/${res.id}`);
    });
  }

  // 거래소 스타일 계산값
  const entryNumV = Number(entry) || 0;
  const stopNumV = Number(stop) || 0;
  const targetNumV = Number(target) || 0;
  const accountNumV = Number(accountSize) || 0;
  const currentPrice = marketCtx.btcPrice; // BTC만. 다른 심볼 현재가는 향후 marketCtx 확장
  const stopPct =
    entryNumV > 0 && stopNumV > 0
      ? ((stopNumV - entryNumV) / entryNumV) * 100
      : 0;
  const targetPct =
    entryNumV > 0 && targetNumV > 0
      ? ((targetNumV - entryNumV) / entryNumV) * 100
      : 0;
  // 리스크%에서 도출되는 사이즈 (read-only 미리보기)
  const lossUsd = accountNumV * (Number(riskPct) || 0) / 100;
  const riskPerUnit = Math.abs(entryNumV - stopNumV);
  const previewQty = riskPerUnit > 0 ? lossUsd / riskPerUnit : 0;
  const previewNotional = previewQty * entryNumV;
  const notionalPctOfAccount = accountNumV > 0 ? (previewNotional / accountNumV) * 100 : 0;

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
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="space-y-6">
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
              {currentPrice && symbol === "BTCUSDT" ? (
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
            {/* Price inputs with auto-% */}
            <div className="space-y-2">
              <PriceRow
                label="진입가"
                value={entry}
                onChange={setEntry}
                accent={ENTRY_ACCENT}
                hint={
                  currentPrice && symbol === "BTCUSDT" && entryNumV > 0
                    ? `현재가 대비 ${(((entryNumV - currentPrice) / currentPrice) * 100).toFixed(2)}%`
                    : null
                }
              />
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

            {/* Size / quantity section */}
            <div className="space-y-2 rounded-md border border-border bg-background/30 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">사이즈 (리스크 기반)</span>
                <span className="font-mono text-muted-foreground">
                  {previewQty > 0 ? `${formatNumber(previewQty, { maximumFractionDigits: 4 })} ${symbol.replace("USDT", "")}` : "—"}
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
              <div className="grid grid-cols-2 gap-2 pt-1">
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
                    onChange={(e) => setRiskPct(e.target.value)}
                    className="h-9 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Leverage slider */}
            <div className="space-y-2 rounded-md border border-border bg-background/30 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">레버리지</Label>
                <span className="font-mono text-sm font-bold text-foreground">{leverage}x</span>
              </div>
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex flex-wrap gap-1">
                {[1, 3, 5, 10, 20, 50].map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    onClick={() => setLeverage(lv)}
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
          </CardContent>
        </Card>

        {/* 2. 포지션 사이징 — 실시간 계산기 */}
        <SizingPanel
          sizing={sizing}
          currency={currency}
          accountSize={Number(accountSize) || 0}
          riskPct={Number(riskPct) || 0}
          leverage={leverage}
          entry={Number(entry) || 0}
          stop={Number(stop) || 0}
          target={Number(target) || undefined}
          direction={direction}
          onApplyLeverage={setLeverage}
        />

        {/* 3. 시장 구조 체크리스트 */}
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

        {/* 3. 트리거 검증 (NEW) */}
        <Card>
          <CardHeader>
            <CardTitle>트리거 검증</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {triggerHint ? (
              <div className="rounded-md border border-border bg-background/30 p-3 text-sm">
                <div className="text-[11px] uppercase text-muted-foreground">AI 시나리오 트리거</div>
                <div className="mt-1">{triggerHint}</div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-background/20 p-3 text-xs text-muted-foreground">
                AI 분석 페이지에서 시나리오를 선택하면 트리거 조건이 자동으로 채워집니다.
              </div>
            )}
            <div className="space-y-1">
              {TRIGGER_CHECK_KEYS.map((k) => (
                <Checkbox
                  key={k}
                  checked={trigger[k]}
                  onChange={(e) => setTrigger({ ...trigger, [k]: e.target.checked })}
                  label={TRIGGER_CHECK_LABELS[k]}
                />
              ))}
            </div>
            {entryNum > 0 ? (
              <div className="text-[11px] text-muted-foreground">
                계획 진입 구간 (±{ENTRY_BAND_PCT}%): {entryBandLow.toFixed(2)} ~ {entryBandHigh.toFixed(2)}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* 4. 시장 컨텍스트 (NEW, 자동) */}
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

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <ResultPanel
          grade={grade}
          sizing={sizing}
          currency={currency}
          accountSize={Number(accountSize) || 0}
          riskPct={Number(riskPct) || 0}
          leverage={leverage}
          entry={Number(entry) || 0}
          stop={Number(stop) || 0}
          target={Number(target) || undefined}
          direction={direction}
          onApplyLeverage={setLeverage}
        />
        <Button className="w-full" size="lg" onClick={save} disabled={pending}>
          {pending ? "저장 중..." : "거래 저장"}
        </Button>
      </aside>
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
