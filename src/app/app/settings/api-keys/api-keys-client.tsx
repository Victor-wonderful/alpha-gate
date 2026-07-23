"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, KeyRound, RefreshCw, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import {
  registerKeyAction,
  reverifyKeyAction,
  deleteKeyAction,
  verifyKeyAction,
  type RegisterKeyResult,
} from "./_actions";

type ExchangeId = "binance" | "bybit" | "upbit";

type SavedKey = {
  id: string;
  exchange: ExchangeId;
  nickname: string | null;
  api_key_masked: string;
  permissions: Record<string, unknown>;
  verification_status: "unverified" | "valid" | "invalid" | "expired";
  verification_error: string | null;
  last_verified_at: string | null;
  created_at: string;
  testnet?: boolean;
};

/** Exchanges with a working live-trading adapter. */
const SUPPORTED_EXCHANGES: { id: ExchangeId; label: string }[] = [
  { id: "binance", label: "Binance 선물" },
  { id: "bybit", label: "Bybit 선물" },
];

export function ApiKeysClient({ initial }: { initial: SavedKey[] }) {
  const t = useT();
  const [exchange, setExchange] = useState<ExchangeId>("binance");
  const [testnet, setTestnet] = useState(false);
  const [nickname, setNickname] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [verifyResult, setVerifyResult] = useState<RegisterKeyResult | null>(null);
  const [submitMsg, setSubmitMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleVerify() {
    setVerifyResult(null);
    setSubmitMsg(null);
    startTransition(async () => {
      const r = await verifyKeyAction(exchange, apiKey, apiSecret, testnet);
      setVerifyResult(r);
    });
  }

  async function handleSubmit() {
    setSubmitMsg(null);
    startTransition(async () => {
      const r = await registerKeyAction({ exchange, nickname, apiKey, apiSecret, testnet });
      if (r.ok) {
        setSubmitMsg({ tone: "ok", text: t("settings.apiKeys.registeredMsg") });
        setApiKey("");
        setApiSecret("");
        setNickname("");
        setVerifyResult(null);
      } else {
        setSubmitMsg({ tone: "err", text: r.error ?? t("settings.apiKeys.registerFailed") });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Security warning */}
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="flex gap-3 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div className="space-y-1 text-amber-100/90">
            <div className="font-semibold">{t("settings.apiKeys.warn.title")}</div>
            <ul className="ml-4 list-disc space-y-0.5 text-amber-100/70">
              <li><b>{t("settings.apiKeys.warn.tradeOnly")}</b> (Enable Futures / Spot Trading)</li>
              <li><b>{t("settings.apiKeys.warn.noWithdraw")}</b> {t("settings.apiKeys.warn.noWithdrawNote")}</li>
              <li>{t("settings.apiKeys.warn.ipWhitelistPre")} <b>{t("settings.apiKeys.warn.ipWhitelist")}</b> {t("settings.apiKeys.warn.ipWhitelistPost")}</li>
            </ul>
            <div className="pt-1 text-xs">
              {t("settings.apiKeys.warn.encrypted")}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Saved keys */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            {t("settings.apiKeys.savedKeys", { n: initial.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {initial.length === 0 ? (
            <div className="px-5 pb-5 text-sm text-muted-foreground">
              {t("settings.apiKeys.empty")}
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {initial.map((k) => (
                <SavedKeyRow key={k.id} keyRow={k} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Add key form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.apiKeys.newKey")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">{t("settings.apiKeys.exchange")}</Label>
              <div className="mt-1.5 flex gap-2">
                {SUPPORTED_EXCHANGES.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => setExchange(ex.id)}
                    className={cn(
                      "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                      exchange === ex.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:border-border/60",
                    )}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={testnet}
                  onChange={(e) => setTestnet(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                테스트넷 키 (실제 자금 아님 — 연동 검증용)
              </label>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("settings.apiKeys.nickname")}</Label>
              <Input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={t("settings.apiKeys.nicknamePlaceholder")}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">{t("settings.apiKeys.publicKey")}</Label>
            <Input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="ex) z5..."
              className="mt-1.5 font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">{t("settings.apiKeys.secretKey")}</Label>
            <Input
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              type="password"
              placeholder={t("settings.apiKeys.secretPlaceholder")}
              className="mt-1.5 font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleVerify}
              disabled={pending || !apiKey || !apiSecret}
            >
              <ShieldCheck className="mr-1.5 h-4 w-4" />
              {t("settings.apiKeys.verifyOnly")}
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={pending || !apiKey || !apiSecret}
            >
              {pending ? t("settings.apiKeys.processing") : t("settings.apiKeys.verifyAndRegister")}
            </Button>
          </div>

          {verifyResult ? <VerifyResultCard result={verifyResult} /> : null}

          {submitMsg ? (
            <div
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                submitMsg.tone === "ok"
                  ? "border-grade-a/40 bg-grade-a/10 text-grade-a"
                  : "border-grade-d/40 bg-grade-d/10 text-grade-d",
              )}
            >
              {submitMsg.text}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function VerifyResultCard({ result }: { result: RegisterKeyResult }) {
  const t = useT();
  if (!result.ok) {
    return (
      <div className="rounded-md border border-grade-d/40 bg-grade-d/10 p-3 text-sm">
        <div className="flex items-center gap-1.5 font-semibold text-grade-d">
          <ShieldOff className="h-4 w-4" />
          {t("settings.apiKeys.verifyFailed")}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{result.error}</p>
      </div>
    );
  }
  const canWithdraw = result.permissions?.canWithdraw ?? false;
  return (
    <div className="rounded-md border border-grade-a/40 bg-grade-a/10 p-3 text-sm">
      <div className="flex items-center gap-1.5 font-semibold text-grade-a">
        <Check className="h-4 w-4" />
        {t("settings.apiKeys.keyOk", { balance: formatNumber(result.balance ?? 0) })}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge className="border border-grade-a/40 bg-grade-a/10 text-grade-a">
          {t("settings.apiKeys.tradePermOk")}
        </Badge>
        {canWithdraw ? (
          <Badge className="border border-grade-d/40 bg-grade-d/10 text-grade-d">
            {t("settings.apiKeys.withdrawOn")}
          </Badge>
        ) : (
          <Badge className="border border-grade-a/40 bg-grade-a/10 text-grade-a">
            {t("settings.apiKeys.withdrawOff")}
          </Badge>
        )}
      </div>
    </div>
  );
}

function SavedKeyRow({ keyRow: k }: { keyRow: SavedKey }) {
  const t = useT();
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function reverify() {
    setMsg(null);
    startTransition(async () => {
      const r = await reverifyKeyAction(k.id);
      setMsg(r.ok ? t("settings.apiKeys.reverifyOk") : t("settings.apiKeys.reverifyFailed", { error: r.error ?? "" }));
    });
  }

  function remove() {
    if (!confirm(t("settings.apiKeys.deleteConfirm", { name: k.nickname ?? k.id }))) return;
    startTransition(async () => {
      const r = await deleteKeyAction(k.id);
      if (!r.ok) setMsg(t("settings.apiKeys.deleteFailed", { error: r.error ?? "" }));
    });
  }

  const isValid = k.verification_status === "valid";
  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{k.nickname ?? t("settings.apiKeys.noName")}</span>
            <Badge className="border border-border bg-background/60 text-[10px] uppercase">
              {k.exchange}
            </Badge>
            {k.testnet ? (
              <Badge className="border border-amber-500/40 bg-amber-500/10 text-[10px] uppercase text-amber-400">
                테스트넷
              </Badge>
            ) : null}
            <Badge
              className={cn(
                "border text-[10px]",
                isValid
                  ? "border-grade-a/40 bg-grade-a/10 text-grade-a"
                  : "border-grade-d/40 bg-grade-d/10 text-grade-d",
              )}
            >
              {isValid ? t("settings.apiKeys.verified") : k.verification_status}
            </Badge>
          </div>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">
            {k.api_key_masked} ·{" "}
            {k.last_verified_at
              ? new Date(k.last_verified_at).toLocaleString("ko-KR")
              : t("settings.apiKeys.notVerified")}
          </div>
          {k.verification_error ? (
            <div className="mt-0.5 text-[11px] text-grade-d">{k.verification_error}</div>
          ) : null}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={reverify} disabled={busy}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={remove} disabled={busy}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {msg ? <div className="mt-1 text-xs text-muted-foreground">{msg}</div> : null}
    </li>
  );
}
