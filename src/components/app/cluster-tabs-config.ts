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
    title: "거래 상황",
    description:
      "AI 분석·수동·자동매매로 진입한 포지션과 대기 주문을 한눈에. 가상 자금(vUSDT) 기준.",
    tabs: [
      { href: "/app/virtual-trade", label: "거래 상황", icon: "💼" },
    ],
    rightSlot: opts?.rightSlot,
  }),
};
