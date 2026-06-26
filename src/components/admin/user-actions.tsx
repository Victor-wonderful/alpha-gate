"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Sparkles, Coins, RotateCcw, Ban, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/context";
import {
  grantAiCreditsAction,
  depositVusdtAction,
  resetVusdtAction,
  toggleDisabledAction,
} from "@/app/app/admin/users/[id]/_actions";

function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  destructive,
  onConfirm,
  onClose,
  pending,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  pending: boolean;
}) {
  const t = useT();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            size="sm"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? t("admin.processing") : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function UserActions({
  userId,
  disabled,
}: {
  userId: string;
  disabled: boolean;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [credits, setCredits] = useState("5");
  const [deposit, setDeposit] = useState("1000");
  const [modal, setModal] = useState<null | "reset" | "toggle">(null);

  function run(fn: () => Promise<{ ok?: true; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else toast.success(success);
      setModal(null);
    });
  }

  return (
    <div className="space-y-4">
      {/* AI 크레딧 부여 */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[120px]">
          <label className="mb-1 block text-xs text-muted-foreground">{t("admin.grantCredits")}</label>
          <Input
            type="number"
            min={1}
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            className="h-9"
          />
        </div>
        <Button
          size="sm"
          onClick={() => run(() => grantAiCreditsAction(userId, Number(credits)), t("admin.grantCreditsDone"))}
          disabled={pending}
        >
          <Sparkles className="h-4 w-4" />
          {t("admin.grant")}
        </Button>
      </div>

      {/* vUSDT 입금 */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[120px]">
          <label className="mb-1 block text-xs text-muted-foreground">{t("admin.depositVusdt")}</label>
          <Input
            type="number"
            min={1}
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            className="h-9"
          />
        </div>
        <Button
          size="sm"
          onClick={() => run(() => depositVusdtAction(userId, Number(deposit)), t("admin.depositDone"))}
          disabled={pending}
        >
          <Coins className="h-4 w-4" />
          {t("admin.deposit")}
        </Button>
      </div>

      {/* Destructive */}
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button variant="outline" size="sm" onClick={() => setModal("reset")} disabled={pending}>
          <RotateCcw className="h-4 w-4" />
          {t("admin.resetVusdt")}
        </Button>
        <Button
          variant={disabled ? "default" : "destructive"}
          size="sm"
          onClick={() => setModal("toggle")}
          disabled={pending}
        >
          {disabled ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
          {disabled ? t("admin.enableAccount") : t("admin.disableAccount")}
        </Button>
      </div>

      <ConfirmModal
        open={modal === "reset"}
        title={t("admin.resetModalTitle")}
        body={t("admin.resetModalBody")}
        confirmLabel={t("admin.reset")}
        destructive
        pending={pending}
        onClose={() => setModal(null)}
        onConfirm={() => run(() => resetVusdtAction(userId), t("admin.resetDone"))}
      />
      <ConfirmModal
        open={modal === "toggle"}
        title={disabled ? t("admin.enableAccount") : t("admin.disableAccount")}
        body={disabled ? t("admin.enableModalBody") : t("admin.disableModalBody")}
        confirmLabel={disabled ? t("admin.enable") : t("admin.disable")}
        destructive={!disabled}
        pending={pending}
        onClose={() => setModal(null)}
        onConfirm={() =>
          run(
            () => toggleDisabledAction(userId, !disabled),
            disabled ? t("admin.enableDone") : t("admin.disableDone"),
          )
        }
      />
    </div>
  );
}
