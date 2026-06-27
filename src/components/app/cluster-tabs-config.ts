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
    tabs: [
      { href: "/app/virtual-trade", label: "가상 거래", icon: "💼" },
    ],
    rightSlot: opts?.rightSlot,
  }),
};
