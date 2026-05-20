"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, KeyRound, RefreshCw, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";
import {
  registerKeyAction,
  reverifyKeyAction,
  deleteKeyAction,
  verifyBinanceKeyAction,
  type RegisterKeyResult,
} from "./_actions";

type SavedKey = {
  id: string;
  exchange: "binance" | "upbit";
  nickname: string | null;
  api_key_masked: string;
  permissions: Record<string, unknown>;
  verification_status: "unverified" | "valid" | "invalid" | "expired";
  verification_error: string | null;
  last_verified_at: string | null;
  created_at: string;
};

export function ApiKeysClient({ initial }: { initial: SavedKey[] }) {
  const [exchange, setExchange] = useState<"binance" | "upbit">("binance");
  const [nickname, setNickname] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [verifyResult, setVerifyResult] = useState<RegisterKeyResult | null>(null);
  const [submitMsg, setSubmitMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleVerify() {
    setVerifyResult(null);
    setSubmitMsg(null);
    if (exchange !== "binance") {
      setVerifyResult({
        ok: false,
        error: "Upbit 연동은 다음 단계에서 추가됩니다. 현재는 Binance만 검증 가능합니다.",
      });
      return;
    }
    startTransition(async () => {
      const r = await verifyBinanceKeyAction(apiKey, apiSecret);
      setVerifyResult(r);
    });
  }

  async function handleSubmit() {
    setSubmitMsg(null);
    startTransition(async () => {
      const r = await registerKeyAction({ exchange, nickname, apiKey, apiSecret });
      if (r.ok) {
        setSubmitMsg({ tone: "ok", text: "키가 등록되었습니다. 페이지 새로고침으로 목록을 확인하세요." });
        setApiKey("");
        setApiSecret("");
        setNickname("");
        setVerifyResult(null);
      } else {
        setSubmitMsg({ tone: "err", text: r.error ?? "등록 실패" });
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
            <div className="font-semibold">키 발급 시 필수 설정</div>
            <ul className="ml-4 list-disc space-y-0.5 text-amber-100/70">
              <li><b>거래만 활성화</b> (Enable Futures / Spot Trading)</li>
              <li><b>출금 절대 비활성</b> (Enable Withdrawals = OFF) — 출금 켠 키는 등록 차단됨</li>
              <li>가능하면 <b>IP 화이트리스트</b> 설정 (Vercel 서울 리전)</li>
            </ul>
            <div className="pt-1 text-xs">
              Alpha Gate는 출금 권한이 있는 키를 절대 받지 않습니다. 모든 키는 AES-256-GCM으로
              암호화되어 저장되며, 등록 후 평문은 다시 볼 수 없습니다.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Saved keys */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            등록된 키 ({initial.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {initial.length === 0 ? (
            <div className="px-5 pb-5 text-sm text-muted-foreground">
              아직 등록된 키가 없습니다. 아래 폼에서 추가하세요.
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
          <CardTitle className="text-base">새 키 등록</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">거래소</Label>
              <div className="mt-1.5 flex gap-2">
                {(["binance", "upbit"] as const).map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setExchange(ex)}
                    className={cn(
                      "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                      exchange === ex
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:border-border/60",
                    )}
                  >
                    {ex === "binance" ? "Binance Futures" : "Upbit (현물)"}
                  </button>
                ))}
              </div>
              {exchange === "upbit" ? (
                <p className="mt-1.5 text-[11px] text-amber-400">
                  Upbit는 다음 단계에서 활성화됩니다.
                </p>
              ) : null}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">별칭 (선택)</Label>
              <Input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="예: 메인, 테스트"
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">API 키 (Public Key)</Label>
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
            <Label className="text-xs text-muted-foreground">시크릿 키 (Secret Key)</Label>
            <Input
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              type="password"
              placeholder="시크릿은 다시 볼 수 없습니다. 한 번에 정확히 입력하세요."
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
              disabled={pending || !apiKey || !apiSecret || exchange !== "binance"}
            >
              <ShieldCheck className="mr-1.5 h-4 w-4" />
              검증만
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={pending || !apiKey || !apiSecret || exchange !== "binance"}
            >
              {pending ? "처리 중..." : "검증 + 등록"}
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
  if (!result.ok) {
    return (
      <div className="rounded-md border border-grade-d/40 bg-grade-d/10 p-3 text-sm">
        <div className="flex items-center gap-1.5 font-semibold text-grade-d">
          <ShieldOff className="h-4 w-4" />
          검증 실패
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
        키 정상 — 잔액 ${formatNumber(result.balance ?? 0)} USDT
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge className="border border-grade-a/40 bg-grade-a/10 text-grade-a">
          거래 권한 OK
        </Badge>
        {canWithdraw ? (
          <Badge className="border border-grade-d/40 bg-grade-d/10 text-grade-d">
            ⚠ 출금 권한 있음 (등록 거부됨)
          </Badge>
        ) : (
          <Badge className="border border-grade-a/40 bg-grade-a/10 text-grade-a">
            출금 권한 없음 (안전)
          </Badge>
        )}
      </div>
    </div>
  );
}

function SavedKeyRow({ keyRow: k }: { keyRow: SavedKey }) {
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function reverify() {
    setMsg(null);
    startTransition(async () => {
      const r = await reverifyKeyAction(k.id);
      setMsg(r.ok ? "재검증 OK" : `재검증 실패: ${r.error}`);
    });
  }

  function remove() {
    if (!confirm(`'${k.nickname ?? k.id}' 키를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    startTransition(async () => {
      const r = await deleteKeyAction(k.id);
      if (!r.ok) setMsg(`삭제 실패: ${r.error}`);
    });
  }

  const isValid = k.verification_status === "valid";
  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{k.nickname ?? "(이름 없음)"}</span>
            <Badge className="border border-border bg-background/60 text-[10px] uppercase">
              {k.exchange}
            </Badge>
            <Badge
              className={cn(
                "border text-[10px]",
                isValid
                  ? "border-grade-a/40 bg-grade-a/10 text-grade-a"
                  : "border-grade-d/40 bg-grade-d/10 text-grade-d",
              )}
            >
              {isValid ? "검증됨" : k.verification_status}
            </Badge>
          </div>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">
            {k.api_key_masked} ·{" "}
            {k.last_verified_at
              ? new Date(k.last_verified_at).toLocaleString("ko-KR")
              : "검증 안 됨"}
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
