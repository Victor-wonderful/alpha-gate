import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * Telegram Bot webhook.
 *
 * 동작:
 * - POST 본문은 Telegram update.
 * - /start <code> 메시지 처리: code 로 user_id 찾아 chat_id 저장 → "연결 완료" 회신.
 * - /start (코드 없음): chat_id 알려주는 안내 메시지 회신.
 * - 그 외 메시지: 무시.
 *
 * 보안: setWebhook 시 secret_token 등록 → 매 요청 헤더 X-Telegram-Bot-Api-Secret-Token 검증.
 */
export async function POST(req: NextRequest) {
  // 1) 보안 검증
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== secret)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) Telegram update 파싱
  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const msg = update.message;
  if (!msg?.text || !msg.chat?.id) return NextResponse.json({ ok: true });

  const chatId = String(msg.chat.id);
  const text = msg.text.trim();

  try {
    // /start <code> — deep-link 연결
    const startMatch = text.match(/^\/start(?:\s+(\S+))?$/);
    if (startMatch) {
      const code = startMatch[1];
      if (code) {
        await handleLink(code, chatId);
      } else {
        // 코드 없는 /start — chat_id 알려주는 안내
        await sendMessage(
          chatId,
          `👋 알파게이트 알림 봇입니다.\n\n당신의 chat_id: <code>${chatId}</code>\n\n자동 연결을 원하시면 알파게이트 알림 설정 페이지에서 "텔레그램 연결" 버튼을 사용하세요.`,
          "HTML",
        );
      }
    }
  } catch (e) {
    console.error("[telegram/webhook] handler error", e);
  }

  // Telegram 은 200 응답만 받으면 됨 (자세한 에러 노출 X)
  return NextResponse.json({ ok: true });
}

async function handleLink(code: string, chatId: string) {
  const svc = getSupabaseService();
  // 코드 조회 (미사용 + 만료 안 됨)
  const { data: link } = await svc
    .from("telegram_link_codes")
    .select("id, user_id, expires_at, used_at")
    .eq("code", code)
    .maybeSingle();

  if (!link) {
    await sendMessage(chatId, "❌ 알 수 없는 연결 코드입니다.\n알파게이트에서 다시 \"텔레그램 연결\"을 시도하세요.");
    return;
  }
  if (link.used_at) {
    await sendMessage(chatId, "⚠️ 이미 사용된 코드입니다.\n알파게이트에서 다시 \"텔레그램 연결\"을 시도하세요.");
    return;
  }
  if (new Date(link.expires_at).getTime() < Date.now()) {
    await sendMessage(chatId, "⚠️ 만료된 코드입니다 (15분 초과).\n알파게이트에서 다시 \"텔레그램 연결\"을 시도하세요.");
    return;
  }

  // upsert notification_channels — 기존 row 있으면 chat_id 갱신
  const { data: existing } = await svc
    .from("notification_channels")
    .select("user_id")
    .eq("user_id", link.user_id)
    .maybeSingle();

  if (existing) {
    await svc
      .from("notification_channels")
      .update({ telegram_chat_id: chatId })
      .eq("user_id", link.user_id);
  } else {
    await svc.from("notification_channels").insert({
      user_id: link.user_id,
      telegram_chat_id: chatId,
    });
  }

  // 코드 사용 처리
  await svc
    .from("telegram_link_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", link.id);

  await sendMessage(
    chatId,
    "✅ 알파게이트 알림 채널 연결 완료!\n\n이제 분석 결과 페이지에서 🔔 알림 등록한 시나리오의 가격 도달 알림이 이 채팅으로 옵니다.",
  );
}

async function sendMessage(chatId: string, text: string, parseMode?: "HTML" | "Markdown") {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("[telegram/webhook] sendMessage failed", e);
  }
}

interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number | string };
  };
}
