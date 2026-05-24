"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  closeTradeNowAction,
  extendTradeAction,
  dismissExpiryWarningAction,
  cancelLimitNowAction,
  extendLimitAction,
  dismissLimitExpiryWarningAction,
} from "@/app/app/expiry/_actions";

interface Props {
  kind: "trade" | "limit";
  id: string;
  canExtend: boolean;
}

export function ExpiryActions({ kind, id, canExtend }: Props) {
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const router = useRouter();

  function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusyKey(key);
    startTransition(async () => {
      const res = await fn();
      setBusyKey(null);
      if (!res.ok) {
        toast.error(res.error ?? "처리 실패");
        return;
      }
      const label =
        key === "close"
          ? "청산됐습니다."
          : key === "cancel"
            ? "취소됐습니다."
            : key === "extend-trade"
              ? "+24시간 연장됐습니다."
              : key === "extend-limit"
                ? "+12시간 연장됐습니다."
                : "다시 묻지 않습니다.";
      toast.success(label);
      router.refresh();
    });
  }

  const closeOrCancel = () =>
    kind === "trade"
      ? closeTradeNowAction(id)
      : cancelLimitNowAction(id);
  const extend = () =>
    kind === "trade" ? extendTradeAction(id) : extendLimitAction(id);
  const dismiss = () =>
    kind === "trade"
      ? dismissExpiryWarningAction(id)
      : dismissLimitExpiryWarningAction(id);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run("close", closeOrCancel)}
        className="inline-flex items-center gap-1 rounded-md bg-grade-d px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-grade-d/90 disabled:opacity-50"
      >
        {busyKey === "close"
          ? "처리 중…"
          : kind === "trade"
            ? "지금 청산"
            : "지금 취소"}
      </button>
      {canExtend ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(kind === "trade" ? "extend-trade" : "extend-limit", extend)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card/40 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-card/70 disabled:opacity-50"
        >
          {busyKey?.startsWith("extend") ? "처리 중…" : kind === "trade" ? "24h 연장" : "12h 연장"}
        </button>
      ) : (
        <button
          type="button"
          disabled
          title="연장은 1회만 가능"
          className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-border/60 bg-card/20 px-3 py-1.5 text-xs font-semibold text-muted-foreground opacity-60"
        >
          연장 불가
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => run("dismiss", dismiss)}
        className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
      >
        {busyKey === "dismiss" ? "처리 중…" : "그냥 두기"}
      </button>
    </div>
  );
}
