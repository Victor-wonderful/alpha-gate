"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { Grade } from "@/types/trade";

const STYLES: Record<Grade, { bg: string; ring: string }> = {
  A: { bg: "bg-grade-a", ring: "ring-grade-a/30" },
  B: { bg: "bg-grade-b", ring: "ring-grade-b/30" },
  C: { bg: "bg-grade-c", ring: "ring-grade-c/30" },
  D: { bg: "bg-grade-d", ring: "ring-grade-d/30" },
};

export function GradeBadge({ grade, size = "lg" }: { grade: Grade; size?: "sm" | "lg" }) {
  const t = useT();
  const s = STYLES[grade];
  if (size === "sm") {
    return (
      <span
        className={cn(
          "inline-flex h-6 w-6 items-center justify-center rounded-md font-bold text-white",
          s.bg,
        )}
      >
        {grade}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-lg text-3xl font-bold text-white ring-4",
          s.bg,
          s.ring,
        )}
      >
        {grade}
      </span>
      <div>
        <div className="text-lg font-semibold">{t(`grade.${grade}.label`)}</div>
        <div className="text-xs text-muted-foreground">{t("grade.badgeLabel", { grade })}</div>
      </div>
    </div>
  );
}
