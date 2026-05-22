"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelPendingLimitByTradeAction } from "./_actions";

export function CancelPendingButton({ tradeId }: { tradeId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await cancelPendingLimitByTradeAction(tradeId);
          if (!r.ok) {
            toast.error(r.error ?? "취소 실패");
            return;
          }
          toast.success("지정가 주문을 취소했습니다.");
        })
      }
    >
      {pending ? "취소 중…" : "주문 취소"}
    </Button>
  );
}
