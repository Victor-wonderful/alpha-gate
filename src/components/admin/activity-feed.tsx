"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles, LineChart, Coins, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActivityKind = "analysis" | "trade" | "wallet" | "admin";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  at: string;
  userId: string | null;
  label: string;
  detail: string;
}

const META: Record<ActivityKind, { icon: React.ComponentType<{ className?: string }>; tone: string; label: string }> = {
  analysis: { icon: Sparkles, tone: "text-primary", label: "분석" },
  trade: { icon: LineChart, tone: "text-foreground", label: "거래" },
  wallet: { icon: Coins, tone: "text-amber-400", label: "지갑" },
  admin: { icon: Shield, tone: "text-destructive", label: "관리자" },
};

const TABS: { key: ActivityKind | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "analysis", label: "분석" },
  { key: "trade", label: "거래" },
  { key: "wallet", label: "지갑" },
  { key: "admin", label: "관리자" },
];

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  const [filter, setFilter] = useState<ActivityKind | "all">("all");

  const filtered = useMemo(
    () => (filter === "all" ? events : events.filter((e) => e.kind === filter)),
    [filter, events],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card/40 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              filter === t.key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="divide-y divide-border">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">활동이 없습니다.</div>
          ) : (
            filtered.map((e) => {
              const M = META[e.kind];
              const Icon = M.icon;
              const inner = (
                <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
                  <Icon className={cn("h-4 w-4 shrink-0", M.tone)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{e.detail}</div>
                    <div className="truncate text-xs text-muted-foreground">{e.label}</div>
                  </div>
                  <div className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {new Date(e.at).toLocaleString("ko-KR")}
                  </div>
                </div>
              );
              return e.userId ? (
                <Link key={e.id} href={`/app/admin/users/${e.userId}`} className="block">
                  {inner}
                </Link>
              ) : (
                <div key={e.id}>{inner}</div>
              );
            })
          )}
        </div>
      </div>

      <div className="text-xs text-muted-foreground">{filtered.length}건</div>
    </div>
  );
}
