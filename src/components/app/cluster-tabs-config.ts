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
    title: "가상 거래",
    description:
      "가상 자금(vUSDT)으로 거래소 실습. 실제 손실 없이 매매를 연습합니다.",
    // 예측게임(/app/game)·김프 리밸런싱(/app/arbitrage)은 네비에서 제외 (2026-06).
    // 라우트·코드·DB는 보존 — 필요 시 여기 tabs에 다시 추가하면 복원됨.
    tabs: [
      { href: "/app/virtual-trade", label: "가상 거래", icon: "💼" },
    ],
    rightSlot: opts?.rightSlot,
  }),
  results: (opts?: { openCount?: number; rightSlot?: ReactNode }): ClusterDef => ({
    title: "기록 · 성과",
    description:
      "지금까지 진입한 거래, 누적 성과 통계, 다른 사용자 대비 순위를 한 곳에서.",
    tabs: [
      { href: "/app/journal", label: "거래 일지", icon: "📓", badge: opts?.openCount },
      { href: "/app/dashboard", label: "성과 분석", icon: "📊" },
      { href: "/app/rankings", label: "랭킹", icon: "🏆" },
    ],
    rightSlot: opts?.rightSlot,
  }),
};
