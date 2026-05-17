import { cn } from "@/lib/utils";
import type { Grade } from "@/types/trade";

const STYLES: Record<Grade, { bg: string; ring: string; label: string }> = {
  A: { bg: "bg-grade-a", ring: "ring-grade-a/30", label: "진입 가능" },
  B: { bg: "bg-grade-b", ring: "ring-grade-b/30", label: "조건부 진입" },
  C: { bg: "bg-grade-c", ring: "ring-grade-c/30", label: "비추천" },
  D: { bg: "bg-grade-d", ring: "ring-grade-d/30", label: "매매 금지" },
};

export function GradeBadge({ grade, size = "lg" }: { grade: Grade; size?: "sm" | "lg" }) {
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
        <div className="text-lg font-semibold">{s.label}</div>
        <div className="text-xs text-muted-foreground">매매 등급 {grade}</div>
      </div>
    </div>
  );
}
