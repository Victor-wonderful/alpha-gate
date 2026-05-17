import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";
import { sendDiscord, sendTelegram } from "@/lib/notify";

export type NotifyEvent = "d_grade_warn" | "losing_streak" | "ai_coach_done" | "daily_digest" | "test";

const EVENT_TOGGLES: Record<NotifyEvent, keyof Channels | null> = {
  d_grade_warn: "enable_d_grade_warn",
  losing_streak: "enable_losing_streak",
  ai_coach_done: "enable_ai_coach_done",
  daily_digest: "enable_daily_digest",
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
}

function buildMessage(p: NotifyPayload, channel: "telegram" | "discord") {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const link = p.tradeId ? `${appUrl}/app/journal/${p.tradeId}` : null;
  if (channel === "telegram") {
    const linkLine = link ? `\n\n<a href="${link}">저널 보기</a>` : "";
    return `<b>${p.title}</b>\n\n${p.body}${linkLine}`;
  }
  const linkLine = link ? `\n\n${link}` : "";
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
