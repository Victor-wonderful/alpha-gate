"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCapitalAction, refreshRealBalanceAction } from "./_actions";

export type CapitalInitial = {
  account_mode: "real" | "virtual";
  virtual_capital: number;
  real_alloc_type: "amount" | "pct";
  real_alloc_amount: number | null;
  real_alloc_pct: number | null;
  real_balance_cached: number | null;
  real_balance_cached_at: string | null;
  has_binance_key: boolean;
};

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function CapitalForm({ initial }: { initial: CapitalInitial }) {
  const [mode, setMode] = useState<"real" | "virtual">(initial.account_mode);
  const [virtualCap, setVirtualCap] = useState(String(initial.virtual_capital || 10000));
  const [allocType, setAllocType] = useState<"amount" | "pct">(initial.real_alloc_type);
  const [allocAmount, setAllocAmount] = useState(initial.real_alloc_amount != null ? String(initial.real_alloc_amount) : "");
  const [allocPct, setAllocPct] = useState(initial.real_alloc_pct != null ? String(initial.real_alloc_pct) : "");
  const [balance, setBalance] = useState<number | null>(initial.real_balance_cached);
  const [balanceAt, setBalanceAt] = useState<string | null>(initial.real_balance_cached_at);

  const [pending, startTransition] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // 유효 자금 미리보기 (resolver 와 동일 규칙)
  let effective: number | null = null;
  let effectiveNote = "";
  if (mode === "virtual") {
    effective = Number(virtualCap) || 0;
  } else if (balance == null) {
    effectiveNote = "실거래 잔액을 먼저 갱신하세요.";
  } else if (allocType === "amount") {
    const a = Number(allocAmount);
    if (!a) effectiveNote = "배정 금액을 입력하세요.";
    else effective = Math.min(a, balance);
  } else {
    const p = Number(allocPct);
    if (!p) effectiveNote = "배정 비율을 입력하세요.";
    else effective = (balance * p) / 100;
  }

  function onRefresh() {
    setMsg(null);
    startRefresh(async () => {
      const r = await refreshRealBalanceAction();
      if (r.error) setMsg({ tone: "err", text: r.error });
      else {
        setBalance(r.balance ?? null);
        setBalanceAt(new Date().toISOString());
        setMsg({ tone: "ok", text: `잔액 갱신됨: ${fmt(r.balance ?? 0)} USDT` });
      }
    });
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await updateCapitalAction({
        account_mode: mode,
        virtual_capital: Number(virtualCap) || 0,
        real_alloc_type: allocType,
        real_alloc_amount: allocAmount === "" ? null : Number(allocAmount),
        real_alloc_pct: allocPct === "" ? null : Number(allocPct),
      });
      if (res.error) setMsg({ tone: "err", text: res.error });
      else setMsg({ tone: "ok", text: "저장되었습니다." });
    });
  }

  const tabBtn = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
    }`;

  return (
    <div className="space-y-5 rounded-2xl border border-border/60 bg-card shadow-card p-5">
      <div>
        <h2 className="text-lg font-semibold">내 자금</h2>
        <p className="text-sm text-muted-foreground">
          모든 위험 계산(노출·청산 여유·등급)의 기준이 됩니다. 지금 활성 모드의 자금이 앱 전체에 적용됩니다.
        </p>
      </div>

      {/* 모드 전환 */}
      <div className="flex gap-2">
        <button type="button" onClick={() => setMode("real")} className={tabBtn(mode === "real")}>
          실거래 계좌
        </button>
        <button type="button" onClick={() => setMode("virtual")} className={tabBtn(mode === "virtual")}>
          가상 계좌
        </button>
      </div>

      {mode === "real" ? (
        <div className="space-y-4">
          {!initial.has_binance_key && (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Binance API 키가 연결되어 있지 않습니다. 설정 → API 키에서 먼저 연결하면 실제 잔액을 불러올 수 있어요.
            </p>
          )}
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label>실제 잔액 (USDT)</Label>
              <div className="font-mono tabular-nums text-xl">
                {balance != null ? fmt(balance) : "—"}
              </div>
              {balanceAt && (
                <p className="text-xs text-muted-foreground">
                  갱신: {new Date(balanceAt).toLocaleString()}
                </p>
              )}
            </div>
            <Button type="button" variant="outline" onClick={onRefresh} disabled={refreshing || !initial.has_binance_key}>
              {refreshing ? "조회 중…" : "잔액 갱신"}
            </Button>
          </div>

          {/* 배정 방식 */}
          <div className="space-y-1.5">
            <Label>트레이딩 배정 — 잔액 중 얼마를 위험 기준으로 삼을지</Label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAllocType("amount")} className={tabBtn(allocType === "amount")}>
                금액 지정
              </button>
              <button type="button" onClick={() => setAllocType("pct")} className={tabBtn(allocType === "pct")}>
                비율 지정
              </button>
            </div>
          </div>

          {allocType === "amount" ? (
            <div className="space-y-1.5">
              <Label htmlFor="alloc_amount">배정 금액 (USDT)</Label>
              <Input
                id="alloc_amount"
                type="number"
                min="0"
                step="1"
                value={allocAmount}
                onChange={(e) => setAllocAmount(e.target.value)}
                className="font-mono tabular-nums"
                placeholder="예: 5000"
              />
              <p className="text-xs text-muted-foreground">잔액보다 크면 잔액으로 자동 제한됩니다.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="alloc_pct">배정 비율 (%)</Label>
              <Input
                id="alloc_pct"
                type="number"
                min="0"
                max="100"
                step="1"
                value={allocPct}
                onChange={(e) => setAllocPct(e.target.value)}
                className="font-mono tabular-nums"
                placeholder="예: 50"
              />
              <p className="text-xs text-muted-foreground">현재 잔액의 이 비율만큼을 위험 기준으로 씁니다.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="virtual_cap">가상 자금 (USDT)</Label>
          <Input
            id="virtual_cap"
            type="number"
            min="1"
            step="1"
            value={virtualCap}
            onChange={(e) => setVirtualCap(e.target.value)}
            className="font-mono tabular-nums"
          />
          <p className="text-xs text-muted-foreground">연습용 자금. 언제든 늘리고 줄일 수 있습니다.</p>
        </div>
      )}

      {/* 유효 자금 미리보기 */}
      <div className="rounded-lg border border-border/60 bg-muted/40 px-4 py-3">
        <p className="text-xs text-muted-foreground">지금 적용될 자금 ({mode === "real" ? "실거래" : "가상"})</p>
        {effective != null ? (
          <p className="font-mono tabular-nums text-2xl font-semibold">{fmt(effective)} <span className="text-sm text-muted-foreground">USDT</span></p>
        ) : (
          <p className="text-sm text-grade-d">{effectiveNote || "—"}</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
        {msg ? (
          <span className={msg.tone === "ok" ? "text-sm text-grade-a" : "text-sm text-grade-d"}>{msg.text}</span>
        ) : (
          <span />
        )}
        <Button type="button" onClick={onSave} disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </Button>
      </div>
    </div>
  );
}
