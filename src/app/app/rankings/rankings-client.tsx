"use client";

import { useEffect, useState } from "react";
import { Trophy, Gamepad2, LineChart, Award, Loader2, Gift } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Category = "game" | "trading" | "combined";
type Period = "daily" | "weekly" | "monthly" | "all";

interface RankingEntry {
  rank: number;
  user_id: string;
  display_name: string;
  score: number;
  count: number;
}

interface UserRank {
  rank: number | null;
  score: number;
  count: number;
  totalParticipants: number;
}

const CATEGORIES: { id: Category; label: string; icon: React.ReactNode }[] = [
  { id: "combined", label: "통합", icon: <Trophy className="h-3.5 w-3.5" /> },
  { id: "game", label: "게임", icon: <Gamepad2 className="h-3.5 w-3.5" /> },
  { id: "trading", label: "트레이딩", icon: <LineChart className="h-3.5 w-3.5" /> },
];

const PERIODS: { id: Period; label: string }[] = [
  { id: "daily", label: "일간" },
  { id: "weekly", label: "주간" },
  { id: "monthly", label: "월간" },
  { id: "all", label: "전체" },
];

const REWARDS_INFO: Record<Category, number[]> = {
  game: [1000, 500, 300, 100, 100, 100, 100, 100, 100, 100],
  trading: [1000, 500, 300, 100, 100, 100, 100, 100, 100, 100],
  combined: [3000, 1500, 800, 300, 300, 300, 300, 300, 300, 300],
};

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return null;
}

export function RankingsClient() {
  const [category, setCategory] = useState<Category>("combined");
  const [period, setPeriod] = useState<Period>("weekly");
  const [top, setTop] = useState<RankingEntry[]>([]);
  const [me, setMe] = useState<UserRank | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/rankings?category=${category}&period=${period}`)
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        setTop(data.top ?? []);
        setMe(data.me ?? null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [category, period]);

  return (
    <div className="space-y-4">
      {/* 카테고리 탭 */}
      <div className="flex gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              category === c.id
                ? "bg-primary text-primary-foreground"
                : "border border-border/40 text-muted-foreground hover:bg-muted/30 hover:text-foreground",
            )}
          >
            {c.icon}
            {c.label} 랭킹
          </button>
        ))}
      </div>

      {/* 기간 탭 */}
      <div className="flex gap-1">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={cn(
              "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
              period === p.id
                ? "bg-muted text-foreground border border-border"
                : "text-muted-foreground hover:bg-muted/30",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 내 순위 */}
      <Card className="border-primary/30">
        <CardContent className="py-3 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Award className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">내 순위</div>
              <div className="font-mono font-bold">
                {me?.rank ? (
                  <>
                    #{me.rank}
                    <span className="text-xs text-muted-foreground ml-1">
                      / {me.totalParticipants}명
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">참가 기록 없음</span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">내 점수</div>
            <div
              className={cn(
                "font-mono font-bold tabular-nums",
                (me?.score ?? 0) > 0
                  ? "text-green-400"
                  : (me?.score ?? 0) < 0
                    ? "text-red-400"
                    : "text-muted-foreground",
              )}
            >
              {(me?.score ?? 0) > 0 ? "+" : ""}
              {(me?.score ?? 0).toLocaleString()}
              <span className="text-xs font-normal text-muted-foreground ml-1">vUSDT</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 리더보드 */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
            <div className="text-sm font-medium">
              {CATEGORIES.find((c) => c.id === category)?.label} 랭킹 ·{" "}
              {PERIODS.find((p) => p.id === period)?.label}
            </div>
            <span className="text-xs text-muted-foreground">TOP 50</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : top.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              아직 랭킹 데이터가 없습니다
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {top.map((entry) => {
                const isMe = me?.rank != null && entry.rank === me.rank;
                const isTopThree = entry.rank <= 3;
                return (
                  <div
                    key={entry.user_id}
                    className={cn(
                      "flex items-center justify-between gap-3 px-4 py-2.5",
                      isMe && "bg-primary/5",
                      isTopThree && "bg-yellow-500/5",
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "flex h-8 w-8 flex-none items-center justify-center rounded-full font-bold text-sm",
                          entry.rank === 1
                            ? "bg-yellow-500/20 text-yellow-500"
                            : entry.rank === 2
                              ? "bg-zinc-300/20 text-zinc-300"
                              : entry.rank === 3
                                ? "bg-orange-500/20 text-orange-500"
                                : "bg-muted text-muted-foreground",
                        )}
                      >
                        {medal(entry.rank) ?? `#${entry.rank}`}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {entry.display_name}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {entry.count}건
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-none">
                      <div
                        className={cn(
                          "font-mono font-bold tabular-nums",
                          entry.score > 0
                            ? "text-green-400"
                            : entry.score < 0
                              ? "text-red-400"
                              : "text-foreground",
                        )}
                      >
                        {entry.score > 0 ? "+" : ""}
                        {entry.score.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-muted-foreground">vUSDT</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 주간 보상 안내 */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <Gift className="h-4 w-4 text-yellow-500" />
            주간 보상 (매주 월요일 00:00 KST 자동 지급)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {(["game", "trading", "combined"] as Category[]).map((c) => {
              const rewards = REWARDS_INFO[c];
              const label = CATEGORIES.find((x) => x.id === c)?.label;
              const total = rewards.reduce((s, r) => s + r, 0);
              return (
                <div
                  key={c}
                  className={cn(
                    "rounded-md border border-border/40 p-2",
                    c === "combined" && "border-primary/40",
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold">{label}</span>
                    <span className="text-muted-foreground">
                      총 {total.toLocaleString()} vUSDT
                    </span>
                  </div>
                  <div className="space-y-0.5 text-[11px] text-muted-foreground">
                    <div>
                      🥇 {rewards[0].toLocaleString()} · 🥈 {rewards[1].toLocaleString()} · 🥉{" "}
                      {rewards[2].toLocaleString()}
                    </div>
                    <div>4~10위 각 {rewards[3]}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
