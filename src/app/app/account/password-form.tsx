"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/context";
import { changePasswordAction } from "./_actions";

export function PasswordForm() {
  const t = useT();
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
      setMsg({ tone: "err", text: t("acct.pw.errTooShort") });
      return;
    }
    if (pw !== pw2) {
      setMsg({ tone: "err", text: t("acct.pw.errMismatch") });
      return;
    }
    startTransition(async () => {
      const res = await changePasswordAction(pw);
      if (res.error) setMsg({ tone: "err", text: res.error });
      else {
        setMsg({ tone: "ok", text: t("acct.pw.changed") });
        setPw("");
        setPw2("");
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-2xl border border-border/60 bg-card shadow-card p-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new_pw">{t("acct.pw.newLabel")}</Label>
          <Input
            id="new_pw"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder={t("acct.pw.newPlaceholder")}
            minLength={8}
            maxLength={128}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new_pw2">{t("acct.pw.confirmLabel")}</Label>
          <Input
            id="new_pw2"
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder={t("acct.pw.confirmPlaceholder")}
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
            {t("acct.pw.note")}
          </span>
        )}
        <Button type="submit" disabled={pending || !pw || !pw2}>
          {pending ? t("acct.pw.changing") : t("acct.pw.changeButton")}
        </Button>
      </div>
    </form>
  );
}
