import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";
import { sendDiscord, sendTelegram } from "@/lib/notify";

export type NotifyEvent =
  | "d_grade_warn"
  | "losing_streak"
  | "ai_coach_done"
  | "daily_digest"
  | "scenario_alert"
  | "analysis_timing"
  | "dca_value_zone"
  | "test";

const EVENT_TOGGLES: Record<NotifyEvent, keyof Channels | null> = {
  d_grade_warn: "enable_d_grade_warn",
  losing_streak: "enable_losing_streak",
  ai_coach_done: "enable_ai_coach_done",
  daily_digest: "enable_daily_digest",
  scenario_alert: null, // 시나리오 알림은 사용자가 명시적으로 watch=true 등록한 것만 → 토글 없이 항상 발송
  analysis_timing: null, // 분석 시간 알림은 cron이 사용자 선택 시각으로 필터 → 토글 없이 발송
  // 밸류존 알림은 사용자가 직접 만든 적립 플랜에 대해서만, 그것도 판정이 바뀔 때만
  // 나가므로 토글 없이 발송(빈도가 낮아 소음이 되지 않는다).
  dca_value_zone: null,
  test: null,
};

interface Channels {
  telegram_chat_id: string | null;
  discord_webhook_url: string | null;
  enable_d_grade_warn: boolean;
  enable_losing_streak: boolean;
  enable_ai_coach_done: boolean;
  enable_daily_digest: boolean;
}

export interface NotifyPayload {
  title: string;
  body: string;
  tradeId?: string;
  /** 임의 링크 (tradeId 대신 사용). 예: 분석 페이지로 유도. */
  link?: { url: string; label: string };
}

function buildMessage(p: NotifyPayload, channel: "telegram" | "discord") {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const link: { url: string; label: string } | null =
    p.link ?? (p.tradeId ? { url: `${appUrl}/app/journal/${p.tradeId}`, label: "저널 보기" } : null);
  if (channel === "telegram") {
    const linkLine = link ? `\n\n<a href="${link.url}">${link.label}</a>` : "";
    return `<b>${p.title}</b>\n\n${p.body}${linkLine}`;
  }
  const linkLine = link ? `\n\n${link.url}` : "";
  return `**${p.title}**\n\n${p.body}${linkLine}`;
}

export async function dispatch(userId: string, event: NotifyEvent, payload: NotifyPayload) {
  const svc = getSupabaseService();
  const { data: ch } = await svc
    .from("notification_channels")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle<Channels>();
  if (!ch) return;

  const toggleKey = EVENT_TOGGLES[event];
  if (toggleKey && !ch[toggleKey]) return;

  const logs: Array<{ channel: "telegram" | "discord"; status: "sent" | "error"; error?: string }> = [];

  if (ch.telegram_chat_id) {
    const r = await sendTelegram(ch.telegram_chat_id, buildMessage(payload, "telegram"));
    logs.push({ channel: "telegram", status: r.ok ? "sent" : "error", error: r.ok ? undefined : r.error });
  }
  if (ch.discord_webhook_url) {
    const r = await sendDiscord(ch.discord_webhook_url, buildMessage(payload, "discord"));
    logs.push({ channel: "discord", status: r.ok ? "sent" : "error", error: r.ok ? undefined : r.error });
  }

  if (logs.length === 0) return;
  await svc.from("notification_log").insert(
    logs.map((l) => ({
      user_id: userId,
      channel: l.channel,
      event,
      status: l.status,
      error: l.error ?? null,
    })),
  );
}
