import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisSnapshot } from "./analyze";
import { STYLE_PRESETS, type TradingStyle } from "./style";
import { parseJsonLoose } from "./json-extract";
import { isStrategyEligible, regimeDefaultStrategy, routeStrategy } from "./eligibility";
import type { Locale } from "@/lib/i18n/config";

export type StrategyId =
  | "trend_pullback"
  | "breakout"
  | "range_fade"
  | "reversal"
  | "liquidity_grab"
  | "funding_squeeze"
  | "session_open_drive"
  | "wait";

export const STRATEGY_LABELS: Record<StrategyId, string> = {
  trend_pullback: "추세 추종 (눌림목 진입)",
  breakout: "돌파 추종",
  range_fade: "박스권 매매",
  reversal: "추세 반전",
  liquidity_grab: "유동성 사냥 (스윕 후 진입)",
  funding_squeeze: "펀딩 압착 (군집 청산 노림)",
  session_open_drive: "세션 개장 추세",
  wait: "관망",
};

export const STRATEGY_DESCRIPTIONS: Record<StrategyId, string> = {
  trend_pullback: "HTF 추세 방향으로 LTF 되돌림에서 진입",
  breakout: "주요 레벨 돌파 후 재테스트에서 진입",
  range_fade: "박스 상단에서 매도, 박스 하단에서 매수",
  reversal: "추세 종료 신호 후 역방향 진입 (드물고 위험)",
  liquidity_grab: "스윙 고/저점을 잠깐 깨고 회복 → 반대 방향 진입 (ICT/SMC)",
  funding_squeeze: "펀딩비 극단 + OI 급증으로 한쪽 군집 → 강제 청산 반대 진입",
  session_open_drive: "미국 개장 첫 30분 추세 잡힘 → 그 방향 추종 (데이트레이딩)",
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
- liquidity_grab: 직전 스윙 고/저점을 잠깐 깨고 즉시 회복 (sweep). 손절 청산을 노린 큰손 진입의 흔적 → 반대 방향 진입. snapshot.liquiditySweeps 배열에 최근 sweep이 감지되어 있어야 가능. R:R 매우 좋음(3+).
- funding_squeeze: 펀딩비 극단(절댓값 ≥0.04%) + 펀딩 트렌드 지속 + OI 24h 변화 큼(±15% 이상) → 한쪽 포지션 군집. 강제 청산 캐스케이드 노려 반대 방향 진입. snapshot.fundingSqueeze가 active일 때만 가능. 손절 짧고 시간 한도 짧음.
- session_open_drive: 미국 개장 직후 첫 30~60분(22:30~23:30 KST = 13:30~14:30 UTC). 첫 30분 캔들 종가가 시가 대비 강한 방향(±0.4% 이상) + 거래량 평균 이상이면 그 방향 추종. snapshot.session.current가 "US"이고 minutesIntoSession이 60 미만일 때만 가능.
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
  · 기본 선택: primary="breakout", direction=null (박스 돌파 = 새 추세의 시작 → 돌파를 노린다)
  · ★ 백테스트 검증: 횡보장 "박스 끝 페이드(range_fade)"는 손실(박스가 자주 깨짐), "돌파(breakout)"는 +. 그래서 횡보 기본은 돌파.
  · range_fade는 비추 — 박스가 매우 명확하고 양 끝 반복이 또렷할 때만 보조로 검토.
  · "wait" 절대 금지 — 항상 거래 셋업을 낸다(돌파 대기).

- classification = "mixed" (혼조 — 지표 의견 갈림):
  · 기본 선택: primary="breakout" (방향 불명확 시 돌파 대기로 새 추세를 노림)
  · range_fade는 비추(손실 검증). "wait" 금지 — 항상 셋업 제시.
  · ★ 단, snapshot.symbol이 "BTCUSDT"이면 wait 금지 — 가장 가까운 구조로 방향을 잡아라(기준 자산, 항상 분석 가능해야 함).

★ 특수 전략 우선 트리거 (위 분류보다 먼저 검사):

이 3개는 특정 신호가 데이터에 명확히 떠 있을 때만 선택 가능. 신호 없으면 절대 고르지 마라.

1) liquidity_grab — snapshot.liquiditySweeps 배열을 본다:
   · 최근 5봉 이내 sweep이 1개 이상 존재 (recoveredWithinBars ≤ 3) → 강력 후보
   · sweep된 방향과 회복 방향이 명확:
     - 고점 sweep + 봉 종가가 sweep 가격 아래로 회복 → 숏 (short)
     - 저점 sweep + 봉 종가가 sweep 가격 위로 회복 → 롱 (long)
   · 우선순위: trend_pullback과 동일 방향이면 trend_pullback 유지. 반대 방향이면 liquidity_grab이 이김 (반전 신호 우선).

2) funding_squeeze — snapshot.fundingSqueeze 객체를 본다:
   · fundingSqueeze.active가 true일 때만 가능
   · fundingSqueeze.direction이 "long"이면 롱 군집 → 숏 진입 (short)
   · fundingSqueeze.direction이 "short"이면 숏 군집 → 롱 진입 (long)
   · classification이 "up"이어도 강한 funding_squeeze (정도 ≥0.7) 신호면 funding_squeeze가 이김
   · confidence는 fundingSqueeze.intensity를 그대로 사용 (0~1)

3) session_open_drive — snapshot.session을 본다:
   · session.current === "US" AND minutesIntoSession ≤ 60일 때만 가능
   · LTF 첫 30분 캔들 (mtfChart.byRole.LTF.candles 마지막 1~2봉) 종가가 시가 대비 ±0.4% 이상 + 거래량 직전 평균 ≥150%
   · 그 방향으로 long/short. 추세 분류와 정렬되면 더 강함
   · 스타일이 scalp/day일 때만 의미 있음. swing/position이면 이 전략 무시하고 일반 분류로 가라

엄격한 규칙:
- 정확히 하나만 고른다. 데이터 추론만.
- 위 특수 전략 트리거를 먼저 검사 → 발동 신호 없으면 trendMetrics.classification 플레이북으로.
- reversal은 명확한 반전 신호일 때만. liquidity_grab과 reversal이 둘 다 가능하면 liquidity_grab 선호 (트리거가 더 명확).
- 특수 전략 3개는 신호 없을 때 절대 선택 금지. 데이터 없는데 고르면 "wait"보다 나쁘다.

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
  "primary": "trend_pullback" | "breakout" | "range_fade" | "reversal" | "liquidity_grab" | "funding_squeeze" | "session_open_drive" | "wait",
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

// 영어 응답 강제 — system 프롬프트(캐시됨)는 한국어로 두고, user 메시지 끝에 덧붙여
// 캐시를 깨지 않으면서 언어만 오버라이드한다. (en일 때만 추가)
const EN_LANG_OVERRIDE = `

=== LANGUAGE OVERRIDE (highest priority) ===
Ignore any instruction above to answer in Korean. Write every natural-language string value (e.g. "reasoning") in clear, plain English for a general audience — no jargon. Keep all JSON keys and enum values (primary, direction, etc.) exactly as specified. Output only the JSON object, nothing else.`;

export async function classifyStrategy(
  snapshot: AnalysisSnapshot,
  locale: Locale = "ko",
): Promise<StrategyResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const styleHint = STYLE_PRESETS[snapshot.style]?.promptHint ?? "";

  // Compact snapshot: drop raw candles to keep prompt small
  const compact = {
    ...snapshot,
    mtfChart: { tf: snapshot.mtfChart.tf, candleCount: snapshot.mtfChart.candles.length },
  };

  const userContent = `[트레이딩 스타일: ${snapshot.styleLabel}]\n${styleHint}\n\n분석할 스냅샷:\n${JSON.stringify(compact, null, 2)}${locale === "en" ? EN_LANG_OVERRIDE : ""}`;

  // LLM이 가끔 산문/잘린 JSON을 반환 → 파싱 실패 시 최대 2회까지 재시도.
  let result: { data: StrategyResult } | { error: string; raw: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userContent }],
    });
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    result = parseJsonLoose<StrategyResult>(text);
    if (!("error" in result)) break;
  }
  if (!result || "error" in result) {
    throw new Error(`Strategy Agent 응답 파싱 실패: ${result?.error}\n원문: ${result?.raw}`);
  }
  const parsed = result.data;
  // sanity defaults
  parsed.confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0.5));
  parsed.rejected = parsed.rejected ?? [];
  // 레짐/신호 라우팅 — 신호 없는 특수전략·헛된 wait 교체(시나리오 안 줄임).
  const routed = enforceRegimeAndSignals(parsed, snapshot);
  // 스타일×전략 허용 게이트 — LLM이 부적합 전략을 골랐으면 레짐 기본 전략으로 대체.
  const eligible = enforceStyleEligibility(routed, snapshot.style, snapshot.trendMetrics?.classification);
  if (eligible.primary === "wait") eligible.direction = null;
  // range_fade는 본질적으로 양방향 전략 — direction은 후속 단계(Scenario Generator)의 시나리오 majority로 결정.
  // LLM이 한쪽 방향을 골랐어도 강제로 null 처리해서 Stage 2/3 모순을 사전 차단.
  if (eligible.primary === "range_fade") eligible.direction = null;
  return eligible;
}

/**
 * 레짐/신호 라우팅. routeStrategy(순수)로 결정하고, 교체 시 라벨로 reasoning·rejected를
 * 보강한다. 신호 없는 특수전략·헛된 wait만 교체 → 시나리오를 줄이지 않는다.
 */
function enforceRegimeAndSignals(result: StrategyResult, snapshot: AnalysisSnapshot): StrategyResult {
  const decision = routeStrategy(
    result.primary,
    result.direction,
    snapshot.trendMetrics?.classification,
    {
      liquiditySweep: (snapshot.liquiditySweeps?.length ?? 0) > 0,
      fundingSqueeze: snapshot.fundingSqueeze?.active ?? false,
      sessionOpenDrive: snapshot.sessionOpenDrive?.active ?? false,
    },
    snapshot.symbol === "BTCUSDT",
  );
  if (!decision.changed) return result;

  const reasonText =
    decision.reasonCode === "missing_signal"
      ? `[${STRATEGY_LABELS[decision.original!]} 신호 부재 → ${STRATEGY_LABELS[decision.primary]}(으)로 대체]`
      : `[추세/기준자산 기준 관망 부적합 → ${STRATEGY_LABELS[decision.primary]}(으)로 대체]`;
  const rejected =
    decision.original && decision.original !== "wait"
      ? [
          {
            strategy: decision.original,
            reason: decision.reasonCode === "missing_signal" ? `신호 부재(${decision.detail})` : "관망 부적합",
          },
          ...result.rejected,
        ]
      : result.rejected;

  return {
    ...result,
    primary: decision.primary,
    direction: decision.direction,
    confidence: Math.min(result.confidence, 0.55),
    reasoning: `${reasonText} ${result.reasoning}`,
    rejected,
  };
}

/**
 * 스타일×전략 허용 게이트. LLM이 현재 스타일에서 불허된 전략을 골랐으면
 * 레짐(추세 분류) 기본 전략으로 대체하고, 원 선택은 rejected에 사유와 함께 기록한다.
 * 허용된 선택이면 그대로 통과(no-op).
 */
function enforceStyleEligibility(
  result: StrategyResult,
  style: TradingStyle,
  classification: "up" | "down" | "range" | "mixed" | undefined,
): StrategyResult {
  if (isStrategyEligible(result.primary, style)) return result;

  const original = result.primary;
  const fallback = regimeDefaultStrategy(classification);
  return {
    ...result,
    primary: fallback.primary,
    direction: fallback.direction,
    confidence: Math.min(result.confidence, 0.5),
    reasoning: `[${STRATEGY_LABELS[original]}은(는) ${STYLE_PRESETS[style]?.label ?? style} 스타일에서 미지원 → ${STRATEGY_LABELS[fallback.primary]}(으)로 대체] ${result.reasoning}`,
    rejected: [
      { strategy: original, reason: `${STYLE_PRESETS[style]?.label ?? style} 스타일 미지원` },
      ...result.rejected,
    ],
  };
}
