"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Trophy, RotateCcw, Zap, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type GameState = "idle" | "waiting" | "settling" | "result";
type Direction = "call" | "put";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
const SYMBOL_LABELS: Record<string, string> = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  SOLUSDT: "SOL",
};
const CANDLE_SECONDS = 60;

// 원형 카운트다운 컴포넌트
function CircularCountdown({
  remaining,
  total,
}: {
  remaining: number;
  total: number;
}) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, remaining / total);
  const offset = circ * (1 - pct);
  const isUrgent = remaining <= 10;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="120" height="120" className="-rotate-90">
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-muted/20"
          strokeDasharray={circ}
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className={cn(
            "transition-all duration-500",
            isUrgent ? "text-red-500" : "text-primary",
          )}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span
          className={cn(
            "font-mono text-3xl font-black tabular-nums leading-none",
            isUrgent ? "text-red-500 animate-pulse" : "text-foreground",
          )}
        >
          {String(remaining).padStart(2, "0")}
        </span>
        <span className="text-[10px] text-muted-foreground mt-0.5">초</span>
      </div>
    </div>
  );
}

// 실시간 가격 표시
function PriceTicker({
  symbol,
  onPrice,
}: {
  symbol: string;
  onPrice?: (p: number) => void;
}) {
  const [price, setPrice] = useState<number | null>(null);
  const [change, setChange] = useState<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    async function fetchPrice() {
      try {
        const res = await fetch(`/api/binary/ticker?symbol=${symbol}`);
        const data = await res.json();
        if (!alive) return;
        const newPrice = data.price as number;
        if (prevRef.current !== null) {
          setFlash(
            newPrice > prevRef.current
              ? "up"
              : newPrice < prevRef.current
                ? "down"
                : null,
          );
          setTimeout(() => setFlash(null), 600);
        }
        prevRef.current = newPrice;
        setPrice(newPrice);
        setChange(data.change24h as number);
        onPrice?.(newPrice);
      } catch {
        // 네트워크 오류 무시
      }
    }
    fetchPrice();
    const id = setInterval(fetchPrice, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [symbol, onPrice]);

  if (!price)
    return <div className="h-12 animate-pulse bg-muted/20 rounded" />;

  return (
    <div className="text-center">
      <div
        className={cn(
          "font-mono text-4xl font-black tabular-nums transition-colors duration-300",
          flash === "up"
            ? "text-green-400"
            : flash === "down"
              ? "text-red-400"
              : "text-foreground",
        )}
      >
        $
        {price.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </div>
      {change !== null && (
        <div
          className={cn(
            "mt-1 text-sm font-medium",
            change >= 0 ? "text-green-400" : "text-red-400",
          )}
        >
          {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}% (24h)
        </div>
      )}
    </div>
  );
}

// 게임 히스토리 배지
function HistoryBadges({ games }: { games: Array<{ won: boolean }> }) {
  if (games.length === 0)
    return (
      <span className="text-xs text-muted-foreground">게임 기록 없음</span>
    );
  return (
    <div className="flex gap-1">
      {games.slice(0, 10).map((g, i) => (
        <div
          key={i}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
            g.won
              ? "bg-green-500/20 text-green-400"
              : "bg-red-500/20 text-red-400",
          )}
        >
          {g.won ? "W" : "L"}
        </div>
      ))}
    </div>
  );
}

interface Props {
  initialPoints: number;
  totalGames: number;
  wins: number;
  recentGames: Array<{
    won: boolean;
    pnl_points: number;
    symbol: string;
    direction: string;
  }>;
  currentStreak: number;
}

export function GameClient({
  initialPoints,
  totalGames,
  wins,
  recentGames,
  currentStreak: initStreak,
}: Props) {
  const [points, setPoints] = useState(initialPoints);
  const [symbol, setSymbol] = useState<string>("BTCUSDT");
  const [betInput, setBetInput] = useState("100");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [gameId, setGameId] = useState<string | null>(null);
  const [entryPrice, setEntryPrice] = useState<number>(0);
  const [candleCloseTime, setCandleCloseTime] = useState<number>(0);
  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState<{
    won: boolean;
    exitPrice: number;
    pnlPoints: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState(recentGames);
  const [streak, setStreak] = useState(initStreak);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [games, setGames] = useState(totalGames);
  const [winCount, setWinCount] = useState(wins);

  const bet = Number(betInput) || 0;
  const winPayout = Math.round(bet * 0.8);
  const winRate = games > 0 ? Math.round((winCount / games) * 100) : 0;

  // settle 함수 — useCallback으로 메모이즈
  const settle = useCallback(async () => {
    if (!gameId) return;
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(`/api/binary/settle/${gameId}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "정산 오류");
        setGameState("idle");
        return;
      }
      setResult(data);
      setPoints(data.pointsTotal);
      setGames((g) => g + 1);
      if (data.won) {
        setWinCount((w) => w + 1);
        setStreak((s) => s + 1);
      } else {
        setStreak(0);
      }
      setHistory((h) => [
        {
          won: data.won,
          pnl_points: data.pnlPoints,
          symbol,
          direction: "call",
        },
        ...h,
      ]);
      setGameState("result");
    } catch {
      toast.error("정산 중 오류가 발생했습니다");
      setGameState("idle");
    }
  }, [gameId, symbol]);

  // 카운트다운 tick
  useEffect(() => {
    if (gameState !== "waiting") return;
    const tick = setInterval(() => {
      const r = Math.max(
        0,
        Math.ceil((candleCloseTime - Date.now()) / 1000),
      );
      setRemaining(r);
      if (r === 0) {
        clearInterval(tick);
        setGameState("settling");
        settle();
      }
    }, 500);
    return () => clearInterval(tick);
  }, [gameState, candleCloseTime, settle]);

  async function startGame(direction: Direction) {
    if (bet < 10) {
      toast.error("최소 베팅은 10pt입니다");
      return;
    }
    if (bet > points) {
      toast.error("포인트가 부족합니다");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/binary/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, direction, betPoints: bet }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "오류 발생");
        return;
      }
      setGameId(data.gameId);
      setEntryPrice(data.entryPrice);
      setCandleCloseTime(data.candleCloseTime);
      setPoints(data.pointsRemaining);
      const initRemaining = Math.max(
        0,
        Math.ceil((data.candleCloseTime - Date.now()) / 1000),
      );
      setRemaining(initRemaining);
      setGameState("waiting");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setGameState("idle");
    setGameId(null);
    setResult(null);
    setEntryPrice(0);
    setCandleCloseTime(0);
  }

  function setQuickBet(pct: number) {
    const amount = Math.max(10, Math.floor((points * pct) / 10) * 10);
    setBetInput(String(amount));
  }

  return (
    <div className="mx-auto max-w-lg space-y-3">
      {/* 통계 바 */}
      <div className="grid grid-cols-4 gap-2">
        {[
          {
            label: "포인트",
            value: `${points.toLocaleString()} pt`,
            icon: <Trophy className="h-3.5 w-3.5 text-yellow-500" />,
          },
          { label: "승률", value: `${winRate}%` },
          {
            label: "연승",
            value: `${streak}🔥`,
            highlight: streak >= 3,
          },
          { label: "총 게임", value: `${games}판` },
        ].map((s) => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="py-2 px-3">
              <div className="flex items-center gap-1 mb-0.5">
                {s.icon}
                <span className="text-[10px] text-muted-foreground">
                  {s.label}
                </span>
              </div>
              <div
                className={cn(
                  "font-mono text-sm font-bold tabular-nums",
                  s.highlight && "text-orange-400",
                )}
              >
                {s.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 메인 게임 카드 */}
      <Card className="border-border/60 overflow-hidden">
        <CardContent className="p-0">
          {/* 심볼 탭 */}
          <div className="flex border-b border-border/50">
            {SYMBOLS.map((s) => (
              <button
                key={s}
                onClick={() => gameState === "idle" && setSymbol(s)}
                disabled={gameState !== "idle"}
                className={cn(
                  "flex-1 py-2.5 text-sm font-semibold transition-colors",
                  symbol === s
                    ? "bg-primary/10 text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
                )}
              >
                {SYMBOL_LABELS[s]}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-5">
            {/* 실시간 가격 */}
            <PriceTicker symbol={symbol} onPrice={setCurrentPrice} />

            {/* IDLE: 베팅 UI */}
            {gameState === "idle" && (
              <div className="space-y-4">
                {/* 베팅 입력 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">
                      베팅 포인트
                    </label>
                    <span className="text-xs text-muted-foreground">
                      보유: {points.toLocaleString()} pt
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={betInput}
                      onChange={(e) => setBetInput(e.target.value)}
                      className="font-mono text-base"
                      min={10}
                    />
                  </div>
                  {/* 빠른 베팅 */}
                  <div className="flex gap-1.5">
                    {(
                      [
                        ["10%", 0.1],
                        ["25%", 0.25],
                        ["50%", 0.5],
                        ["MAX", 1],
                      ] as [string, number][]
                    ).map(([label, pct]) => (
                      <button
                        key={label}
                        onClick={() => setQuickBet(pct * 100)}
                        className="flex-1 rounded-md border border-border/50 py-1 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {/* 예상 수익 */}
                  {bet >= 10 && (
                    <div className="flex justify-between rounded-md bg-muted/20 px-3 py-2 text-xs">
                      <span className="text-green-400">
                        이기면{" "}
                        <span className="font-mono font-bold">
                          +{winPayout} pt
                        </span>
                      </span>
                      <span className="text-muted-foreground/50">|</span>
                      <span className="text-red-400">
                        지면{" "}
                        <span className="font-mono font-bold">-{bet} pt</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Call / Put 버튼 */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => startGame("call")}
                    disabled={loading || bet < 10 || bet > points}
                    className="group relative h-16 rounded-xl bg-green-500/10 border border-green-500/30 hover:bg-green-500/20 hover:border-green-500/60 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <TrendingUp className="h-5 w-5 text-green-400 group-hover:scale-110 transition-transform" />
                      <span className="text-sm font-bold text-green-400">
                        CALL 상승
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => startGame("put")}
                    disabled={loading || bet < 10 || bet > points}
                    className="group relative h-16 rounded-xl bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/60 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <TrendingDown className="h-5 w-5 text-red-400 group-hover:scale-110 transition-transform" />
                      <span className="text-sm font-bold text-red-400">
                        PUT 하락
                      </span>
                    </div>
                  </button>
                </div>
                <p className="text-center text-[11px] text-muted-foreground/60">
                  다음 1분봉 종가 기준 판정 · 승리 시 베팅액 × 1.8배
                </p>
              </div>
            )}

            {/* WAITING: 카운트다운 */}
            {(gameState === "waiting" || gameState === "settling") && (
              <div className="space-y-4 text-center">
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>진입가</span>
                  <span className="font-mono font-bold text-foreground">
                    $
                    {entryPrice.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                {currentPrice && (
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="text-muted-foreground">현재가</span>
                    <span
                      className={cn(
                        "font-mono font-bold",
                        currentPrice > entryPrice
                          ? "text-green-400"
                          : currentPrice < entryPrice
                            ? "text-red-400"
                            : "text-foreground",
                      )}
                    >
                      $
                      {currentPrice.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      <span className="ml-1 text-[10px]">
                        (
                        {currentPrice > entryPrice
                          ? "▲"
                          : currentPrice < entryPrice
                            ? "▼"
                            : "–"}
                        {Math.abs(
                          ((currentPrice - entryPrice) / entryPrice) * 100,
                        ).toFixed(3)}
                        %)
                      </span>
                    </span>
                  </div>
                )}
                <div className="flex justify-center py-2">
                  {gameState === "settling" ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      <span className="text-sm text-muted-foreground">
                        정산 중...
                      </span>
                    </div>
                  ) : (
                    <CircularCountdown
                      remaining={remaining}
                      total={CANDLE_SECONDS}
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground animate-pulse">
                  캔들 종가 확정 대기 중
                </p>
              </div>
            )}

            {/* RESULT: 결과 */}
            {gameState === "result" && result && (
              <div className="space-y-4">
                <div
                  className={cn(
                    "rounded-xl p-4 text-center border",
                    result.won
                      ? "bg-green-500/10 border-green-500/30"
                      : "bg-red-500/10 border-red-500/30",
                  )}
                >
                  <div className="text-3xl mb-1">
                    {result.won ? "🎉" : "😢"}
                  </div>
                  <div
                    className={cn(
                      "text-2xl font-black",
                      result.won ? "text-green-400" : "text-red-400",
                    )}
                  >
                    {result.won ? "승리!" : "패배"}
                  </div>
                  <div
                    className={cn(
                      "font-mono text-xl font-bold mt-1 tabular-nums",
                      result.won ? "text-green-400" : "text-red-400",
                    )}
                  >
                    {result.won ? `+${result.pnlPoints}` : result.pnlPoints}{" "}
                    pt
                  </div>
                </div>
                <div className="space-y-1.5 text-sm">
                  {(
                    [
                      [
                        "진입가",
                        `$${entryPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
                      ],
                      [
                        "종가",
                        `$${result.exitPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
                      ],
                      [
                        "변동",
                        `${result.exitPrice > entryPrice ? "▲" : "▼"} ${Math.abs(((result.exitPrice - entryPrice) / entryPrice) * 100).toFixed(3)}%`,
                      ],
                    ] as [string, string][]
                  ).map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono font-medium tabular-nums">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
                <Button onClick={reset} className="w-full gap-2">
                  <RotateCcw className="h-4 w-4" />
                  다시 하기
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 최근 게임 히스토리 */}
      {history.length > 0 && (
        <Card className="border-border/50">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Target className="h-3.5 w-3.5" />
                최근 게임
              </span>
              <span className="text-xs text-muted-foreground">
                {winCount}승 {games - winCount}패
              </span>
            </div>
            <HistoryBadges games={history} />
            {streak >= 3 && (
              <div className="mt-2 flex items-center gap-1 text-xs text-orange-400">
                <Zap className="h-3 w-3" />
                {streak}연승 중! 기세를 이어가세요
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
