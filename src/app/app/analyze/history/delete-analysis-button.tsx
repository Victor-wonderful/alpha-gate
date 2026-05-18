"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteAnalysisAction } from "../_actions";

export function DeleteAnalysisButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    startTransition(async () => {
      const res = await deleteAnalysisAction(id);
      if (res.error) {
        toast.error(res.error);
        setConfirming(false);
        return;
      }
      toast.success("분석을 삭제했습니다.");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors " +
        (confirming
          ? "border-grade-d/60 bg-grade-d/20 text-grade-d"
          : "border-border bg-background/40 text-muted-foreground hover:border-grade-d/40 hover:bg-grade-d/10 hover:text-grade-d")
      }
      aria-label={`${label} 분석 삭제`}
    >
      <Trash2 className="h-3 w-3" />
      {pending ? "삭제 중..." : confirming ? "정말?" : "삭제"}
    </button>
  );
}
