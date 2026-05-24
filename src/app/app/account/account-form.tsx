"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { updateProfileAction } from "./_actions";

type Initial = {
  display_name: string | null;
  default_style: "scalp" | "day" | "swing" | "position";
  default_risk_pct: number;
  default_leverage: number;
};

const STYLE_LABEL = {
  scalp: "스캘핑 (수분~수시간)",
  day: "데이 (수시간~하루)",
  swing: "스윙 (며칠~수주)",
  position: "포지션 (수주~수개월)",
} as const;

export function AccountForm({ initial }: { initial: Initial }) {
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
      else setMsg({ tone: "ok", text: "저장됐습니다." });
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-2xl border border-border/60 bg-card/40 p-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="display_name">표시 이름</Label>
          <Input
            id="display_name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="예: 빅터"
            maxLength={30}
          />
          <p className="text-xs text-muted-foreground">
            비워두면 이메일 앞부분이 사용됩니다.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="default_style">기본 트레이딩 스타일</Label>
          <Select
            id="default_style"
            value={style}
            onChange={(e) =>
              setStyle(e.target.value as Initial["default_style"])
            }
          >
            {Object.entries(STYLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="default_risk_pct">거래당 리스크 %</Label>
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
            계좌 대비 잃을 한도. 일반적으로 1~2%.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="default_leverage">기본 레버리지</Label>
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
            1~125배. 가상 트레이딩 진입 시 기본값.
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
          {pending ? "저장 중…" : "저장"}
        </Button>
      </div>
    </form>
  );
}
