"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { History, Trophy, X, Clock, Lock, Activity, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveChart } from "@/components/game/live-chart";
import { GameHistorySidebar } from "@/components/game/game-history-sidebar";
import { GameControls } from "@/components/game/game-controls";

type Direction = "call" | "put";
type Timeframe = "1m" | "3m";

const TF_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "3m": 180_000,
};

const BETTING_CUTOFF_SEC = 5;

type Phase =
  | "betting_open"      // 베팅 가능
  | "betting_closing"   // 베팅 마감 임박 (5초)
  | "waiting_start"     // 베팅 완료, 목표 캔들 시작 대기
  | "candle_running"    // 목표 캔들 진행 중
  | "settling";         // 정산 중

interface Props {
  initialPoints: number;
  totalGames: number;
  wins: number;
}

// 캔들 경계 시각 계산 (UTC 정시 정렬)
function nextCandleClose(timeframe: Timeframe, now: number): number {
  const tfMs = TF_MS[timeframe];
  return Math.ceil(now / tfMs) * tfMs;
}

export function GameClient({ initialPoints, totalGames, wins }: Props) {
  const [points, setPoints] = useState(initialPoints);
  const [games, setGames] = useState(totalGames);
  const [winCount, setWinCount] = useState(wins);
  const [symbol, setSymbol] = useState<string>("BTCUSDT");
  const [timeframe, setTimeframe] = useState<Timeframe>("1m");
  const [activeGame, setActiveGame] = useState<{
    id: string;
    entryPrice: number;
    candleCloseTime: number;
    direction: Direction;
    timeframe: Timeframe;
  } | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const winRate = games > 0 ? Math.round((winCount / games) * 100) : 0;

  // 1초 tick
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // 페이즈 계산
  const phase: Phase = useMemo(() => {
    if (activeGame) {
      const tfMs = TF_MS[activeGame.timeframe];
      const candleOpenTime = activeGame.candleCloseTime - tfMs;
      if (now < candleOpenTime) return "waiting_start";
      if (now < activeGame.candleCloseTime) return "candle_running";
      return "settling";
    }
    const next = nextCandleClose(timeframe, now);
    const secondsTo = Math.ceil((next - now) / 1000);
    if (secondsTo <= BETTING_CUTOFF_SEC) return "betting_closing";
    return "betting_open";
  }, [activeGame, now, timeframe]);

  // 페이즈별 카운트다운 (초)
  const phaseCountdown = useMemo(() => {
    if (activeGame) {
      const tfMs = TF_MS[activeGame.timeframe];
      const candleOpenTime = activeGame.candleCloseTime - tfMs;
      if (phase === "waiting_start") {
        return Math.max(0, Math.ceil((candleOpenTime - now) / 1000));
      }
      if (phase === "candle_running") {
        return Math.max(0, Math.ceil((activeGame.candleCloseTime - now) / 1000));
      }
      return 0;
    }
    const next = nextCandleClose(timeframe, now);
    return Math.max(0, Math.ceil((next - now) / 1000));
  }, [activeGame, now, phase, timeframe]);

  // 컨트롤 disabled 여부
  const controlsDisabled = phase !== "betting_open";

  // 게임 시작
  const place = useCallback(
    async (direction: Direction, tf: Timeframe, bet: number) => {
      try {
        const res = await fetch("/api/binary/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol, direction, betPoints: bet, timeframe: tf }),
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
          timeframe: tf,
        });
        setPoints(data.pointsRemaining);
        setRefreshKey((k) => k + 1);
        toast.success(`${direction === "call" ? "▲ CALL" : "▼ PUT"} 베팅 · ${bet} vUSDT`);
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
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const res = await fetch(`/api/binary/settle/${activeGame.id}`, { method: "POST" });
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
            ? `🎉 승리! +${data.pnlPoints} vUSDT`
            : `😢 패배 ${data.pnlPoints} vUSDT`,
        );
      } finally {
        setActiveGame(null);
        setRefreshKey((k) => k + 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [activeGame]);

  const handleCurrentPrice = useCallback((p: number) => {
    setCurrentPrice(p);
  }, []);

  // 페이즈 배너 정보
  const phaseConfig = {
    betting_open: {
      color: "bg-green-500/15 border-green-500/40 text-green-400",
      icon: <Activity className="h-4 w-4" />,
      label: "베팅 가능",
      sub: `다음 캔들까지 :${String(phaseCountdown).padStart(2, "0")} — 이번 시간 내 베팅 → 다음 캔들 판정`,
    },
    betting_closing: {
      color: "bg-yellow-500/15 border-yellow-500/40 text-yellow-400 animate-pulse",
      icon: <AlertCircle className="h-4 w-4" />,
      label: "베팅 마감 임박",
      sub: `${phaseCountdown}초 후 마감 — 새 베팅 불가`,
    },
    waiting_start: {
      color: "bg-blue-500/15 border-blue-500/40 text-blue-400",
      icon: <Clock className="h-4 w-4" />,
      label: "캔들 시작 대기",
      sub: `${phaseCountdown}초 후 시작`,
    },
    candle_running: {
      color: "bg-cyan-500/15 border-cyan-500/40 text-cyan-400",
      icon: <Lock className="h-4 w-4" />,
      label: "캔들 진행 중",
      sub: `결과까지 ${phaseCountdown}초`,
    },
    settling: {
      color: "bg-purple-500/15 border-purple-500/40 text-purple-400 animate-pulse",
      icon: <Clock className="h-4 w-4" />,
      label: "정산 중",
      sub: "캔들 종가 확인 중...",
    },
  }[phase];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_280px] gap-3 h-[calc(100vh-180px)] min-h-[600px]">
      {/* 좌측 히스토리 */}
      <div className="hidden lg:flex rounded-lg border border-border/50 bg-card/30 overflow-hidden">
        <GameHistorySidebar refreshKey={refreshKey} />
      </div>

      {/* 모바일 통계 + 토글 */}
      <div className="flex lg:hidden items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1 font-mono font-bold">
            <Trophy className="h-4 w-4 text-yellow-500" />
            {points.toLocaleString()} vUSDT
          </span>
          <span className="text-muted-foreground text-xs">
            승률 {winRate}% · {games}판
          </span>
        </div>
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex items-center gap-1 rounded-md border border-border/40 px-2 py-1 text-xs hover:bg-muted/30"
        >
          <History className="h-3.5 w-3.5" /> 기록
        </button>
      </div>

      {/* 중앙 차트 */}
      <div className="rounded-lg border border-border/50 bg-card/30 overflow-hidden flex flex-col min-h-[400px]">
        {/* 페이즈 배너 */}
        <div className={cn(
          "flex items-center justify-between gap-3 border-b px-4 py-2.5 text-sm",
          phaseConfig.color,
        )}>
          <div className="flex items-center gap-2">
            {phaseConfig.icon}
            <span className="font-bold">{phaseConfig.label}</span>
            <span className="text-xs opacity-80 hidden sm:inline">· {phaseConfig.sub}</span>
          </div>
          <div className="font-mono text-xl font-black tabular-nums">
            {phase === "settling" ? "..." : `:${String(phaseCountdown).padStart(2, "0")}`}
          </div>
        </div>

        {/* 모바일 sub 안내 */}
        <div className={cn("sm:hidden border-b border-border/40 px-4 py-1.5 text-[11px]", phaseConfig.color.split(" ").filter(c => c.startsWith("text-")).join(" "))}>
          {phaseConfig.sub}
        </div>

        {/* 차트 헤더 — 데스크탑 통계 */}
        <div className="hidden lg:flex shrink-0 items-center justify-between border-b border-border/40 px-4 py-2 text-xs">
          <div className="flex items-center gap-4">
            <span className="font-bold text-sm">
              {symbol.replace("USDT", "/USDT")}
            </span>
            <span className="text-muted-foreground">
              {(activeGame?.timeframe ?? timeframe) === "1m" ? "1분봉" : "3분봉"}
            </span>
            {activeGame && (
              <span className={cn(
                "flex items-center gap-1 font-mono",
                activeGame.direction === "call" ? "text-green-400" : "text-red-400",
              )}>
                {activeGame.direction === "call" ? "▲ CALL" : "▼ PUT"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="flex items-center gap-1">
              <Trophy className="h-3.5 w-3.5 text-yellow-500" />
              <span className="font-mono font-bold text-foreground">{points.toLocaleString()} vUSDT</span>
            </span>
            <span>승률 <span className="font-mono font-bold text-foreground">{winRate}%</span></span>
            <span>총 <span className="font-mono font-bold text-foreground">{games}판</span></span>
          </div>
        </div>

        {/* 차트 */}
        <div className="flex-1 relative">
          <LiveChart
            symbol={symbol}
            timeframe={activeGame ? activeGame.timeframe : timeframe}
            entryPrice={activeGame?.entryPrice ?? null}
            direction={activeGame?.direction ?? null}
            onCurrentPrice={handleCurrentPrice}
          />

          {/* 진행 중 오버레이 */}
          {activeGame && currentPrice && phase === "candle_running" && (
            <div className="absolute top-3 left-3 z-10 rounded-md border border-border/40 bg-background/85 px-3 py-2 text-xs backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-muted-foreground">진입(시가)</div>
                  <div className="font-mono font-bold">${activeGame.entryPrice.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">현재</div>
                  <div className={cn(
                    "font-mono font-bold",
                    currentPrice > activeGame.entryPrice ? "text-green-400" :
                    currentPrice < activeGame.entryPrice ? "text-red-400" : "text-foreground",
                  )}>
                    ${currentPrice.toFixed(2)}
                    <span className="ml-1 text-[10px] opacity-80">
                      ({(((currentPrice - activeGame.entryPrice) / activeGame.entryPrice) * 100).toFixed(3)}%)
                    </span>
                  </div>
                </div>
                <div className={cn(
                  "font-bold text-sm",
                  activeGame.direction === "call" ? "text-green-400" : "text-red-400",
                )}>
                  {activeGame.direction === "call"
                    ? currentPrice > activeGame.entryPrice ? "✓ 우세" : "✗ 열세"
                    : currentPrice < activeGame.entryPrice ? "✓ 우세" : "✗ 열세"}
                </div>
              </div>
            </div>
          )}

          {/* 정산 스피너 */}
          {phase === "settling" && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm font-medium text-muted-foreground">정산 중...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 우측 컨트롤 */}
      <div className="rounded-lg border border-border/50 bg-card/30 overflow-hidden">
        <GameControls
          points={points}
          symbol={symbol}
          timeframe={timeframe}
          onSymbolChange={setSymbol}
          onTimeframeChange={setTimeframe}
          onPlace={place}
          disabled={controlsDisabled}
          disabledReason={
            phase === "betting_closing" ? "betting_closing" :
            phase === "waiting_start" || phase === "candle_running" ? "active_game" :
            phase === "settling" ? "settling" :
            undefined
          }
        />
      </div>

      {/* 모바일 드로어 */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setSidebarOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-72 border-l border-border bg-background">
            <div className="flex items-center justify-between border-b border-border/40 p-3">
              <span className="text-sm font-bold">게임 기록</span>
              <button onClick={() => setSidebarOpen(false)} className="rounded p-1 hover:bg-muted">
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
