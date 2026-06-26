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
import { getAnalysisAlertOptions } from "@/lib/analysis/sessions";
import { useT } from "@/lib/i18n/context";

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
  const t = useT();
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
        toast.info(t("settings.notify.tg.pollTimeout"));
        return;
      }
      const r = await getCurrentChatIdAction();
      if (r.chatId) {
        setTg(r.chatId);
        setPolling(false);
        toast.success(t("settings.notify.tg.connectedToast"));
        return;
      }
      pollTimerRef.current = setTimeout(tick, 3000);
    };
    tick();
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [polling, t]);

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
      else toast.success(t("settings.notify.savedToast"));
    });
  }

  function test() {
    startTransition(async () => {
      const r = await testNotifyAction();
      if (r.error) toast.error(r.error);
      else toast.success(t("settings.notify.testSentToast"));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.notify.channels")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>{t("settings.notify.telegram")}</Label>
          {tg ? (
            <div className="rounded-md border border-grade-a/30 bg-grade-a/5 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-grade-a font-semibold">{t("settings.notify.tg.connected")}</span>
                  <span className="ml-2 text-xs text-muted-foreground font-mono">
                    chat_id: {tg}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setTg("")}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  title={t("settings.notify.tg.disconnectTitle")}
                >
                  {t("settings.notify.tg.disconnect")}
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
                      toast.error(r.error ?? t("settings.notify.tg.linkFailed"));
                      return;
                    }
                    // 새 창에서 Telegram 열기 (앱 또는 웹)
                    window.open(r.url, "_blank", "noopener,noreferrer");
                    toast.info(
                      t("settings.notify.tg.startPrompt"),
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
                    {t("settings.notify.tg.waiting")}
                  </>
                ) : (
                  t("settings.notify.tg.connectBtn")
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
                      toast.success(t("settings.notify.tg.connectedShort"));
                    } else {
                      toast.info(t("settings.notify.tg.notYet"));
                    }
                  });
                }}
                className="ml-2 text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50"
              >
                {t("settings.notify.tg.refreshAfter")}
              </button>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  {t("settings.notify.tg.manualSummary")}
                </summary>
                <div className="mt-2">
                  <Input
                    value={tg}
                    onChange={(e) => setTg(e.target.value)}
                    placeholder={t("settings.notify.tg.chatIdPlaceholder")}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("settings.notify.tg.manualHint")}
                  </p>
                </div>
              </details>
            </>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>{t("settings.notify.discordLabel")}</Label>
          <Input
            value={dc}
            onChange={(e) => setDc(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
          />
          <p className="text-xs text-muted-foreground">
            {t("settings.notify.discordHint")}
          </p>
        </div>

        <div className="space-y-1 border-t border-border pt-4">
          <div className="text-sm font-semibold">{t("settings.notify.events")}</div>
          <Checkbox checked={eD} onChange={(e) => setED(e.target.checked)} label={t("settings.notify.evt.dGrade")} />
          <Checkbox checked={eL} onChange={(e) => setEL(e.target.checked)} label={t("settings.notify.evt.losingStreak")} />
          <Checkbox checked={eA} onChange={(e) => setEA(e.target.checked)} label={t("settings.notify.evt.aiCoach")} />
          <Checkbox
            checked={eDig}
            onChange={(e) => setEDig(e.target.checked)}
            label={t("settings.notify.evt.dailyDigest")}
          />
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <div className="text-sm font-semibold">{t("settings.notify.analysisAlertTitle")}</div>
          <p className="text-xs text-muted-foreground">
            {t("settings.notify.analysisAlertHint")}
          </p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {getAnalysisAlertOptions(t).map((o) => (
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
            {t("settings.notify.analysisAlertFootnote")}
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={save} disabled={pending}>
            {t("common.save")}
          </Button>
          <Button variant="outline" onClick={test} disabled={pending}>
            {t("settings.notify.testSend")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
