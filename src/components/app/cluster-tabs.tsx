"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type ClusterTab = {
  href: string;
  label: string;
  /** Optional icon emoji or single-character glyph. */
  icon?: string;
  /** Optional count badge (e.g. open positions). */
  badge?: number | string;
};

/** Shared tab bar that visually unifies sibling pages under one IA "cluster".
 *
 * Example clusters:
 * - 트레이딩: /app/virtual-trade, /app/game
 * - 내 결과: /app/journal, /app/dashboard, /app/rankings
 *
 * Pages remain separate routes — this component just renders a tab strip and
 * highlights the matching one based on the current pathname. Switching is a
 * normal client-side navigation.
 */
export function ClusterTabs({
  title,
  description,
  tabs,
  rightSlot,
}: {
  title: string;
  description?: string;
  tabs: ClusterTab[];
  rightSlot?: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-background/40 px-5 py-3">
        <div>
          <h1 className="text-lg font-bold leading-[1.15]">{title}</h1>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {rightSlot ? <div className="flex-none">{rightSlot}</div> : null}
      </div>
      <nav className="flex items-center gap-0.5 overflow-x-auto bg-background/20 px-3 py-1.5">
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {t.icon ? <span className="text-[14px] leading-none">{t.icon}</span> : null}
              <span>{t.label}</span>
              {t.badge != null ? (
                <span
                  className={cn(
                    "ml-0.5 rounded px-1.5 text-[10px] font-mono tabular-nums",
                    active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {t.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Pre-configured cluster definitions to avoid duplicating tab arrays
 *  across pages. Import and pass `clusters.trading` / `clusters.results`. */
export const clusters = {
  trading: (opts?: { rightSlot?: React.ReactNode }) => ({
    title: "트레이딩",
    description: "가상 자금으로 거래소 실습 또는 1·3분 가격 예측 게임. 두 활동 모두 같은 vUSDT 잔액을 사용합니다.",
    tabs: [
      { href: "/app/virtual-trade", label: "가상 거래소", icon: "💼" },
      { href: "/app/game", label: "가격 예측 게임", icon: "🎮" },
    ] satisfies ClusterTab[],
    rightSlot: opts?.rightSlot,
  }),
  results: (opts?: { openCount?: number; rightSlot?: React.ReactNode }) => ({
    title: "내 결과",
    description: "지금까지 진입한 거래, 누적 성과 통계, 다른 사용자 대비 순위를 한 곳에서.",
    tabs: [
      { href: "/app/journal", label: "내 거래", icon: "📓", badge: opts?.openCount },
      { href: "/app/dashboard", label: "성과 분석", icon: "📊" },
      { href: "/app/rankings", label: "랭킹", icon: "🏆" },
    ] satisfies ClusterTab[],
    rightSlot: opts?.rightSlot,
  }),
};
