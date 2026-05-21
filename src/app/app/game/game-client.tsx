"use client";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Trophy, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CountdownTimer } from "@/components/game/countdown-timer";
import { cn } from "@/lib/utils";

type GameState = "idle" | "waiting" | "result";
type Direction = "call" | "put";
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
const SYMBOL_LABELS: Record<string, string> = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  SOLUSDT: "SOL",
};

export function GameClient({ initialPoints }: { initialPoints: number }) {
  const [points, setPoints] = useState(initialPoints);
  const [symbol, setSymbol] = useState<string>("BTCUSDT");
  const [betInput, setBetInput] = useState("100");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [gameId, setGameId] = useState<string | null>(null);
  const [entryPrice, setEntryPrice] = useState<number>(0);
  const [candleCloseTime, setCandleCloseTime] = useState<number>(0);
  const [result, setResult] = useState<{
    won: boolean;
    exitPrice: number;
    pnlPoints: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function startGame(direction: Direction) {
    const bet = Number(betInput);
    if (!bet || bet < 10) {
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
      setGameState("waiting");
    } finally {
      setLoading(false);
    }
  }

  const settle = useCallback(async () => {
    if (!gameId) return;
    // 캔들 종가 확정 대기 (2초 여유)
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`/api/binary/settle/${gameId}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "정산 오류");
      return;
    }
    setResult(data);
    setPoints(data.pointsTotal);
    setGameState("result");
  }, [gameId]);

  function reset() {
    setGameState("idle");
    setGameId(null);
    setResult(null);
    setEntryPrice(0);
    setCandleCloseTime(0);
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {/* 포인트 헤더 */}
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <span className="text-sm text-muted-foreground">게임 포인트</span>
          </div>
          <span className="font-mono text-2xl font-bold tabular-nums">
            {points.toLocaleString()} pt
          </span>
        </CardContent>
      </Card>

      {/* idle: 베팅 폼 */}
      {gameState === "idle" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">가격 예측 게임</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 심볼 선택 */}
            <div className="flex gap-2">
              {SYMBOLS.map((s) => (
                <Button
                  key={s}
                  variant={symbol === s ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setSymbol(s)}
                >
                  {SYMBOL_LABELS[s]}
                </Button>
              ))}
            </div>
            {/* 베팅 금액 */}
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">베팅 포인트</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={betInput}
                  onChange={(e) => setBetInput(e.target.value)}
                  className="font-mono"
                  min={10}
                  max={points}
                />
                {[50, 100, 500].map((v) => (
                  <Button
                    key={v}
                    variant="outline"
                    size="sm"
                    onClick={() => setBetInput(String(v))}
                  >
                    {v}
                  </Button>
                ))}
              </div>
            </div>
            {/* Call / Put 버튼 */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                size="lg"
                className="bg-grade-a hover:bg-grade-a/90 text-white h-16 text-base font-bold"
                onClick={() => startGame("call")}
                disabled={loading}
              >
                <TrendingUp className="mr-2 h-5 w-5" />
                CALL 상승
              </Button>
              <Button
                size="lg"
                className="bg-grade-d hover:bg-grade-d/90 text-white h-16 text-base font-bold"
                onClick={() => startGame("put")}
                disabled={loading}
              >
                <TrendingDown className="mr-2 h-5 w-5" />
                PUT 하락
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              다음 1분봉 종가 기준 판정 · 승리 시 베팅액 × 1.8배
            </p>
          </CardContent>
        </Card>
      )}

      {/* waiting: 카운트다운 */}
      {gameState === "waiting" && (
        <Card>
          <CardContent className="space-y-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">진입가</p>
            <p className="font-mono text-3xl font-bold tabular-nums">
              ${entryPrice.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground">다음 캔들 종가까지</p>
            <CountdownTimer candleCloseTime={candleCloseTime} onExpired={settle} />
            <p className="text-xs text-muted-foreground animate-pulse">
              판정 대기 중...
            </p>
          </CardContent>
        </Card>
      )}

      {/* result: 결과 */}
      {gameState === "result" && result && (
        <Card className={cn(result.won ? "border-grade-a" : "border-grade-d")}>
          <CardContent className="space-y-4 py-8 text-center">
            <div
              className={cn(
                "text-4xl font-black",
                result.won ? "text-grade-a" : "text-grade-d",
              )}
            >
              {result.won ? "승리!" : "패배"}
            </div>
            <div
              className={cn(
                "font-mono text-2xl font-bold tabular-nums",
                result.won ? "text-grade-a" : "text-grade-d",
              )}
            >
              {result.won ? `+${result.pnlPoints}` : result.pnlPoints} pt
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>진입가</span>
                <span className="font-mono tabular-nums">
                  ${entryPrice.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>종가</span>
                <span className="font-mono tabular-nums">
                  ${result.exitPrice.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between font-medium">
                <span>현재 포인트</span>
                <span className="font-mono tabular-nums">
                  {points.toLocaleString()} pt
                </span>
              </div>
            </div>
            <Button onClick={reset} className="w-full gap-2">
              <RotateCcw className="h-4 w-4" />
              다시 하기
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
