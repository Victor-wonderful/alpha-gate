"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Sparkles, Coins, RotateCcw, Ban, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            size="sm"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "처리 중…" : confirmLabel}
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
          <label className="mb-1 block text-xs text-muted-foreground">AI 크레딧 부여</label>
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
          onClick={() => run(() => grantAiCreditsAction(userId, Number(credits)), "AI 크레딧을 부여했습니다.")}
          disabled={pending}
        >
          <Sparkles className="h-4 w-4" />
          부여
        </Button>
      </div>

      {/* vUSDT 입금 */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[120px]">
          <label className="mb-1 block text-xs text-muted-foreground">vUSDT 입금</label>
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
          onClick={() => run(() => depositVusdtAction(userId, Number(deposit)), "vUSDT를 입금했습니다.")}
          disabled={pending}
        >
          <Coins className="h-4 w-4" />
          입금
        </Button>
      </div>

      {/* Destructive */}
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button variant="outline" size="sm" onClick={() => setModal("reset")} disabled={pending}>
          <RotateCcw className="h-4 w-4" />
          vUSDT 초기화
        </Button>
        <Button
          variant={disabled ? "default" : "destructive"}
          size="sm"
          onClick={() => setModal("toggle")}
          disabled={pending}
        >
          {disabled ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
          {disabled ? "계정 활성화" : "계정 비활성화"}
        </Button>
      </div>

      <ConfirmModal
        open={modal === "reset"}
        title="vUSDT 잔액 초기화"
        body="이 회원의 vUSDT 잔액을 기본값($10,000)으로 되돌립니다. 진행 중 포지션의 마진은 해제됩니다. 되돌릴 수 없습니다."
        confirmLabel="초기화"
        destructive
        pending={pending}
        onClose={() => setModal(null)}
        onConfirm={() => run(() => resetVusdtAction(userId), "vUSDT를 초기화했습니다.")}
      />
      <ConfirmModal
        open={modal === "toggle"}
        title={disabled ? "계정 활성화" : "계정 비활성화"}
        body={
          disabled
            ? "이 회원이 다시 앱에 접근할 수 있게 됩니다."
            : "이 회원은 앱 접근이 차단되고 로그인 시 비활성 안내를 받습니다."
        }
        confirmLabel={disabled ? "활성화" : "비활성화"}
        destructive={!disabled}
        pending={pending}
        onClose={() => setModal(null)}
        onConfirm={() =>
          run(
            () => toggleDisabledAction(userId, !disabled),
            disabled ? "계정을 활성화했습니다." : "계정을 비활성화했습니다.",
          )
        }
      />
    </div>
  );
}
