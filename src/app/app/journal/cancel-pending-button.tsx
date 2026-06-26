"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";
import { cancelPendingLimitByTradeAction } from "./_actions";

export function CancelPendingButton({ tradeId }: { tradeId: string }) {
  const t = useT();
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
            toast.error(r.error ?? t("journal.cmp.cancelFailed"));
            return;
          }
          toast.success(t("journal.cmp.cancelSuccess"));
        })
      }
    >
      {pending ? t("journal.cmp.cancelling") : t("journal.cmp.cancelOrder")}
    </Button>
  );
}
