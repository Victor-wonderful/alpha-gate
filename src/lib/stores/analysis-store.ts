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
  /** 'live' = 실시간, 'backtest' = 과거 시점 시뮬레이션 */
  mode: "live" | "backtest";
  /** 백테스트 모드일 때 분석 기준 시각 (KST datetime-local 문자열, "yyyy-MM-ddTHH:mm" 포맷). live 모드면 null. */
  historicalAtKst: string | null;
  setForm: (
    form: Partial<{
      symbol: string;
      custom: string;
      style: TradingStyle;
      accountSizeOverride: number | null;
      riskPctOverride: number | null;
      mode: "live" | "backtest";
      historicalAtKst: string | null;
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
      mode: "live",
      historicalAtKst: null,
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
        mode: state.mode,
        historicalAtKst: state.historicalAtKst,
      }),
    },
  ),
);
