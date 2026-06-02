"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseService } from "@/lib/supabase/service";
import { dispatch } from "@/lib/notify-dispatch";

interface Payload {
  telegram_chat_id: string | null;
  discord_webhook_url: string | null;
  enable_d_grade_warn: boolean;
  enable_losing_streak: boolean;
  enable_ai_coach_done: boolean;
  enable_daily_digest: boolean;
  analysis_alert_times: number[];
}

export async function saveChannelsAction(p: Payload): Promise<{ error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  if (p.discord_webhook_url && !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(p.discord_webhook_url))
    return { error: "디스코드 webhook URL 형식이 아닙니다." };

  const { error } = await supabase
    .from("notification_channels")
    .upsert({ user_id: user.id, ...p, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };

  revalidatePath("/app/settings/notify");
  return {};
}

/**
 * Telegram 자동 연결용 deep-link 코드 생성.
 * 클라이언트는 반환된 url 로 새 탭 열기 → Telegram 봇 채팅 자동 시작.
 */
export async function createTelegramLinkAction(): Promise<{
  url?: string;
  code?: string;
  expiresAt?: string;
  botUsername?: string;
  error?: string;
}> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername)
    return {
      error: "TELEGRAM_BOT_USERNAME 환경변수가 설정되지 않았습니다. 운영자에게 문의하세요.",
    };

  // 16자 base32 코드 (URL-safe)
  const code = randomBytes(10).toString("base64url");
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();

  const svc = getSupabaseService();
  const { error } = await svc.from("telegram_link_codes").insert({
    user_id: user.id,
    code,
    expires_at: expiresAt,
  });
  if (error) return { error: error.message };

  const cleanBot = botUsername.replace(/^@/, "");
  const url = `https://t.me/${cleanBot}?start=${code}`;
  return { url, code, expiresAt, botUsername: cleanBot };
}

/**
 * 현재 연결된 telegram_chat_id 조회 (UI 상태 새로고침용).
 */
export async function getCurrentChatIdAction(): Promise<{
  chatId?: string | null;
  error?: string;
}> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data } = await supabase
    .from("notification_channels")
    .select("telegram_chat_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return { chatId: data?.telegram_chat_id ?? null };
}

export async function testNotifyAction(): Promise<{ error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  await dispatch(user.id, "test", {
    title: "Alpha Gate 테스트 알림",
    body: "이 메시지가 보이면 알림 채널 설정이 정상입니다.",
  });
  return {};
}
