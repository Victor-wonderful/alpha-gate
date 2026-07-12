"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/context";
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
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const router = useRouter();

  function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusyKey(key);
    startTransition(async () => {
      const res = await fn();
      setBusyKey(null);
      if (!res.ok) {
        toast.error(res.error ?? t("trade.expiry.actionFailed"));
        return;
      }
      const label =
        key === "close"
          ? t("trade.expiry.toastClosed")
          : key === "cancel"
            ? t("trade.expiry.toastCancelled")
            : key === "extend-trade"
              ? t("trade.expiry.toastExtendedTrade")
              : key === "extend-limit"
                ? t("trade.expiry.toastExtendedLimit")
                : t("trade.expiry.toastDismissed");
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
          ? t("trade.expiry.processing")
          : kind === "trade"
            ? t("trade.expiry.closeNow")
            : t("trade.expiry.cancelNow")}
      </button>
      {canExtend ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(kind === "trade" ? "extend-trade" : "extend-limit", extend)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card shadow-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:shadow-card-hover hover:-translate-y-0.5 disabled:opacity-50"
        >
          {busyKey?.startsWith("extend")
            ? t("trade.expiry.processing")
            : kind === "trade"
              ? t("trade.expiry.extend24h")
              : t("trade.expiry.extend12h")}
        </button>
      ) : (
        <button
          type="button"
          disabled
          title={t("trade.expiry.extendOnce")}
          className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-border/60 bg-card shadow-card px-3 py-1.5 text-xs font-semibold text-muted-foreground opacity-60"
        >
          {t("trade.expiry.cannotExtend")}
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => run("dismiss", dismiss)}
        className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
      >
        {busyKey === "dismiss" ? t("trade.expiry.processing") : t("trade.expiry.leaveIt")}
      </button>
    </div>
  );
}
