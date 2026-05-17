"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { saveChannelsAction, testNotifyAction } from "./_actions";

type Initial = {
  telegram_chat_id?: string | null;
  discord_webhook_url?: string | null;
  enable_d_grade_warn?: boolean;
  enable_losing_streak?: boolean;
  enable_ai_coach_done?: boolean;
  enable_daily_digest?: boolean;
} | null;

export function NotifyForm({ initial }: { initial: Initial }) {
  const [pending, startTransition] = useTransition();
  const [tg, setTg] = useState(initial?.telegram_chat_id ?? "");
  const [dc, setDc] = useState(initial?.discord_webhook_url ?? "");
  const [eD, setED] = useState(initial?.enable_d_grade_warn ?? true);
  const [eL, setEL] = useState(initial?.enable_losing_streak ?? true);
  const [eA, setEA] = useState(initial?.enable_ai_coach_done ?? true);
  const [eDig, setEDig] = useState(initial?.enable_daily_digest ?? false);

  function save() {
    startTransition(async () => {
      const r = await saveChannelsAction({
        telegram_chat_id: tg.trim() || null,
        discord_webhook_url: dc.trim() || null,
        enable_d_grade_warn: eD,
        enable_losing_streak: eL,
        enable_ai_coach_done: eA,
        enable_daily_digest: eDig,
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
        <div className="space-y-1.5">
          <Label>텔레그램 chat ID</Label>
          <Input value={tg} onChange={(e) => setTg(e.target.value)} placeholder="예: 123456789" />
          <p className="text-xs text-muted-foreground">
            텔레그램에서 봇과 대화를 시작한 뒤 chat_id를 입력하세요.
          </p>
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
