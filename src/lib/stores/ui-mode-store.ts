"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type UiMode = "beginner" | "advanced";

interface UiModeStore {
  mode: UiMode;
  setMode: (m: UiMode) => void;
  toggle: () => void;
}

export const useUiModeStore = create<UiModeStore>()(
  persist(
    (set, get) => ({
      mode: "advanced",
      setMode: (m) => set({ mode: m }),
      toggle: () => set({ mode: get().mode === "beginner" ? "advanced" : "beginner" }),
    }),
    {
      name: "alpha-gate-ui-mode",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
