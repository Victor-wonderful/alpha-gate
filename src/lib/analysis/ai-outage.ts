import { sendTelegram } from "@/lib/notify";

/**
 * AI 리서치 장애 감지 + 운영자 알림.
 * 목적: 플랫폼(운영자)의 Anthropic 계정 잔액 소진/한도 초과로 전 사용자 분석이 실패할 때,
 * 구독자에게 정직한 메시지를 주고 운영자에게 즉시 텔레그램 알림을 보낸다.
 * (근본 예방은 Anthropic Console의 Auto-reload — 이건 코드가 아니라 계정 설정.)
 */

export type AiOutageKind = "billing" | "rate_limit" | "overloaded" | "server";

const OUTAGE_LABEL: Record<AiOutageKind, string> = {
  billing: "Anthropic 잔액 부족 (billing)",
  rate_limit: "Anthropic API 레이트리밋 (429)",
  overloaded: "Anthropic 과부하 (529)",
  server: "Anthropic 서버 오류 (5xx)",
};

/**
 * 에러를 "시스템 장애(운영자 개입 필요)"로 분류. null = 일반 실패(파싱 등, 우리쪽 문제).
 * HTTP status가 있는 에러(= 실제 API 응답)만 장애로 본다. 우리가 던지는 파싱 실패는 status가 없어 제외.
 */
export function classifyAiOutage(e: unknown): AiOutageKind | null {
  const status = (e as { status?: unknown })?.status;
  if (typeof status !== "number") return null; // 파싱 실패 등 → 일반 실패
  const msg = e instanceof Error ? e.message.toLowerCase() : "";
  if (status === 400 && /credit|balance|billing|quota|insufficient/.test(msg)) return "billing";
  if (status === 429) return "rate_limit";
  if (status === 529 || /overloaded/.test(msg)) return "overloaded";
  if (status >= 500) return "server";
  return null; // 기타 400 등은 일반 실패로 처리
}

/** 구독자에게 보여줄 메시지 — 재시도 유도 대신 운영 이슈임을 정직하게. */
export function outageUserMessage(kind: AiOutageKind): string {
  if (kind === "rate_limit" || kind === "overloaded")
    return "지금 AI 리서치 요청이 몰려 일시적으로 지연되고 있습니다. 잠시 후 다시 시도해 주세요.";
  // billing / server → 운영 개입 필요
  return "AI 리서치 서비스가 일시적으로 중단되었습니다. 운영자에게 자동 알림이 전송되었으며 곧 복구됩니다.";
}

// 운영자 알림 스로틀 — 인메모리(서버리스 인스턴스별). 장애 중 텔레그램 스팸 방지 best-effort.
const lastAlertAt: Partial<Record<AiOutageKind, number>> = {};
const ALERT_THROTTLE_MS = 10 * 60_000; // 10분

/** 운영자(플랫폼)에게 AI 장애 알림. OPERATOR_TELEGRAM_CHAT_ID 설정 시에만 발송. */
export async function alertOperatorAiOutage(
  kind: AiOutageKind,
  detail: string,
  nowMs: number,
): Promise<void> {
  const chatId = process.env.OPERATOR_TELEGRAM_CHAT_ID;
  if (!chatId) return;
  const prev = lastAlertAt[kind];
  if (prev && nowMs - prev < ALERT_THROTTLE_MS) return; // 스로틀
  lastAlertAt[kind] = nowMs;
  const text =
    `⚠️ <b>AI 리서치 장애</b>\n` +
    `종류: ${OUTAGE_LABEL[kind]}\n` +
    `상세: ${detail.slice(0, 200)}\n\n` +
    `구독자 분석이 실패 중입니다. Anthropic Console에서 잔액·한도를 확인하세요.`;
  try {
    await sendTelegram(chatId, text);
  } catch {
    /* 알림 실패는 삼킴 — 분석 흐름에 영향 없음 */
  }
}
