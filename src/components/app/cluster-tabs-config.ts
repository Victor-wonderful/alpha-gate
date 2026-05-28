import type { ReactNode } from "react";

export type ClusterTab = {
  href: string;
  label: string;
  /** Optional icon emoji or single-character glyph. */
  icon?: string;
  /** Optional count badge (e.g. open positions). */
  badge?: number | string;
};

export type ClusterDef = {
  title: string;
  description?: string;
  tabs: ClusterTab[];
  rightSlot?: ReactNode;
};

/** Pre-configured cluster definitions. Kept in a separate, plain module so
 *  server components can call these factories — `cluster-tabs.tsx` is marked
 *  "use client" and Next.js doesn't allow server code to call arbitrary
 *  functions exported across that boundary. */
export const clusters = {
  trading: (opts?: { rightSlot?: ReactNode }): ClusterDef => ({
    title: "트레이딩",
    description:
      "가상 자금으로 거래소 실습, 가격 예측 게임, 차익거래. 모두 같은 vUSDT 잔액을 사용합니다.",
    tabs: [
      { href: "/app/virtual-trade", label: "트레이딩 터미널", icon: "💼" },
      { href: "/app/game", label: "가격 예측 게임", icon: "🎮" },
      { href: "/app/arbitrage", label: "김프 리밸런싱", icon: "🔀" },
    ],
    rightSlot: opts?.rightSlot,
  }),
  results: (opts?: { openCount?: number; rightSlot?: ReactNode }): ClusterDef => ({
    title: "내 결과",
    description:
      "지금까지 진입한 거래, 누적 성과 통계, 다른 사용자 대비 순위를 한 곳에서.",
    tabs: [
      { href: "/app/journal", label: "내 거래", icon: "📓", badge: opts?.openCount },
      { href: "/app/dashboard", label: "성과 분석", icon: "📊" },
      { href: "/app/rankings", label: "랭킹", icon: "🏆" },
    ],
    rightSlot: opts?.rightSlot,
  }),
};
