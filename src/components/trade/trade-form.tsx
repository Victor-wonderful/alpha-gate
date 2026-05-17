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
  DAILY_LOSS_LIMIT_R,
  ENTRY_BAND_PCT,
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
import { TradingViewWidget } from "./tradingview-widget";
import { saveTradeAction } from "@/app/app/_actions";
import { cn, formatCurrency } from "@/lib/utils";

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
  const [leverage, setLeverage] = useState(1);
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

  const duplicateSymbol = money.openPositions.some((p) => p.symbol === symbol);

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
      const res = await saveTradeAction({ input, grade, sizing });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("거래를 저널에 저장했습니다.");
      router.push(`/app/journal/${res.id}`);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="space-y-6">
        {/* 1. 거래 입력 */}
        <Card>
          <CardHeader>
            <CardTitle>거래 입력</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>코인</Label>
                <Select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                  {(SYMBOLS.includes(symbol) ? SYMBOLS : [symbol, ...SYMBOLS]).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>방향</Label>
                <Select value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
                  <option value="long">롱</option>
                  <option value="short">숏</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>타임프레임</Label>
                <Select value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}>
                  {TIMEFRAMES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>진입가</Label>
                <Input type="number" inputMode="decimal" step="any" value={entry} onChange={(e) => setEntry(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>손절가</Label>
                <Input type="number" inputMode="decimal" step="any" value={stop} onChange={(e) => setStop(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>목표가</Label>
                <Input type="number" inputMode="decimal" step="any" value={target} onChange={(e) => setTarget(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>계좌 크기 ({currency})</Label>
                <Input type="number" inputMode="decimal" value={accountSize} onChange={(e) => setAccountSize(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>허용 손실률 (%)</Label>
                <Input type="number" inputMode="decimal" step="0.1" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>레버리지</Label>
              <div className="flex flex-wrap gap-2">
                {[1, 3, 5, 10, 20, 50].map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    onClick={() => setLeverage(lv)}
                    className={
                      "rounded-md border px-3 py-1.5 text-sm transition-colors " +
                      (leverage === lv
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background/40 text-muted-foreground hover:bg-accent/40")
                    }
                  >
                    {lv}x
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                레버리지는 손익비와 등급에 영향을 주지 않습니다. 필요한 마진(증거금) 계산만 달라집니다.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 2. 시장 구조 체크리스트 */}
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

        {/* 4. 자금 관리 상태 (NEW, 자동) */}
        <Card>
          <CardHeader>
            <CardTitle>자금 관리 상태</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <StatCell
                label="오늘 거래"
                value={`${money.todayClosedCount}건`}
                sub={`${money.todayCumulativeR.toFixed(2)}R 누적`}
                tone={money.todayCumulativeR < 0 ? "bad" : money.todayCumulativeR > 0 ? "good" : undefined}
              />
              <StatCell
                label="일일 한도까지"
                value={`${(money.todayCumulativeR - DAILY_LOSS_LIMIT_R).toFixed(2)}R`}
                sub={`한도 ${DAILY_LOSS_LIMIT_R}R`}
                tone={money.todayCumulativeR <= DAILY_LOSS_LIMIT_R ? "bad" : undefined}
              />
              <StatCell
                label="진행 중 노출"
                value={`${money.openExposurePct.toFixed(0)}%`}
                sub={`${money.openPositions.length}개 포지션`}
                tone={money.openExposurePct >= SAME_DIRECTION_EXPOSURE_PCT ? "bad" : undefined}
              />
            </div>

            {money.openPositions.length > 0 ? (
              <div className="rounded-md border border-border bg-background/30 p-3 text-xs">
                <div className="mb-1.5 text-[11px] uppercase text-muted-foreground">진행 중 포지션</div>
                <div className="space-y-1">
                  {money.openPositions.slice(0, 6).map((p) => (
                    <div key={p.id} className="flex items-center justify-between">
                      <span>
                        {p.symbol} <span className="text-muted-foreground">{p.direction === "long" ? "롱" : "숏"}</span>
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {formatCurrency(p.positionSize, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {duplicateSymbol ? (
              <WarnBar text={`${symbol} 진행 중 포지션이 이미 있습니다 — 중복 진입 재검토.`} />
            ) : null}
            {money.todayCumulativeR <= DAILY_LOSS_LIMIT_R ? (
              <WarnBar text="일일 손실 한도에 도달했습니다. 오늘은 거래 중단을 권장합니다." />
            ) : null}
          </CardContent>
        </Card>

        {/* 5. 시장 컨텍스트 (NEW, 자동) */}
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

        <Card>
          <CardHeader>
            <CardTitle>{symbol} · {timeframe}</CardTitle>
          </CardHeader>
          <CardContent>
            <TradingViewWidget symbol={symbol} timeframe={timeframe} />
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
