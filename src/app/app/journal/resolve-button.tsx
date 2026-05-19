"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveMyTradesAction } from "@/app/app/_actions";

export function ResolveTradesButton() {
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
            toast.info("정산할 열린 거래가 없습니다.");
            return;
          }
          if (res.resolved > 0) {
            toast.success(
              `${res.checked}건 중 ${res.resolved}건 자동 정산 완료.${res.stale > 0 ? ` (타임아웃 ${res.stale}건)` : ""}`,
            );
          } else if (res.stale > 0) {
            toast.info(`정산 대상 없음. 타임아웃 ${res.stale}건은 수동 정리 필요.`);
          } else {
            toast.info(`${res.checked}건 확인 — 아직 손절/목표 적중 없음.`);
          }
        })
      }
    >
      <RefreshCw className={pending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
      {pending ? "확인 중..." : "지금 자동 정산"}
    </Button>
  );
}
