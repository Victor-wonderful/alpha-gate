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
4. 펀딩비 + fundingHistory.trend (과열·군집 → reversal 가능성 ↑)
5. 호가 임밸런스 + 체결 흐름 단기 압력
6. ATR (변동성 적정 — 너무 낮으면 stale 시장)
7. VWAP 대비 위치 (단기 편향)
8. topTraderRatio (큰손 군집)
9. basis premiumPct (현물·선물 괴리, squeeze 신호)
10. oiDelta (신규 진입 / 청산 흐름)
11. macro.dxy / macro.fearGreed (거시 + 심리)
12. session (변동성 시간대)
13. 사용자의 트레이딩 스타일 (스캘퍼는 짧은 fade/breakout 선호, 스윙은 큰 trend_pullback 선호)

★ 시장 상태 기반 강제 플레이북 (이 규칙이 모든 판단보다 우선):

스냅샷의 trendMetrics.classification 값을 먼저 보고 거기서 출발한다:

- classification = "up" (상승 추세 합의):
  · 기본 선택: primary="trend_pullback", direction="long"
  · 예외: 가격이 직전 스윙 고점을 명확히 깨고 청산 흐름이면 reversal short 검토
  · "wait" 절대 금지 — 추세가 잡혀있으면 눌림목 진입이 정석

- classification = "down" (하락 추세 합의):
  · 기본 선택: primary="trend_pullback", direction="short"
  · 예외: 강한 매수 흐름 + 스윙 저점 반등이면 reversal long 검토
  · "wait" 절대 금지

- classification = "range" (횡보 합의):
  · 기본 선택: primary="range_fade", direction=null (양방향 가능 — Scenario Generator가 박스 상하단 모두 시나리오 생성)
  · 박스 한쪽 끝에 가까우면 그 방향 fade(반대방향 진입) 우선
  · 박스 돌파 임박(거래량 동반 + OI 증가)이면 breakout 검토
  · "wait" 절대 금지 — 횡보장은 양 끝에서 매매가 정상

- classification = "mixed" (혼조 — 지표 의견 갈림):
  · 가격이 명확한 키레벨(POC/VAH/VAL/직전 스윙) 근처면 range_fade
  · 그렇지 않으면 wait 허용

엄격한 규칙:
- 정확히 하나만 고른다. 데이터 추론만.
- 위 플레이북을 따른 뒤, direction은 추가 신호로 다시 확정 (펀딩, OI, 호가, 흐름).
- reversal은 명확한 반전 신호일 때만.

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
