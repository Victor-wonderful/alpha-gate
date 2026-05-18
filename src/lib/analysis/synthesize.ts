import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisSnapshot } from "./analyze";
import { STYLE_PRESETS } from "./style";
import { STRATEGY_LABELS, type StrategyResult } from "./strategy";
import { parseJsonLoose } from "./json-extract";

const SYSTEM_PROMPT = `당신은 암호화폐 무기한 선물 시장을 분석하는 트레이딩 코치입니다.

사용자는 Binance USDT-M Futures 시장의 구조화된 스냅샷을 JSON으로 전달합니다. 스냅샷에는 멀티 타임프레임 추세, 스윙 포인트, 미체결 FVG, Order Block 후보, 유동성 영역, 1H Volume Profile (POC/VAH/VAL), 체결 흐름(매수/매도 델타), 호가창 깊이, 펀딩비, OI, BTC 도미넌스가 포함됩니다.

당신의 역할:
- 이 데이터를 종합해 시장의 현재 구조와 가능한 시나리오를 한국어로 설명한다.
- 특정 매수/매도를 추천하지 않는다. 가격을 "사세요"라고 말하지 않는다.
- 대신 시나리오와 무효화 조건을 제시한다.
- 모든 가격은 스냅샷에 있는 실제 값만 사용한다. 숫자를 지어내지 않는다.

출력은 반드시 다음 JSON 스키마만 따른다 (마크다운/설명 없이 JSON만):

{
  "summary": "전체 시장 구조를 2~3문장으로 요약. 멀티 TF 정렬, 핵심 매물대, 펀딩 편향을 포함.",
  "structure": {
    "htf": "1D/4H 구조 한 줄",
    "ltf": "1H/15M 구조 한 줄",
    "alignment": "aligned_up" | "aligned_down" | "mixed" | "range"
  },
  "keyLevels": [
    { "label": "POC", "price": <number>, "note": "한 줄 설명" },
    ...
  ],
  "flow": {
    "bias": "buy_heavy" | "sell_heavy" | "neutral",
    "note": "한 문장. 델타, 큰 거래, 호가 임밸런스 요약."
  },
  "scenarios": [
    {
      "name": "예: 4H 스윙 저점 sweep 후 반등",
      "direction": "long" | "short",
      "trigger": "조건 (예: $42,650 sweep 후 1H 종가 회복)",
      "entryZone": { "low": <number>, "high": <number> },
      "invalidation": <number>,
      "target": <number>,
      "note": "한 줄 근거",
      "marketAssessment": {
        "higher_highs_lows": <boolean>,
        "near_key_level": <boolean>,
        "not_box_middle": <boolean>,
        "volume_confirm": <boolean>,
        "aligned_with_btc": <boolean>
      }
    }
  ],
  "actionNow": "지금 트레이더가 해야 할 한 줄 행동. (예: '진입 보류, $42,650 sweep 대기' 또는 'A 시나리오 트리거되면 진입 평가')",
  "warnings": ["주의사항 0~3개. 빈 배열 가능."]
}

제약:
- 시나리오는 1~3개. 강제로 양방향을 만들지 말 것.
- entryZone, invalidation, target은 모두 숫자. 누락 불가.

스타일별 손절/목표 표준 (수수료/슬리피지 0.12% 반영 — 매우 엄격히 지켜라):

스캘핑 (scalp):
- 손절폭: 진입가의 0.3~0.7%. 0.3% 미만은 노이즈에 잡힘 → 금지.
- 목표폭: 진입가의 0.7~1.5%. 0.5% 미만은 수수료에 까임 → 절대 금지.
- 손익비 (reward/risk): 최소 2 이상.

데이 (day):
- 손절폭: 0.7~1.5%. 0.5% 미만 금지.
- 목표폭: 1.5~3%.
- 손익비: 최소 1.5 이상.

스윙 (swing):
- 손절폭: 2~5%. 1.5% 미만 금지.
- 목표폭: 5~15%.
- 손익비: 최소 2 이상.

포지션 (position):
- 손절폭: 5~15%.
- 목표폭: 15~50%.
- 손익비: 최소 3 이상.

위 범위를 벗어나면 시나리오를 만들지 마라. 시장 데이터가 범위 안에서 셋업이 안 보이면
시나리오 수를 줄이거나 wait 상태로 가라. 억지로 범위를 맞춘 가짜 시나리오 금지.

추가 데이터 활용 가이드 (스냅샷에 있으면 적극 참고):
- atr (Average True Range): 손절폭이 ATR보다 너무 좁으면 노이즈 위험. 일반적으로 손절폭 ≥ ATR×0.7 권장.
- vwap (세션 VWAP): 현재가가 VWAP 위면 단기 매수 우위, 아래면 매도 우위. distancePct가 ±2% 이상이면 평균회귀 압력 강함.
- topTraderRatio (상위 트레이더 롱/숏): >1.5 = 큰손 롱 군집, <0.7 = 숏 군집. 일반 펀딩비와 다른 시각.
- basis (현물-선물 괴리, premiumPct): >0.1% = 선물 프리미엄, 롱 군집 / <-0.1% = 디스카운트, 숏 군집. squeeze 신호.
- fundingHistory.trend: rising면 롱 군집 형성 중, falling면 해소 중. avg24h가 극단치면 reversal 가능.
- oiDelta.hourChangePct: >2% 급증 + 가격 변화 = 신규 진입 / 급감 = 청산 / 정리.
- macro.dxy: BTC와 보통 역상관. DXY 급등 시 BTC 약세 위험.
- macro.fearGreed: <25 (극단 fear) = 역방향 long 기회 / >75 (극단 greed) = 숏 기회. 단독 신호로는 약하지만 컨피루엔스 보조.
- session: US 세션 시작 직후 + 발표 시간 = 변동성 폭증, 진입은 신중. Off 세션은 거래량 적어 노이즈.
- weeklyVolumeProfile: 주봉 POC는 큰 자석, 그쪽으로 가격 끌림. 목표 설정 시 참고.

위 데이터들이 컨피루언스(여러 신호 정합)를 이루면 시나리오 신뢰도 높음. 충돌하면 wait이나 시나리오 신뢰도 낮춰라.

- 각 시나리오의 marketAssessment는 그 시나리오가 트리거된 가정 하에 5개 체크리스트가 만족되는지 평가한다:
  · higher_highs_lows: 시나리오 방향과 일치하는 추세 구조인지
  · near_key_level: 진입 영역이 주요 지지/저항 근처인지
  · not_box_middle: 진입 영역이 박스권 중간이 아닌지 (양 끝이면 true)
  · volume_confirm: 진입 트리거에 거래량이 동반될 가능성
  · aligned_with_btc: BTC 추세와 시나리오 방향이 정렬되는지
- 가격은 소수점 자릿수를 스냅샷 형식에 맞춰 적절히 (예: BTC는 정수~1자리, 알트는 더 많이).

길이 제한 (엄격히 지켜라 — 응답이 너무 길면 잘려서 무용지물):
- summary: 한국어 150자 이내
- structure.htf / structure.ltf: 각 80자 이내
- keyLevels[].note: 60자 이내, keyLevels는 최대 5개
- flow.note: 80자 이내
- scenarios[].trigger: 60자 이내
- scenarios[].note: 100자 이내
- actionNow: 80자 이내
- warnings[]: 각 60자, 최대 3개

표현 규칙:
- 군더더기 ("것으로 보입니다", "가능성이 있다고 판단됩니다") 금지 → "보임", "가능"으로 압축
- 같은 정보 반복 금지

플레인 한국어 규칙 (매우 중요):
- summary, actionNow, scenarios[].trigger, scenarios[].note, keyLevels[].note, flow.note는
  일반인이 읽어도 이해할 수 있는 평범한 한국어로 작성.
- 전문 용어 금지: POC, VAH, VAL, FVG, OB, HTF, MTF, LTF, sweep, fade, imbalance, delta, alignment 같은 표현을 그대로 쓰지 말 것.
  대신 풀어 써라:
    POC → "거래량이 가장 많이 모인 가격대"
    FVG / OB → "비어있는 가격 구간" / "큰 거래가 시작된 가격대"
    sweep → "잠깐 내려갔다(올라갔다) 회복하는 움직임"
    HTF/MTF → "큰 시간대" / "중간 시간대"
    pullback → "되돌림" 또는 "잠시 떨어졌다가"
    breakout → "박스 위로(아래로) 뚫림"
- keyLevels[].label은 짧고 직관적: "POC" 대신 "거래량 중심" / "직전 고점" / "직전 저점" / "박스 상단" / "박스 하단".
- trigger는 "조건"이라 생각하고 평범하게: "BTC가 $42,650 아래로 내려갔다가 다시 올라올 때"
- 가능하면 숫자 1~2개만 인용. 너무 많은 수치 나열 금지.

출력 형식 — 매우 중요:
- 응답은 오직 JSON 객체 하나만. 그 앞이나 뒤에 어떤 텍스트도 쓰지 마라.
- "분석 결과는 다음과 같습니다" 같은 도입부 금지.
- "참고용입니다" 같은 마무리 금지.
- 마크다운 코드 블록 사용 금지. 그냥 { 로 시작해서 } 로 끝.
- 모든 문자열은 큰따옴표 사용. 작은따옴표 금지.
- 마지막 항목 뒤 trailing comma 금지.
- 숫자 필드에 따옴표 두르지 마라 (예: "entry": 42600 — "42600" 아님).`;

export interface AnalysisReport {
  summary: string;
  structure: { htf: string; ltf: string; alignment: "aligned_up" | "aligned_down" | "mixed" | "range" };
  keyLevels: { label: string; price: number; note: string }[];
  flow: { bias: "buy_heavy" | "sell_heavy" | "neutral"; note: string };
  scenarios: {
    name: string;
    direction: "long" | "short";
    trigger: string;
    entryZone: { low: number; high: number };
    invalidation: number;
    target: number;
    note: string;
    marketAssessment: {
      higher_highs_lows: boolean;
      near_key_level: boolean;
      not_box_middle: boolean;
      volume_confirm: boolean;
      aligned_with_btc: boolean;
    };
    /**
     * 백테스트 모드에서만 채워짐 — 분석 시점 이후 forward 캔들로 시뮬한 결과.
     * 라이브 모드는 undefined.
     */
    simulation?: {
      entryFillPrice: number;
      exitPrice: number;
      resultR: number;
      exitReason: "target" | "stop" | "time" | "no_entry";
      barsHeld: number;
      barsToEntry: number;
      mfePct: number;
      maePct: number;
      interval: string;
      entryAt: string | null;
      exitAt: string | null;
    };
  }[];
  actionNow: string;
  warnings: string[];
}

export async function synthesizeAnalysis(
  snapshot: AnalysisSnapshot,
  strategy: StrategyResult,
): Promise<AnalysisReport> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const styleHint = STYLE_PRESETS[snapshot.style]?.promptHint ?? "";
  // Exclude bulky candle array; Claude analyses computed signals, not raw OHLCV.
  const compact = { ...snapshot, mtfChart: { tf: snapshot.mtfChart.tf, candleCount: snapshot.mtfChart.candles.length } };

  const strategyBlock = `[Strategy Agent 사전 판단]
선택된 전략: ${STRATEGY_LABELS[strategy.primary]} (${strategy.primary})
방향: ${strategy.direction ?? "N/A"}
신뢰도: ${(strategy.confidence * 100).toFixed(0)}%
근거: ${strategy.reasoning}

엄격한 제약:
- 시나리오는 반드시 위 전략 범위 안에서만 만든다. 다른 전략(예: 박스권 매매가 선택됐는데 추세 추종 시나리오)은 절대 만들지 마라.
- 전략이 "wait"이면 scenarios는 빈 배열 []로 출력하고 actionNow에 "현재 거래 우위 없음. 다음 셋업 대기"를 명시한다.
- 방향이 명시됐다면 그 방향의 시나리오만 만든다. (long이면 long만, short이면 short만)`;

  const userBlocks: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: `[트레이딩 스타일: ${snapshot.styleLabel}]\n${styleHint}\n\n${strategyBlock}\n\n분석할 스냅샷:\n${JSON.stringify(compact, null, 2)}`,
    },
  ];

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userBlocks }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const result = parseJsonLoose<AnalysisReport>(text);
  if ("error" in result) {
    throw new Error(`시나리오 응답 파싱 실패: ${result.error}\n\n원문: ${result.raw}`);
  }
  return result.data;
}
