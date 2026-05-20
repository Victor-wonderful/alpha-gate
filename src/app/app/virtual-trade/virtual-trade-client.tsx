"use client";

import { useState, useTransition } from "react";
import { Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { depositFundsAction, resetWalletAction } from "./_actions";

const QUICK_DEPOSITS = [1000, 5000, 10000];

export function VirtualTradeClient({ currentBalance }: { currentBalance: number }) {
  const [amount, setAmount] = useState("");
  const [pending, startTransition] = useTransition();

  function deposit(value: number) {
    if (value <= 0) {
      toast.error("0보다 큰 금액을 입력하세요.");
      return;
    }
    startTransition(async () => {
      const r = await depositFundsAction(value);
      if (!r.ok) {
        toast.error(r.error ?? "입금 실패");
        return;
      }
      toast.success(`가상 잔액 +$${value.toLocaleString()} (총 $${r.balance?.toLocaleString()})`);
      setAmount("");
    });
  }

  function reset() {
    if (!confirm("가상 잔액을 $10,000으로 리셋하시겠습니까?\n진행 중인 포지션이 있다면 마진은 회수되지 않습니다. 진행 포지션이 모두 종료된 뒤 리셋을 권장합니다.")) return;
    startTransition(async () => {
      const r = await resetWalletAction(10000);
      if (!r.ok) {
        toast.error(r.error ?? "리셋 실패");
        return;
      }
      toast.success("가상 잔액을 $10,000으로 리셋했습니다.");
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          가상 자금 추가 (USDT)
        </Label>
        <div className="mt-2 flex gap-2">
          <Input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="금액 입력"
            className="font-mono"
          />
          <Button
            disabled={pending || !amount || Number(amount) <= 0}
            onClick={() => deposit(Number(amount))}
          >
            <Plus className="mr-1 h-4 w-4" />
            입금
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
          전체 리셋 (초기화)
        </Label>
        <p className="mt-2 text-xs text-muted-foreground">
          현재 잔액 ${currentBalance.toLocaleString()} → $10,000으로 초기화. 통계와 거래 이력은 유지됩니다.
        </p>
        <Button
          variant="outline"
          className="mt-2 w-full border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
          onClick={reset}
          disabled={pending}
        >
          <RotateCcw className="mr-1 h-4 w-4" />
          $10,000으로 리셋
        </Button>
      </div>
    </div>
  );
}
