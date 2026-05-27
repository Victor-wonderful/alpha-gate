import Link from "next/link";
import { cn } from "@/lib/utils";

export type TradeMode = "all" | "live" | "backtest";

/**
 * 거래 모드(실거래/백테스트) 필터 — Journal/Dashboard에서 ViewTabs 옆에 사용.
 * ?view 파라미터를 보존하면서 ?mode만 토글.
 */
export function ModeFilter({
  basePath,
  view,
  current,
  counts,
}: {
  basePath: string;
  view: string; // 현재 활성 view (?view=) — 링크에 보존
  current: TradeMode;
  counts?: { all?: number; live?: number; backtest?: number };
}) {
  const tabs: { key: TradeMode; label: string; icon?: string }[] = [
    { key: "all", label: "전체" },
    { key: "live", label: "실거래", icon: "🟢" },
    { key: "backtest", label: "백테스트", icon: "⏮" },
  ];
  function href(mode: TradeMode) {
    const params = new URLSearchParams();
    if (view && view !== "all") params.set("view", view);
    if (mode !== "all") params.set("mode", mode);
    const q = params.toString();
    return q ? `${basePath}?${q}` : basePath;
  }
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-card/40 p-0.5 text-xs">
      {tabs.map((t) => {
        const active = current === t.key;
        const count = counts?.[t.key];
        return (
          <Link
            key={t.key}
            href={href(t.key)}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-2.5 py-1 transition-colors",
              active
                ? t.key === "backtest"
                  ? "bg-amber-500/15 text-amber-300 font-semibold"
                  : "bg-primary/15 text-primary font-semibold"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {t.icon ? <span className="text-[10px]">{t.icon}</span> : null}
            <span>{t.label}</span>
            {count != null ? (
              <span
                className={cn(
                  "rounded px-1 text-[9px] font-mono tabular-nums",
                  active
                    ? t.key === "backtest"
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

export function parseMode(raw: string | undefined | null): TradeMode {
  return raw === "live" || raw === "backtest" ? raw : "all";
}
