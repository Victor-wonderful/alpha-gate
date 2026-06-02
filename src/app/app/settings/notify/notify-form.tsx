"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  saveChannelsAction,
  testNotifyAction,
  createTelegramLinkAction,
  getCurrentChatIdAction,
} from "./_actions";
import { ANALYSIS_ALERT_OPTIONS } from "@/lib/analysis/sessions";

type Initial = {
  telegram_chat_id?: string | null;
  discord_webhook_url?: string | null;
  enable_d_grade_warn?: boolean;
  enable_losing_streak?: boolean;
  enable_ai_coach_done?: boolean;
  enable_daily_digest?: boolean;
  analysis_alert_times?: number[] | null;
} | null;

export function NotifyForm({ initial }: { initial: Initial }) {
  const [pending, startTransition] = useTransition();
  const [tg, setTg] = useState(initial?.telegram_chat_id ?? "");
  const [dc, setDc] = useState(initial?.discord_webhook_url ?? "");
  const [eD, setED] = useState(initial?.enable_d_grade_warn ?? true);
  const [eL, setEL] = useState(initial?.enable_losing_streak ?? true);
  const [eA, setEA] = useState(initial?.enable_ai_coach_done ?? true);
  const [eDig, setEDig] = useState(initial?.enable_daily_digest ?? false);
  const [alertTimes, setAlertTimes] = useState<number[]>(initial?.analysis_alert_times ?? []);
  // Telegram 자동 폴링 — 링크 생성 시 활성화, chat_id 잡히면 자동 종료
  const [polling, setPolling] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!polling) return;
    const startedAt = Date.now();
    const MAX_MS = 90_000; // 최대 90초
    const tick = async () => {
      if (Date.now() - startedAt > MAX_MS) {
        setPolling(false);
        toast.info("자동 확인 시간 초과. Telegram 에서 START 눌렀다면 \"연결 후 새로고침\" 버튼으로 확인하세요.");
        return;
      }
      const r = await getCurrentChatIdAction();
      if (r.chatId) {
        setTg(r.chatId);
        setPolling(false);
        toast.success("🎉 텔레그램 연결 완료!");
        return;
      }
      pollTimerRef.current = setTimeout(tick, 3000);
    };
    tick();
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [polling]);

  function save() {
    startTransition(async () => {
      const r = await saveChannelsAction({
        telegram_chat_id: tg.trim() || null,
        discord_webhook_url: dc.trim() || null,
        enable_d_grade_warn: eD,
        enable_losing_streak: eL,
        enable_ai_coach_done: eA,
        enable_daily_digest: eDig,
        analysis_alert_times: [...alertTimes].sort((a, b) => a - b),
      });
      if (r.error) toast.error(r.error);
      else toast.success("저장됨");
    });
  }

  function test() {
    startTransition(async () => {
      const r = await testNotifyAction();
      if (r.error) toast.error(r.error);
      else toast.success("테스트 발송 완료. 채널을 확인하세요.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>채널</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>텔레그램</Label>
          {tg ? (
            <div className="rounded-md border border-grade-a/30 bg-grade-a/5 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-grade-a font-semibold">✓ 연결됨</span>
                  <span className="ml-2 text-xs text-muted-foreground font-mono">
                    chat_id: {tg}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setTg("")}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  title="연결 해제 (저장해야 적용됨)"
                >
                  해제
                </button>
              </div>
            </div>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={pending || polling}
                onClick={() => {
                  startTransition(async () => {
                    const r = await createTelegramLinkAction();
                    if (r.error || !r.url) {
                      toast.error(r.error ?? "링크 생성 실패");
                      return;
                    }
                    // 새 창에서 Telegram 열기 (앱 또는 웹)
                    window.open(r.url, "_blank", "noopener,noreferrer");
                    toast.info(
                      "Telegram 에서 START 누르세요. 연결되면 자동으로 ✓ 연결됨 표시 (최대 90초).",
                      { duration: 6000 },
                    );
                    // 자동 폴링 시작 — chat_id 등록 감지 시 즉시 UI 갱신
                    setPolling(true);
                  });
                }}
              >
                {polling ? (
                  <>
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                    Telegram 에서 START 대기 중...
                  </>
                ) : (
                  "🤖 텔레그램 연결"
                )}
              </Button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const r = await getCurrentChatIdAction();
                    if (r.chatId) {
                      setTg(r.chatId);
                      toast.success("연결됐습니다.");
                    } else {
                      toast.info("아직 연결되지 않았습니다. Telegram 에서 START 눌러주세요.");
                    }
                  });
                }}
                className="ml-2 text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50"
              >
                연결 후 새로고침
              </button>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  직접 chat_id 입력
                </summary>
                <div className="mt-2">
                  <Input
                    value={tg}
                    onChange={(e) => setTg(e.target.value)}
                    placeholder="예: 123456789"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    이미 chat_id 를 아는 경우 직접 입력 가능. 저장 버튼 누르면 적용됩니다.
                  </p>
                </div>
              </details>
            </>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>디스코드 Webhook URL</Label>
          <Input
            value={dc}
            onChange={(e) => setDc(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
          />
          <p className="text-xs text-muted-foreground">
            디스코드 서버 설정 → 연동 → 웹훅에서 생성한 URL을 붙여 넣으세요.
          </p>
        </div>

        <div className="space-y-1 border-t border-border pt-4">
          <div className="text-sm font-semibold">이벤트</div>
          <Checkbox checked={eD} onChange={(e) => setED(e.target.checked)} label="D급 거래 저장 경고" />
          <Checkbox checked={eL} onChange={(e) => setEL(e.target.checked)} label="연속 손실 경고" />
          <Checkbox checked={eA} onChange={(e) => setEA(e.target.checked)} label="AI 복기 완료 알림" />
          <Checkbox
            checked={eDig}
            onChange={(e) => setEDig(e.target.checked)}
            label="일일 요약 (한국시간 09:00)"
          />
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <div className="text-sm font-semibold">🎯 분석 시간 알림</div>
          <p className="text-xs text-muted-foreground">
            선택한 시각(KST)에 “지금이 분석하기 좋은 시간” 알림을 보냅니다. 스타일에 맞는 시각을 고르세요. 선택 안 하면 발송하지 않습니다.
          </p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {ANALYSIS_ALERT_OPTIONS.map((o) => (
              <Checkbox
                key={o.min}
                checked={alertTimes.includes(o.min)}
                onChange={(e) =>
                  setAlertTimes((prev) =>
                    e.target.checked ? [...prev, o.min] : prev.filter((m) => m !== o.min),
                  )
                }
                label={`${o.time} · ${o.label}`}
              />
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            텔레그램·디스코드 채널이 연결돼 있어야 발송됩니다.
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={save} disabled={pending}>
            저장
          </Button>
          <Button variant="outline" onClick={test} disabled={pending}>
            테스트 발송
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
