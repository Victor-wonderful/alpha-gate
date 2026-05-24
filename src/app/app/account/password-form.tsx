"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction } from "./_actions";

export function PasswordForm() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (pw.length < 8) {
      setMsg({ tone: "err", text: "비밀번호는 8자 이상이어야 합니다." });
      return;
    }
    if (pw !== pw2) {
      setMsg({ tone: "err", text: "비밀번호가 일치하지 않습니다." });
      return;
    }
    startTransition(async () => {
      const res = await changePasswordAction(pw);
      if (res.error) setMsg({ tone: "err", text: res.error });
      else {
        setMsg({ tone: "ok", text: "비밀번호가 변경됐습니다." });
        setPw("");
        setPw2("");
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-2xl border border-border/60 bg-card/40 p-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new_pw">새 비밀번호</Label>
          <Input
            id="new_pw"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="8자 이상"
            minLength={8}
            maxLength={128}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new_pw2">새 비밀번호 확인</Label>
          <Input
            id="new_pw2"
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="다시 입력"
            minLength={8}
            maxLength={128}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
        {msg ? (
          <span
            className={
              msg.tone === "ok"
                ? "text-sm text-grade-a"
                : "text-sm text-grade-d"
            }
          >
            {msg.text}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            현재 비밀번호 입력 없이 즉시 변경됩니다 (로그인된 세션 기준).
          </span>
        )}
        <Button type="submit" disabled={pending || !pw || !pw2}>
          {pending ? "변경 중…" : "비밀번호 변경"}
        </Button>
      </div>
    </form>
  );
}
