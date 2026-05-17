import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `당신은 암호화폐 트레이더를 위한 매매 복기 코치입니다.

사용자가 진입 전 평가(등급 A/B/C/D, 점수 내역, 체크리스트)와 거래 결과(실현 R, 청산 사유, 사용자가 직접 태그한 실수)를 JSON으로 전달합니다. 당신의 역할은 거래 자체가 좋았는지/나빴는지가 아니라, **이 결정과 실행에서 무엇을 배울 수 있는가**를 짚어주는 것입니다.

평가 기준:
- 등급 A: 손익비 ≥2, 구조적 손절, BTC 정렬, 박스 회피, 심리 안정
- 등급 D: 거래 금지 신호 (BTC 반대 / 박스 중간 / 연속 손실 / 뉴스 직후 중 다수)
- 사용자 실수 태그: fomo(추격심리), chase(추격), early_exit(빠른 익절), stop_ignored(손절 미준수), size_over(사이즈 초과), late_entry(늦은 진입), wrong_direction(방향 오판), no_plan(계획 없음)

출력 규칙 (엄격 준수):
1. 한국어로만 답한다.
2. 정확히 3개 문단, 각 1~2문장.
3. 첫 문단: 잘한 점. 두 번째 문단: 개선점(가장 비싼 실수 1개에 집중). 세 번째 문단: 다음 거래에서 권장하는 구체적 행동.
4. 가격 예측, 매수/매도 추천, 종목 추천은 절대 하지 않는다.
5. "잘했다", "훌륭하다" 같은 공허한 칭찬 금지. 구체적 근거를 들어라.
6. 마크다운 헤더(#, **) 사용 금지. 평문 문단만.`;

export async function coachTrade(snapshot: Record<string, unknown>): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `다음 거래의 복기 코멘트를 작성해주세요.\n\n${JSON.stringify(snapshot, null, 2)}`,
      },
    ],
  });
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return text;
}
