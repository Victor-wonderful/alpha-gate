"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AnalysisSnapshot } from "@/lib/analysis/analyze";
import type { AnalysisReport } from "@/lib/analysis/synthesize";
import type { StrategyResult } from "@/lib/analysis/strategy";
import type { TradingStyle } from "@/lib/analysis/style";

interface AnalysisResult {
  snapshot: AnalysisSnapshot;
  strategy: StrategyResult;
  report: AnalysisReport;
  analysisId?: string;
}

interface AnalysisStore {
  // Last completed analysis
  result: AnalysisResult | null;
  setResult: (r: AnalysisResult | null) => void;

  // Form inputs (persist so the form returns to last used state)
  symbol: string;
  custom: string;
  style: TradingStyle;
  // Per-analysis overrides for account size / risk %. null = use profile default.
  accountSizeOverride: number | null;
  riskPctOverride: number | null;
  setForm: (
    form: Partial<{
      symbol: string;
      custom: string;
      style: TradingStyle;
      accountSizeOverride: number | null;
      riskPctOverride: number | null;
    }>,
  ) => void;

  clear: () => void;
}

export const useAnalysisStore = create<AnalysisStore>()(
  persist(
    (set) => ({
      result: null,
      setResult: (result) => set({ result }),

      symbol: "BTCUSDT",
      custom: "",
      style: "swing",
      accountSizeOverride: null,
      riskPctOverride: null,
      setForm: (form) => set(form),

      clear: () => set({ result: null }),
    }),
    {
      name: "alpha-gate-analysis",
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? (undefined as never) : sessionStorage,
      ),
      // Don't persist the image (it's transient, large, and re-supplied per run)
      partialize: (state) => ({
        result: state.result,
        symbol: state.symbol,
        custom: state.custom,
        style: state.style,
        accountSizeOverride: state.accountSizeOverride,
        riskPctOverride: state.riskPctOverride,
      }),
    },
  ),
);
