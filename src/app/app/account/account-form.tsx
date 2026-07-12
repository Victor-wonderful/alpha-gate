"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/i18n/context";
import { updateProfileAction } from "./_actions";

type Initial = {
  display_name: string | null;
  default_style: "scalp" | "day" | "swing" | "position";
  default_risk_pct: number;
  default_leverage: number;
};

const STYLE_KEYS = ["scalp", "day", "swing", "position"] as const;

export function AccountForm({ initial }: { initial: Initial }) {
  const t = useT();
  const [displayName, setDisplayName] = useState(initial.display_name ?? "");
  const [style, setStyle] = useState(initial.default_style);
  const [riskPct, setRiskPct] = useState(initial.default_risk_pct);
  const [leverage, setLeverage] = useState(initial.default_leverage);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res = await updateProfileAction({
        display_name: displayName,
        default_style: style,
        default_risk_pct: riskPct,
        default_leverage: leverage,
      });
      if (res.error) setMsg({ tone: "err", text: res.error });
      else setMsg({ tone: "ok", text: t("acct.form.saved") });
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-2xl border border-border/60 bg-card shadow-card p-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="display_name">{t("acct.form.displayName")}</Label>
          <Input
            id="display_name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("acct.form.displayNamePlaceholder")}
            maxLength={30}
          />
          <p className="text-xs text-muted-foreground">
            {t("acct.form.displayNameHint")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="default_style">{t("acct.form.style")}</Label>
          <Select
            id="default_style"
            value={style}
            onChange={(e) =>
              setStyle(e.target.value as Initial["default_style"])
            }
          >
            {STYLE_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`acct.form.styleOption.${k}`)}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="default_risk_pct">{t("acct.form.riskPct")}</Label>
          <Input
            id="default_risk_pct"
            type="number"
            step="0.1"
            min="0.1"
            max="10"
            value={riskPct}
            onChange={(e) => setRiskPct(Number(e.target.value))}
            className="font-mono tabular-nums"
          />
          <p className="text-xs text-muted-foreground">
            {t("acct.form.riskPctHint")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="default_leverage">{t("acct.form.leverage")}</Label>
          <Input
            id="default_leverage"
            type="number"
            step="1"
            min="1"
            max="125"
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="font-mono tabular-nums"
          />
          <p className="text-xs text-muted-foreground">
            {t("acct.form.leverageHint")}
          </p>
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
          <span />
        )}
        <Button type="submit" disabled={pending}>
          {pending ? t("acct.form.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
