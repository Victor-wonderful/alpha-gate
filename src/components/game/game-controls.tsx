"use client";

import { useState } from "react";
import { Plus, Minus, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Timeframe = "1m" | "3m";
type Direction = "call" | "put";

interface Props {
  points: number;
  symbol: string;
  onSymbolChange: (s: string) => void;
  onPlace: (direction: Direction, timeframe: Timeframe, bet: number) => void;
  disabled?: boolean;
}

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
const SYMBOL_LABELS: Record<string, string> = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  SOLUSDT: "SOL",
};

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  "1m": "1분",
  "3m": "3분",
};

const QUICK_BETS = [10, 50, 100, 500] as const;

export function GameControls({
  points,
  symbol,
  onSymbolChange,
  onPlace,
  disabled,
}: Props) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1m");
  const [bet, setBet] = useState(100);

  const winPayout = Math.round(bet * 0.8);
  const canPlay = bet >= 10 && bet <= points && !disabled;

  function adjustBet(delta: number) {
    setBet((b) => Math.max(10, Math.min(points, b + delta)));
  }

  function clampBet(value: number) {
    return Math.max(10, Math.min(points, isNaN(value) ? 10 : value));
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {/* 심볼 선택 */}
      <div className="flex gap-1">
        {SYMBOLS.map((s) => (
          <button
            key={s}
            onClick={() => onSymbolChange(s)}
            disabled={disabled}
            className={cn(
              "flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors",
              symbol === s
                ? "border border-primary/40 bg-primary/15 text-primary"
                : "border border-border/40 text-muted-foreground hover:bg-muted/30 hover:text-foreground",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {SYMBOL_LABELS[s]}
          </button>
        ))}
      </div>

      {/* 시간 선택 */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          시간
        </label>
        <div className="mt-1 grid grid-cols-2 gap-1">
          {(["1m", "3m"] as Timeframe[]).map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              disabled={disabled}
              className={cn(
                "rounded-md py-2 text-sm font-bold transition-colors",
                timeframe === t
                  ? "bg-primary text-primary-foreground"
                  : "border border-border/40 text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              {TIMEFRAME_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* 금액 */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          금액{" "}
          <span className="normal-case font-normal">
            (보유 {points.toLocaleString()}pt)
          </span>
        </label>
        <div className="mt-1 flex items-center gap-1">
          <button
            onClick={() => adjustBet(-10)}
            disabled={disabled}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/40 hover:bg-muted/30 disabled:opacity-50"
            aria-label="베팅 10pt 감소"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <input
            type="number"
            value={bet}
            onChange={(e) => setBet(clampBet(Number(e.target.value)))}
            className="h-9 min-w-0 flex-1 rounded-md border border-border/40 bg-background px-2 text-center font-mono font-bold tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
            min={10}
            disabled={disabled}
            aria-label="베팅 금액"
          />
          <button
            onClick={() => adjustBet(10)}
            disabled={disabled}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/40 hover:bg-muted/30 disabled:opacity-50"
            aria-label="베팅 10pt 증가"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* 빠른 금액 선택 */}
        <div className="mt-1 flex gap-1">
          {QUICK_BETS.map((v) => (
            <button
              key={v}
              onClick={() => setBet(clampBet(v))}
              disabled={disabled}
              className="flex-1 rounded py-0.5 text-[10px] text-muted-foreground hover:bg-muted/30 hover:text-foreground disabled:opacity-50"
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* 예상 수익 */}
      <div className="rounded-md bg-muted/20 p-2.5 text-center">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          예상 수익
        </div>
        <div className="mt-0.5 font-mono text-xl font-bold tabular-nums text-green-400">
          +{winPayout} pt
        </div>
        <div className="text-[10px] text-muted-foreground">
          승리 80% · 패배 -{bet}pt
        </div>
      </div>

      {/* UP / DOWN 버튼 */}
      <div className="mt-auto space-y-2">
        <button
          onClick={() => onPlace("call", timeframe, bet)}
          disabled={!canPlay}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-4 text-base font-black text-white shadow-lg shadow-green-500/25 transition-all hover:scale-[1.02] hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          aria-label="UP 상승 예측"
        >
          <TrendingUp className="h-6 w-6 transition-transform group-hover:-translate-y-0.5" />
          UP · 상승
        </button>
        <button
          onClick={() => onPlace("put", timeframe, bet)}
          disabled={!canPlay}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 py-4 text-base font-black text-white shadow-lg shadow-red-500/25 transition-all hover:scale-[1.02] hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          aria-label="DOWN 하락 예측"
        >
          <TrendingDown className="h-6 w-6 transition-transform group-hover:translate-y-0.5" />
          DOWN · 하락
        </button>
      </div>
    </div>
  );
}
