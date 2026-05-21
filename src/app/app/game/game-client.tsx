"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { History, Trophy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveChart } from "@/components/game/live-chart";
import { GameHistorySidebar } from "@/components/game/game-history-sidebar";
import { GameControls } from "@/components/game/game-controls";

type Direction = "call" | "put";
type Timeframe = "1m" | "5m" | "15m";

interface Props {
  initialPoints: number;
  totalGames: number;
  wins: number;
}

export function GameClient({ initialPoints, totalGames, wins }: Props) {
  const [points, setPoints] = useState(initialPoints);
  const [games, setGames] = useState(totalGames);
  const [winCount, setWinCount] = useState(wins);
  const [symbol, setSymbol] = useState<string>("BTCUSDT");
  const [activeGame, setActiveGame] = useState<{
    id: string;
    entryPrice: number;
    candleCloseTime: number;
    direction: Direction;
    timeframe: string;
  } | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const winRate = games > 0 ? Math.round((winCount / games) * 100) : 0;

  // 게임 시작
  const place = useCallback(
    async (direction: Direction, timeframe: Timeframe, bet: number) => {
      try {
        const res = await fetch("/api/binary/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol,
            direction,
            betPoints: bet,
            timeframe,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "오류");
          return;
        }
        setActiveGame({
          id: data.gameId,
          entryPrice: data.entryPrice,
          candleCloseTime: data.candleCloseTime,
          direction,
          timeframe,
        });
        setPoints(data.pointsRemaining);
        setRefreshKey((k) => k + 1);
        toast.success(
          `${direction === "call" ? "▲ CALL" : "▼ PUT"} 주문 · ${bet}pt`,
        );
      } catch {
        toast.error("네트워크 오류");
      }
    },
    [symbol],
  );

  // 만기 도달 시 자동 정산
  useEffect(() => {
    if (!activeGame) return;
    const id = setInterval(async () => {
      if (Date.now() < activeGame.candleCloseTime) return;
      clearInterval(id);
      // 캔들 종가 확정 대기
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const res = await fetch(`/api/binary/settle/${activeGame.id}`, {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "정산 오류");
          return;
        }
        setPoints(data.pointsTotal);
        setGames((g) => g + 1);
        if (data.won) setWinCount((w) => w + 1);
        toast[data.won ? "success" : "error"](
          data.won
            ? `🎉 승리! +${data.pnlPoints}pt`
            : `😢 패배 ${data.pnlPoints}pt`,
        );
      } finally {
        setActiveGame(null);
        setRefreshKey((k) => k + 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [activeGame]);

  // 가격 변화 콜백
  const handleCurrentPrice = useCallback((p: number) => {
    setCurrentPrice(p);
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_280px] gap-3 h-[calc(100vh-180px)] min-h-[600px]">
      {/* ── 좌측 히스토리 사이드바 (데스크탑) ── */}
      <div className="hidden lg:flex rounded-lg border border-border/50 bg-card/30 overflow-hidden">
        <GameHistorySidebar refreshKey={refreshKey} />
      </div>

      {/* ── 모바일 상단 통계 + 기록 토글 버튼 ── */}
      <div className="flex lg:hidden items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1 font-mono font-bold">
            <Trophy className="h-4 w-4 text-yellow-500" />
            {points.toLocaleString()}pt
          </span>
          <span className="text-muted-foreground text-xs">
            승률 {winRate}% · {games}판
          </span>
        </div>
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex items-center gap-1 rounded-md border border-border/40 px-2 py-1 text-xs hover:bg-muted/30"
          aria-label="게임 기록 열기"
        >
          <History className="h-3.5 w-3.5" /> 기록
        </button>
      </div>

      {/* ── 중앙 차트 영역 ── */}
      <div className="rounded-lg border border-border/50 bg-card/30 overflow-hidden flex flex-col min-h-[400px]">
        {/* 차트 헤더 */}
        <div className="hidden lg:flex shrink-0 items-center justify-between border-b border-border/40 px-4 py-2 text-xs">
          <div className="flex items-center gap-4">
            <span className="font-bold text-sm">
              {symbol.replace("USDT", "/USDT")}
            </span>
            {activeGame && (
              <span
                className={cn(
                  "flex items-center gap-1 font-mono",
                  activeGame.direction === "call"
                    ? "text-green-400"
                    : "text-red-400",
                )}
              >
                {activeGame.direction === "call" ? "▲ CALL" : "▼ PUT"} · 진입 $
                {activeGame.entryPrice.toLocaleString()}
                <span className="text-muted-foreground ml-1">
                  [{activeGame.timeframe}]
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="flex items-center gap-1">
              <Trophy className="h-3.5 w-3.5 text-yellow-500" />
              <span className="font-mono font-bold text-foreground">
                {points.toLocaleString()}pt
              </span>
            </span>
            <span>
              승률{" "}
              <span className="font-mono font-bold text-foreground">
                {winRate}%
              </span>
            </span>
            <span>
              총{" "}
              <span className="font-mono font-bold text-foreground">
                {games}판
              </span>
            </span>
          </div>
        </div>

        {/* lightweight-charts 라인 차트 */}
        <div className="flex-1 relative">
          <LiveChart
            symbol={symbol}
            entryPrice={activeGame?.entryPrice ?? null}
            entryTime={activeGame ? Date.now() : null}
            candleCloseTime={activeGame?.candleCloseTime ?? null}
            direction={activeGame?.direction ?? null}
            onCurrentPrice={handleCurrentPrice}
          />

          {/* 진행 중 오버레이 — 진입가 vs 현재가 */}
          {activeGame && currentPrice && (
            <div className="absolute top-3 left-3 z-10 rounded-md border border-border/40 bg-background/80 px-3 py-2 text-xs backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-muted-foreground">진입</div>
                  <div className="font-mono font-bold">
                    ${activeGame.entryPrice.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">현재</div>
                  <div
                    className={cn(
                      "font-mono font-bold",
                      currentPrice > activeGame.entryPrice
                        ? "text-green-400"
                        : currentPrice < activeGame.entryPrice
                          ? "text-red-400"
                          : "text-foreground",
                    )}
                  >
                    ${currentPrice.toFixed(2)}
                    <span className="ml-1 text-[10px] opacity-80">
                      (
                      {(
                        ((currentPrice - activeGame.entryPrice) /
                          activeGame.entryPrice) *
                        100
                      ).toFixed(3)}
                      %)
                    </span>
                  </div>
                </div>
                {/* 방향 표시 */}
                <div
                  className={cn(
                    "font-bold text-sm",
                    activeGame.direction === "call"
                      ? "text-green-400"
                      : "text-red-400",
                  )}
                >
                  {activeGame.direction === "call"
                    ? currentPrice > activeGame.entryPrice
                      ? "✓ 우세"
                      : "✗ 열세"
                    : currentPrice < activeGame.entryPrice
                      ? "✓ 우세"
                      : "✗ 열세"}
                </div>
              </div>
            </div>
          )}

          {/* 정산 대기 중 스피너 */}
          {activeGame &&
            Date.now() >= activeGame.candleCloseTime - 3000 &&
            Date.now() >= activeGame.candleCloseTime && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-sm font-medium text-muted-foreground">
                    정산 중...
                  </span>
                </div>
              </div>
            )}
        </div>
      </div>

      {/* ── 우측 컨트롤 패널 ── */}
      <div className="rounded-lg border border-border/50 bg-card/30 overflow-hidden">
        <GameControls
          points={points}
          symbol={symbol}
          onSymbolChange={setSymbol}
          onPlace={place}
          disabled={!!activeGame}
        />
      </div>

      {/* ── 모바일 히스토리 드로어 ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-0 h-full w-72 border-l border-border bg-background">
            <div className="flex items-center justify-between border-b border-border/40 p-3">
              <span className="text-sm font-bold">게임 기록</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded p-1 hover:bg-muted"
                aria-label="기록 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="h-[calc(100%-49px)]">
              <GameHistorySidebar refreshKey={refreshKey} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
