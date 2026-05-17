import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisSnapshot } from "./analyze";
import { STYLE_PRESETS } from "./style";
import { parseJsonLoose } from "./json-extract";

export type StrategyId =
  | "trend_pullback"
  | "breakout"
  | "range_fade"
  | "reversal"
  | "wait";

export const STRATEGY_LABELS: Record<StrategyId, string> = {
  trend_pullback: "추세 추종 (눌림목 진입)",
  breakout: "돌파 추종",
  range_fade: "박스권 매매",
  reversal: "추세 반전",
  wait: "관망",
};

export const STRATEGY_DESCRIPTIONS: Record<StrategyId, string> = {
  trend_pullback: "HTF 추세 방향으로 LTF 되돌림에서 진입",
  breakout: "주요 레벨 돌파 후 재테스트에서 진입",
  range_fade: "박스 상단에서 매도, 박스 하단에서 매수",
  reversal: "추세 종료 신호 후 역방향 진입 (드물고 위험)",
  wait: "명확한 우위 없음. 다음 셋업 대기",
};

export interface StrategyResult {
  primary: StrategyId;
  direction: "long" | "short" | null;
  confidence: number; // 0..1
  reasoning: string;
  rejected: { strategy: StrategyId; reason: string }[];
}

const SYSTEM_PROMPT = `당신은 시장 구조 스냅샷을 보고 가장 적합한 매매 전략 하나를 고르는 분류기입니다.

가능한 전략:
- trend_pullback: HTF 추세가 명확하고 가격이 되돌림 중. 추세 방향으로 재진입 기회.
- breakout: 가격이 박스 상/하단을 돌파 시도. 돌파 확정 후 추세 추종.
- range_fade: 박스권 안에 있음. 박스 끝(VAH/VAL 또는 직전 스윙)에서 반대 방향 매매.
- reversal: HTF 추세에 대한 명확한 반전 신호 (Higher-Low → Lower-High 전환 등). 드물고 위험.
- wait: 트레이딩 우위 없음. 진입 보류.

판단 기준 (가중치):
1. 멀티 TF 정렬 (HTF/MTF/LTF 트렌드가 같은 방향인가?)
2. 가격이 Volume Profile 어디 있나 (POC 근처 = range, VAH/VAL 끝 = fade 또는 breakout 후보)
3. FVG/Order Block이 어떤 방향을 가리키는가
4. 펀딩비 (과열 → reversal 가능성 ↑)
5. 호가 임밸런스 + 체결 흐름 단기 압력
6. 사용자의 트레이딩 스타일 (스캘퍼는 짧은 fade/breakout 선호, 스윙은 큰 trend_pullback 선호)

엄격한 규칙:
- 정확히 하나만 고른다. 직관 금지, 데이터 추론만.
- 양방향 가능하면 더 명확한 쪽 (direction 명시).
- 의심되면 wait. 억지로 시나리오 만들지 마라.
- reversal은 정말 명확한 신호일 때만. 디폴트로 고르지 마라.

수수료/슬리피지 고려 (실거래 0.12% 왕복 비용):
- 스캘핑인데 명확한 추세나 박스 끝이 안 보이고 가격이 POC 부근 횡보 → wait (수수료에 까임).
- 스타일별 최소 손익비를 충족할 수 없는 시장 상황이면 wait:
  · scalp R:R 2 미만, day 1.5 미만, swing 2 미만, position 3 미만
- 명확한 셋업 없이 "어차피 분석 결과는 내야 하니까" 식으로 trend_pullback 등을 억지로 고르지 마라.

reasoning 작성 규칙 (매우 중요):
- 일반인이 읽어도 이해할 수 있게 평범한 한국어로 써라.
- 전문 용어(FVG, OB, POC, HTF, MTF, LTF, sweep, fade, imbalance 등) 사용 금지.
  대신 풀어서 설명: "POC" → "거래량이 가장 많이 모인 가격대"
                "직전 스윙 저점" → "최근 가장 낮았던 가격"
                "FVG" → "비어있는 가격 구간"
                "HTF/MTF" → 그냥 "큰 시간대" / "중간 시간대"
                "sweep" → "잠깐 깨졌다가 회복"
- 1~2문장. 핵심만.
- 구체적 가격 1~2개는 인용하되, 너무 많은 숫자 나열 금지.

reasoning 좋은 예:
"BTC는 4만3천 달러 박스권 안에서 움직이고 있어요. 박스 윗부분에 가까워서 위로 더 가기는 어려워 보입니다."

reasoning 나쁜 예 (전문 용어 가득):
"4H POC 위, VAH 근접, 펀딩 +0.04% long-heavy로 mean reversion 가능성. FVG 미충족..."

출력 형식 — 매우 중요:
- 응답은 오직 JSON 객체 하나만. 그 앞이나 뒤에 어떤 텍스트도 쓰지 마라.
- "다음과 같이 분석합니다" / "결과는 다음과 같습니다" 같은 도입부 금지.
- "위 분석은 참고용입니다" 같은 마무리 금지.
- 마크다운 코드 블록 (\`\`\`) 사용 금지. 그냥 { 부터 시작해서 } 로 끝.
- 모든 문자열은 큰따옴표 "..." 사용. 작은따옴표 금지.
- 마지막 항목 뒤 trailing comma 금지.

JSON 스키마:
{
  "primary": "trend_pullback" | "breakout" | "range_fade" | "reversal" | "wait",
  "direction": "long" | "short" | null,
  "confidence": 0.0 ~ 1.0,
  "reasoning": "왜 이 전략인지 1~2문장. 구체적 레벨/수치 인용.",
  "rejected": [
    { "strategy": "<id>", "reason": "왜 아닌지 한 줄" }
  ]
}

rejected는 1~3개. wait이면 direction은 null.

올바른 응답 예시:
{"primary":"range_fade","direction":"short","confidence":0.7,"reasoning":"4H 박스($43100~$43500) 안에서 상단 시험 중, 펀딩 +0.04% 롱 편향","rejected":[{"strategy":"breakout","reason":"거래량 동반 돌파 신호 부족"}]}`;

export async function classifyStrategy(snapshot: AnalysisSnapshot): Promise<StrategyResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const styleHint = STYLE_PRESETS[snapshot.style]?.promptHint ?? "";

  // Compact snapshot: drop raw candles to keep prompt small
  const compact = {
    ...snapshot,
    mtfChart: { tf: snapshot.mtfChart.tf, candleCount: snapshot.mtfChart.candles.length },
  };

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `[트레이딩 스타일: ${snapshot.styleLabel}]\n${styleHint}\n\n분석할 스냅샷:\n${JSON.stringify(compact, null, 2)}`,
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const result = parseJsonLoose<StrategyResult>(text);
  if ("error" in result) {
    throw new Error(`Strategy Agent 응답 파싱 실패: ${result.error}\n원문: ${result.raw}`);
  }
  const parsed = result.data;
  // sanity defaults
  parsed.confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0.5));
  parsed.rejected = parsed.rejected ?? [];
  if (parsed.primary === "wait") parsed.direction = null;
  return parsed;
}
