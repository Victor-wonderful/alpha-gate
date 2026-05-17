"use client";

import { Suspense, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
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
  PSYCH_CHECK_KEYS,
  PSYCH_CHECK_LABELS,
  type Direction,
  type Timeframe,
  type TradeInput,
} from "@/types/trade";
import { gradeTrade } from "@/lib/grading";
import { sizePosition } from "@/lib/sizing";
import { ResultPanel } from "./result-panel";
import { TradingViewWidget } from "./tradingview-widget";
import { saveTradeAction } from "@/app/app/_actions";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT"];
const TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h", "1D"];

const defaultMarket = Object.fromEntries(MARKET_CHECK_KEYS.map((k) => [k, false])) as TradeInput["market"];
const defaultPsych = Object.fromEntries(PSYCH_CHECK_KEYS.map((k) => [k, false])) as TradeInput["psych"];

export function TradeForm(props: {
  initialAccountSize: number;
  initialRiskPct: number;
  currency: "USD" | "KRW";
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
}: {
  initialAccountSize: number;
  initialRiskPct: number;
  currency: "USD" | "KRW";
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [symbol, setSymbol] = useState(() => {
    const q = params.get("symbol");
    return q && SYMBOLS.includes(q) ? q : q && /^[A-Z0-9]{2,15}USDT$/i.test(q) ? q.toUpperCase() : "BTCUSDT";
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
  const [psych, setPsych] = useState<TradeInput["psych"]>(defaultPsych);
  const [newsRecent, setNewsRecent] = useState(false);
  const [losingStreak, setLosingStreak] = useState(false);

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
      psych,
      flags: { newsRecent, losingStreak },
    }),
    [symbol, direction, timeframe, entry, stop, target, accountSize, riskPct, market, psych, newsRecent, losingStreak],
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

        <Card>
          <CardHeader>
            <CardTitle>심리 상태 체크리스트</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {PSYCH_CHECK_KEYS.map((k) => (
              <Checkbox
                key={k}
                checked={psych[k]}
                onChange={(e) => setPsych({ ...psych, [k]: e.target.checked })}
                label={PSYCH_CHECK_LABELS[k]}
              />
            ))}
            <div className="mt-3 border-t border-border pt-3">
              <Checkbox
                checked={newsRecent}
                onChange={(e) => setNewsRecent(e.target.checked)}
                label="뉴스 직후 진입이다"
              />
              <Checkbox
                checked={losingStreak}
                onChange={(e) => setLosingStreak(e.target.checked)}
                label="최근 연속 손실 상태다"
              />
            </div>
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
