"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { dispatch } from "@/lib/notify-dispatch";

interface Payload {
  telegram_chat_id: string | null;
  discord_webhook_url: string | null;
  enable_d_grade_warn: boolean;
  enable_losing_streak: boolean;
  enable_ai_coach_done: boolean;
  enable_daily_digest: boolean;
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
