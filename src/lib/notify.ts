type NotifyResult = { ok: true } | { ok: false; error: string };

export async function sendTelegram(chatId: string, text: string): Promise<NotifyResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN missing" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!res.ok) return { ok: false, error: `telegram ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "telegram failed" };
  }
}

export async function sendDiscord(webhookUrl: string, text: string): Promise<NotifyResult> {
  if (!webhookUrl.startsWith("https://discord.com/api/webhooks/") && !webhookUrl.startsWith("https://discordapp.com/api/webhooks/"))
    return { ok: false, error: "invalid discord webhook url" };
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    if (!res.ok) return { ok: false, error: `discord ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "discord failed" };
  }
}
