import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseService } from "@/lib/supabase/service";
import { dispatch } from "@/lib/notify-dispatch";
import { getAnalysisAlertOptions } from "@/lib/analysis/sessions";
import { createTranslator, getCatalog } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

/**
 * 분석 시간 알림 — 사용자가 고른 KST 시각에 "지금 분석하기 좋은 시간" 텔레그램/디스코드 발송.
 * 10분마다 실행되는 cron. 현재 KST 시각이 알림 슬롯(발화 후 10분 캐치)과 맞으면, 그 시각을 선택한 사용자에게 발송.
 * 중복 방지: 최근 15분 내 analysis_timing 발송 이력이 있으면 skip.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 백그라운드 cron — 사용자 로케일이 없으므로 알림은 한국어 고정.
  const t = createTranslator(getCatalog("ko"));
  const alertOptions = getAnalysisAlertOptions(t);

  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const nowMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();

  // 현재 시각과 매칭되는 알림 슬롯 (발화 후 10분 이내)
  const matchedMins = new Set(
    alertOptions.filter((o) => {
      const diff = (nowMin - o.min + 1440) % 1440;
      return diff <= 9;
    }).map((o) => o.min),
  );
  if (matchedMins.size === 0) return NextResponse.json({ sent: 0, reason: "no slot" });

  const svc = getSupabaseService();
  const { data: users } = await svc
    .from("notification_channels")
    .select("user_id, analysis_alert_times, telegram_chat_id, discord_webhook_url");

  if (!users?.length) return NextResponse.json({ sent: 0 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const sinceIso = new Date(Date.now() - 15 * 60_000).toISOString();

  let sent = 0;
  for (const u of users) {
    const times: number[] = (u.analysis_alert_times as number[] | null) ?? [];
    const hit = times.find((m) => matchedMins.has(m));
    if (hit === undefined) continue;
    if (!u.telegram_chat_id && !u.discord_webhook_url) continue;

    // 중복 방지 — 최근 15분 내 발송 이력
    const { count } = await svc
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", u.user_id)
      .eq("event", "analysis_timing")
      .eq("status", "sent")
      .gte("sent_at", sinceIso);
    if (count && count > 0) continue;

    const opt = alertOptions.find((o) => o.min === hit)!;
    await dispatch(u.user_id, "analysis_timing", {
      title: "🎯 지금이 분석하기 좋은 시간",
      body: `${opt.time} KST · ${opt.label}\n\n관심 코인을 점검해 보세요.`,
      link: { url: `${appUrl}/app/analyze`, label: "분석하러 가기" },
    });
    sent += 1;
  }

  return NextResponse.json({ sent, slots: [...matchedMins] });
}
