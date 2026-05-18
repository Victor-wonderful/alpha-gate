"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteTradeAction } from "./_actions";

export function DeleteTradeButton({ id, symbol }: { id: string; symbol: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function onDelete() {
    if (!confirming) {
      setConfirming(true);
      // 5초 안에 다시 누르지 않으면 취소
      setTimeout(() => setConfirming(false), 5000);
      return;
    }
    startTransition(async () => {
      const res = await deleteTradeAction(id);
      if (res.error) {
        toast.error(res.error);
        setConfirming(false);
        return;
      }
      toast.success("거래를 삭제했습니다.");
      router.push("/app/journal");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant={confirming ? "destructive" : "ghost"}
      size="sm"
      onClick={onDelete}
      disabled={pending}
      className="gap-1.5"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {pending ? "삭제 중..." : confirming ? `${symbol} 정말 삭제? (다시 클릭)` : "삭제"}
    </Button>
  );
}
