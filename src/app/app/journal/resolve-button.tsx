"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";
import { resolveMyTradesAction } from "@/app/app/_actions";

export function ResolveTradesButton() {
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await resolveMyTradesAction();
          if (res.error) {
            toast.error(res.error);
            return;
          }
          if (res.checked === 0) {
            toast.info(t("journal.cmp.noOpenTrades"));
            return;
          }
          if (res.resolved > 0) {
            toast.success(
              t("journal.cmp.resolvedDone", { checked: res.checked, resolved: res.resolved }) +
                (res.stale > 0 ? t("journal.cmp.staleSuffix", { stale: res.stale }) : ""),
            );
          } else if (res.stale > 0) {
            toast.info(t("journal.cmp.staleOnly", { stale: res.stale }));
          } else {
            toast.info(t("journal.cmp.checkedNoHit", { checked: res.checked }));
          }
        })
      }
    >
      <RefreshCw className={pending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
      {pending ? t("journal.cmp.checking") : t("journal.cmp.resolveNow")}
    </Button>
  );
}
