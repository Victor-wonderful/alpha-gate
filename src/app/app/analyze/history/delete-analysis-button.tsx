"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteAnalysisAction } from "../_actions";
import { useT } from "@/lib/i18n/context";

export function DeleteAnalysisButton({ id, label }: { id: string; label: string }) {
  const t = useT();
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
      toast.success(t("analyze.pageh.deleteSuccess"));
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
      aria-label={t("analyze.pageh.deleteAria", { label })}
    >
      <Trash2 className="h-3 w-3" />
      {pending ? t("analyze.pageh.deleting") : confirming ? t("analyze.pageh.deleteConfirm") : t("analyze.pageh.delete")}
    </button>
  );
}
