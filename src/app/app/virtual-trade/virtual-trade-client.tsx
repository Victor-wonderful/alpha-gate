"use client";

import { useState, useTransition } from "react";
import { Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { depositFundsAction, resetWalletAction } from "./_actions";
import { useT } from "@/lib/i18n/context";

const QUICK_DEPOSITS = [1000, 5000, 10000];

export function VirtualTradeClient({ currentBalance }: { currentBalance: number }) {
  const t = useT();
  const [amount, setAmount] = useState("");
  const [pending, startTransition] = useTransition();

  function deposit(value: number) {
    if (value <= 0) {
      toast.error(t("paper.vt.errPositiveAmount"));
      return;
    }
    startTransition(async () => {
      const r = await depositFundsAction(value);
      if (!r.ok) {
        toast.error(r.error ?? t("paper.vt.errDepositFailed"));
        return;
      }
      toast.success(
        t("paper.vt.depositSuccess", {
          amount: value.toLocaleString(),
          total: r.balance?.toLocaleString() ?? "",
        }),
      );
      setAmount("");
    });
  }

  function reset() {
    if (!confirm(t("paper.vt.resetConfirm"))) return;
    startTransition(async () => {
      const r = await resetWalletAction(10000);
      if (!r.ok) {
        toast.error(r.error ?? t("paper.vt.errResetFailed"));
        return;
      }
      toast.success(t("paper.vt.resetSuccess"));
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("paper.vt.addFunds")}
        </Label>
        <div className="mt-2 flex gap-2">
          <Input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("paper.vt.amountPlaceholder")}
            className="font-mono"
          />
          <Button
            disabled={pending || !amount || Number(amount) <= 0}
            onClick={() => deposit(Number(amount))}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("paper.vt.deposit")}
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_DEPOSITS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => deposit(v)}
              disabled={pending}
              className="rounded-md border border-border bg-background/40 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              +${v.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("paper.vt.fullReset")}
        </Label>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("paper.vt.resetDesc", { balance: currentBalance.toLocaleString() })}
        </p>
        <Button
          variant="outline"
          className="mt-2 w-full border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
          onClick={reset}
          disabled={pending}
        >
          <RotateCcw className="mr-1 h-4 w-4" />
          {t("paper.vt.resetButton")}
        </Button>
      </div>
    </div>
  );
}
