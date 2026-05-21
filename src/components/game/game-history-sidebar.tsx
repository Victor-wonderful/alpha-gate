"use client";

import { useEffect, useState, useCallback } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

type ActiveGame = {
  id: string;
  symbol: string;
  direction: "call" | "put";
  bet_points: number;
  entry_price: number;
  candle_close_time: number;
  timeframe: string;
};

type ClosedGame = {
  id: string;
  symbol: string;
  direction: "call" | "put";
  bet_points: number;
  entry_price: number;
  exit_price: number;
  won: boolean;
  pnl_points: number;
  timeframe: string;
};

interface Props {
  /** 부모가 게임 시작/정산할 때 증가시켜서 재fetch 유도 */
  refreshKey?: number;
  /** 만기 지난 게임이 있을 때 알림 */
  onSettleAvailable?: () => void;
}

const SYMBOL_LABELS: Record<string, string> = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  SOLUSDT: "SOL",
};

export function GameHistorySidebar({ refreshKey, onSettleAvailable }: Props) {
  const [active, setActive] = useState<ActiveGame[]>([]);
  const [closed, setClosed] = useState<ClosedGame[]>([]);
  const [tab, setTab] = useState<"active" | "closed">("active");
  const [now, setNow] = useState(Date.now());

  // 1초마다 now 갱신 (카운트다운용)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 데이터 fetch
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/binary/history");
      const data = await res.json();
      setActive(data.active ?? []);
      setClosed(data.closed ?? []);
    } catch {
      // 네트워크 오류 무시
    }
  }, []);

  useEffect(() => {
    let alive = true;

    async function safeLoad() {
      if (!alive) return;
      await load();
    }

    safeLoad();
    const id = setInterval(safeLoad, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refreshKey, load]);

  // 만기 지난 게임 감지
  useEffect(() => {
    const expired = active.some((g) => g.candle_close_time <= now);
    if (expired) onSettleAvailable?.();
  }, [active, now, onSettleAvailable]);

  return (
    <div className="flex h-full w-full flex-col">
      {/* 탭 헤더 */}
      <div className="flex shrink-0 border-b border-border/40">
        {(["active", "closed"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-2 text-xs font-semibold transition-colors",
              tab === t
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "active" ? `진행 중 (${active.length})` : `종료 (${closed.length})`}
          </button>
        ))}
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {/* 진행 중 */}
        {tab === "active" && active.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            진행 중인 게임 없음
          </p>
        )}
        {tab === "active" &&
          active.map((g) => {
            const remaining = Math.max(
              0,
              Math.ceil((g.candle_close_time - now) / 1000),
            );
            const expired = remaining === 0;
            return (
              <div
                key={g.id}
                className="rounded-md border border-border/40 bg-card/50 p-2"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-bold">
                    {SYMBOL_LABELS[g.symbol] ?? g.symbol}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-xs font-bold",
                      expired
                        ? "animate-pulse text-orange-400"
                        : remaining <= 10
                          ? "text-red-400"
                          : "text-muted-foreground",
                    )}
                  >
                    {expired
                      ? "정산 대기"
                      : `:${String(remaining).padStart(2, "0")}`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {g.direction === "call" ? (
                    <TrendingUp className="h-3 w-3 text-green-400" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-400" />
                  )}
                  <span
                    className={
                      g.direction === "call" ? "text-green-400" : "text-red-400"
                    }
                  >
                    {g.direction === "call" ? "CALL" : "PUT"}
                  </span>
                  <span className="text-muted-foreground/60">·</span>
                  <span className="font-mono">{g.bet_points}pt</span>
                  {g.timeframe && (
                    <>
                      <span className="text-muted-foreground/60">·</span>
                      <span className="text-muted-foreground/80">
                        {g.timeframe}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}

        {/* 종료 */}
        {tab === "closed" && closed.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            종료된 게임 없음
          </p>
        )}
        {tab === "closed" &&
          closed.map((g) => (
            <div
              key={g.id}
              className={cn(
                "rounded-md border p-2 text-xs",
                g.won
                  ? "border-green-500/30 bg-green-500/5"
                  : "border-red-500/30 bg-red-500/5",
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="font-bold">
                  {SYMBOL_LABELS[g.symbol] ?? g.symbol}
                </span>
                <span
                  className={cn(
                    "font-mono font-bold",
                    g.won ? "text-green-400" : "text-red-400",
                  )}
                >
                  {g.won ? `+${g.pnl_points}` : g.pnl_points}pt
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {g.direction === "call" ? "▲CALL" : "▼PUT"}
                <span>·</span>
                <span className="font-mono">{g.bet_points}pt</span>
                {g.timeframe && (
                  <>
                    <span>·</span>
                    <span>{g.timeframe}</span>
                  </>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
