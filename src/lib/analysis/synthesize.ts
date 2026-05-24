import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisSnapshot } from "./analyze";
import { STYLE_PRESETS } from "./style";
import { STRATEGY_LABELS, type StrategyId, type StrategyResult } from "./strategy";
import { parseJsonLoose } from "./json-extract";
import { MIN_STOP_PCT_VS_FEES } from "./standards";

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
  "marketTrend": {
    "direction": "up" | "down" | "range",
    "strength": "strong" | "moderate" | "weak",
    "note": "한 줄. '4H+1H 동반 하락 추세, 모멘텀 강함' 같이 평범한 한국어로."
  },
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
      "strategyHint": "trend_pullback" | "breakout" | "range_fade" | "reversal" | "liquidity_grab" | "funding_squeeze" | "session_open_drive",
      "entryType": "immediate" | "pending",
      "trigger": "조건 (예: $42,650 sweep 후 1H 종가 회복)",
      "entries": [
        { "tier": 1, "label": "1차 진입", "price": <number>, "weight": 40, "note": "현재가 부근 / 또는 가까운 구조 위치" },
        { "tier": 2, "label": "2차 진입", "price": <number>, "weight": 35, "note": "더 깊은 되돌림 / 핵심 지지·저항" },
        { "tier": 3, "label": "3차 진입", "price": <number>, "weight": 25, "note": "마지막 방어선 / 추가 매수 한계" }
      ],
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
- 시나리오는 1~5개. entryZone, invalidation, target은 모두 숫자. 누락 불가.
- 각 시나리오마다 strategyHint를 명시한다 (어느 전략에서 파생된 시나리오인지).
- range_fade 시나리오는 양방향 가능 (박스 상단 숏 + 박스 하단 롱).
- trend_pullback 시나리오는 추세 방향만 (반대 방향 금지).

★ 다중 전략 시나리오 정책 (★ 매우 중요):
Strategy Agent가 메인 전략 1개를 골랐어도, 같은 시장 상황에서 **다른 전략의 시나리오가 정합하게 성립하면 함께 출력하라.**
사용자는 1개 전략에 묶이지 않고 다양한 진입 후보를 보길 원한다.

허용/권장 조합 예시:
- 상승 추세 (메인: trend_pullback long):
  · trend_pullback long (눌림목 매수 — 메인)
  · breakout long (박스 위 돌파 트리거 시 진입 — 보조)
  · liquidity_grab long (저점 sweep 회복이 추가로 감지되면 — 강력)
- 하락 추세 (메인: trend_pullback short):
  · trend_pullback short (반등 매도)
  · breakout short (저점 깨는 돌파)
  · liquidity_grab short (고점 sweep 감지 시)
- 횡보 (메인: range_fade):
  · range_fade short (박스 상단)
  · range_fade long (박스 하단) ← 둘 다 만들기
  · breakout (양 끝 돌파 임박 시) — direction은 돌파 방향
- 펀딩 극단 (fundingSqueeze.active=true):
  · funding_squeeze (군집 반대 방향) — 메인 또는 보조
  · 동시에 trend_pullback도 정합하면 함께
- 미국 개장 + 추세 정렬:
  · session_open_drive (개장 방향)
  · trend_pullback (같은 방향) — 두 신호 정합 시 매우 강함

조합 금지 (서로 모순):
- 같은 방향의 trend_pullback과 range_fade를 동시에 만들지 마라 (서로 시장 가정이 모순).
- 같은 가격대에 long과 short 시나리오 둘 다 만들지 마라 (단, range_fade의 박스 양 끝은 예외).
- 신호가 명확하지 않은 전략의 시나리오는 만들지 마라 (특히 liquidity_grab은 snapshot.liquiditySweeps에 sweep이 있을 때만, funding_squeeze는 fundingSqueeze.active=true일 때만, session_open_drive는 sessionOpenDrive.active=true일 때만).

시나리오 개수 가이드:
- 명확한 추세 + 정합 신호 다수 → 3~5개 (모든 정합 전략 활용)
- 횡보 → 2~3개 (박스 양 끝 + 가능하면 돌파)
- 혼조 → 1~2개 (보수적)
- wait 신호 → 0개

각 시나리오에 strategyHint를 정확히 적어라. 메인 전략과 다른 시나리오를 만들 때는 그 시나리오의 strategyHint가 메인과 달라야 한다.

★ 전략별 플레이북 — Strategy Agent가 정한 전략에 따라 다음 템플릿을 따른다:

[trend_pullback · long] (상승 추세 눌림목 매수):
  - 1차 진입: 가장 가까운 단기 지지 (EMA20 부근, 직전 단기 저점, 최근 FVG 하단)
  - 2차 진입: 중기 지지 (1H/4H 스윙 저점, 큰 OB, POC)
  - 3차 진입: 추세 무효 직전 (마지막 Higher-Low 위)
  - 손절: 마지막 Higher-Low 명확히 아래 (보통 ATR×1.0~1.5)
  - 목표: 다음 직전 고점 또는 +N×ATR (R:R 스타일 최소 충족)
  - trigger: "1차 영역에서 봉 종가가 다시 위로 마감"

[trend_pullback · short] (하락 추세 반등 매도):
  - 1차 진입: 가장 가까운 단기 저항 (EMA20 아래, 직전 단기 고점, FVG 상단)
  - 2차 진입: 중기 저항 (스윙 고점, 큰 OB)
  - 3차 진입: 마지막 Lower-High 직전
  - 손절: 마지막 Lower-High 위
  - 목표: 다음 직전 저점

[range_fade] (박스권 양방향 매매):
  - 시나리오 A — 박스 상단 숏:
    1차: 박스 상단 (VAH 또는 최근 고점 부근)
    2차: 상단 약간 위 (가짜 돌파 회복 대비)
    손절: 상단 명확히 위
    목표: 박스 중간(POC) 또는 박스 하단
  - 시나리오 B — 박스 하단 롱:
    1차: 박스 하단 (VAL 또는 최근 저점 부근)
    2차: 하단 약간 아래 (가짜 이탈 회복)
    손절: 하단 명확히 아래
    목표: POC 또는 박스 상단
  - 두 시나리오 모두 생성 (현재가가 한쪽에 가까우면 그쪽만 가능).

[breakout]:
  - 1차: 돌파 후 재테스트 영역
  - 2차: 더 깊은 재테스트
  - 손절: 돌파 레벨 안쪽
  - 목표: 박스 폭 만큼 또는 다음 매물대

[reversal]:
  - 신호 확정 후 1차 진입 (예: 추세 무효 캔들 회복)
  - 손절: 무효 캔들의 끝
  - 목표: 평균 회귀 레벨 (POC, VWAP)
  - 신뢰도 낮음 — 1개 시나리오만 + warning에 "역추세 위험" 명시.

[liquidity_grab] (스윕 후 회복 진입 — ICT/SMC):
  - snapshot.liquiditySweeps에서 가장 최근(ageBars 최소) sweep을 본다.
  - side="bullish"(저점 sweep 회복) → 롱 시나리오. side="bearish"(고점 sweep 회복) → 숏 시나리오.
  - 1차 진입: sweep 회복 캔들의 종가 부근 (recoveryClose).
  - 2차 진입(선택): 회복 캔들 50% 되돌림 지점.
  - 손절: sweep된 wickExtreme 약간 너머 (즉 sweptLevel을 또 깨면 셋업 무효). ATR×0.3~0.5 수준의 매우 좁은 손절.
  - 목표:
    · 1차 목표: 직전 반대편 스윙 (sweep이 저점이었으면 직전 고점, 고점이었으면 직전 저점).
    · 2차 목표: POC 또는 더 깊은 스윙.
  - R:R: 좁은 손절 덕에 자연스럽게 3+ 나오는 게 정상. 2 미만이면 셋업 거부.
  - trigger: "이미 sweep + 회복 봉 종가 확정됨. 현재가 부근 즉시 진입 또는 회복 봉 종가 부근 리테스트 대기."
  - 시나리오 1개만 (양방향 X). warning에 "스윕 직후라 단기 변동성 큼 — 손절 좁아 리스크%는 평소보다 줄여라" 명시.

[funding_squeeze] (펀딩 군집 청산 노림):
  - snapshot.fundingSqueeze.direction이 "long"이면 → 숏 시나리오만. "short"이면 → 롱 시나리오만.
  - 1차 진입: 현재가 근처 (구조 레벨이 가깝다면 그곳, 아니면 현재가 ±0.1%).
  - 2차 진입(선택): 군집 청산 시작 신호로 가장 가까운 매물대(POC/VAH/VAL).
  - 손절: 군집된 쪽 직전 스윙 너머. 캐스케이드가 안 터지면 빨리 손절. ATR×1.0~1.5.
  - 목표:
    · 1차: 다음 매물대(POC) 또는 ATR×2.
    · 2차: 더 깊은 매물대 또는 ATR×3.
  - 시간 한도 경고: warning에 "시간 한도 12~24시간 — 펀딩 정산까지 진행 없으면 청산" 필수.
  - 1개 시나리오만. snapshot.fundingSqueeze.intensity가 0.6 미만이면 wait로 전환.
  - trigger: "현재가 ±0.2% 안에서 펀딩 정산 시점(다음 funding nextFundingTime 임박) 또는 OI 감소 시작 시 진입."

[session_open_drive] (미국 개장 추세 추종):
  - snapshot.sessionOpenDrive.direction이 long이면 롱, short이면 숏.
  - 1차 진입: 현재가 부근 (이미 드라이브가 시작됐으므로 즉시).
  - 손절: 개장 캔들 시가(sessionOpenDrive.components.openPrice) 너머. ATR×0.5~1.0.
  - 목표:
    · 1차: openPrice 기준 movePct의 2배 거리.
    · 2차: VWAP 너머 또는 직전 일 고/저점.
  - 시간 한도: warning에 "데이 트레이드 — 미국 마감 전 (다음 4~5시간 내) 청산 권장" 명시.
  - 스타일 검증: snapshot.style이 swing/position이면 이 전략 무효 (Strategy Agent가 막아야 정상).
  - 1개 시나리오만. trigger: "개장 드라이브 이미 진행 중. 현재가 즉시 진입 또는 직전 5분봉 종가 부근 진입."

[wait]:
  - scenarios는 빈 배열 [].
  - actionNow에 "지표 혼조 — 다음 셋업 대기" 명시.

위 템플릿을 따르되 실제 가격은 스냅샷의 키레벨(keyLevels, 스윙, VP, 매물대)에서 가져온다. 가격 지어내지 마라.

진입가 근접성 규칙 (★ 매우 중요 — 어기지 마라):
스냅샷의 ticker.last가 현재가다. entryZone(low~high)의 중간값과 현재가의 거리에 따라 entryType을 강제한다.

스타일별 "현재가 대비 entryZone 중간값 거리 한도":
- scalp: ±0.4% 이내 → entryType="immediate" 가능. 0.4% 초과면 시나리오 폐기 (스캘핑은 멀리서 못 기다림).
- day: ±1.5% 이내 → "immediate". 1.5~2% → "pending" 허용. 2% 초과 폐기.
- swing: ±4% 이내 → "immediate". 4~5% → "pending". 5% 초과 폐기.
- position: ±10% 이내 → "immediate". 10~12% → "pending". 12% 초과 폐기.

위 한도는 entries[] 각 tier 가격에도 똑같이 적용된다. 3차 진입이 한도를 넘으면 그 tier는 제거된다. 모든 tier가 한도를 넘으면 시나리오 자체가 무효.

entryType 의미:
- "immediate": 지금 바로 또는 분 단위 안에 진입 가능. trigger는 단순 확인 ("현재가 부근에서 종가 확정" 등).
- "pending": 가격이 entryZone까지 와야 함. trigger에 "가격이 $X까지 내려오면" 같은 도달 조건 명시 필수.

위 한도를 넘으면 그 시나리오는 "지금 의미 없음" → 빈 scenarios로 가거나 다른 셋업 찾아라. 절대로 현재가에서 10% 떨어진 진입가를 스캘핑/데이 시나리오로 내놓지 마라. 사용자가 진입을 못 한다.

다단 진입(entries) 규칙 — ★ 핵심:
- entries 배열은 1~3개 가격을 가진다 (1차/2차/3차).
- 1차 진입은 현재가 가장 가까이. 2차/3차는 더 깊은 되돌림에서.
- 시나리오 entryZone.low~high 안에서, 현실적 매물대/구조 레벨에 단계적으로 분산.
- 1차와 마지막 단계의 가격 차이는 손절폭의 절반을 넘기지 않는다 (분할매수가 진입가 평균을 손절에 너무 가깝게 만들면 안 됨).
- weight 합은 100. 1차에 가장 큰 비중(보통 30~50), 마지막 단계는 더 작게.
- 1단계만 충분한 경우(현재가가 정확히 구조 레벨): 단일 tier 1로 weight 100 가능.
- 각 tier의 note는 짧게 (30자 이내) "왜 이 가격인지" — 예: "현재가 부근", "1H 직전 저점", "박스 하단".

추세 판단(marketTrend) 규칙 — ★ 매우 중요 (코드가 3개 정통 지표로 이미 판정함):
- 스냅샷의 trendMetrics는 ADX(Wilder 1978) + KER(Kaufman 1995) + Choppiness Index(Dreiss) 다수결 결과다.
  반드시 trendMetrics.classification / strength 값을 그대로 marketTrend에 복사하라.
- 매핑:
  · classification "up" → direction "up"
  · "down" → "down"
  · "range" → "range"
  · "mixed" → "range" (혼조 시 보수적으로 횡보 처리)
- note(한 줄, 평범한 한국어)에는 trendMetrics의 3개 지표 수치를 인용:
  예: "ADX 28(추세) · KER 0.62(추세) · CI 35(추세) — 3/3 추세 합의, 방향 ↓"
  예: "ADX 18(횡보) · KER 0.22(노이즈) · CI 65(매우 혼조) — 3/3 횡보 합의"
- 표준 임계치 (산업 표준):
  · ADX: ≥25 추세 / <20 횡보 / 20~25 약함
  · KER: ≥0.6 추세 / <0.3 횡보 / 그 사이 혼조
  · Choppiness: <38.2 강한 추세 / >61.8 매우 혼조 / 그 사이 혼조
- 시나리오 direction이 trendMetrics.classification과 충돌(예: 추세 down인데 long 시나리오)이면
  그 시나리오의 warning에 "지표 다수가 추세 역행 — 카운터 트레이드 위험" 명시.

★★ 절대 하한 — 어떤 스타일/전략에서도 위반 금지 ★★
- 손절폭은 진입가의 **최소 0.36%** (수수료 왕복 0.12% × 3) 이상이어야 한다.
- 0.36% 미만이면 손절 적중 시 수수료가 1R 이상을 차지해 -2R 이상 손실이 확정된다.
- 이는 모든 스타일·모든 전략에 적용된다. liquidity_grab·session_open_drive 같은 예외 전략도 0.36% 절대 하한은 못 넘는다.
- 만약 구조상 자연 손절이 0.36% 안에 있다면, 그 시나리오는 만들지 마라 (wait 또는 다른 셋업 찾기).

스타일별 손절/목표 표준 (위 절대 하한 위에 추가로 적용 — 매우 엄격히 지켜라):

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

★ 특수 전략 손절폭 예외 (스타일 표준보다 우선 — 단, 절대 하한 0.36%는 항상 적용):
- liquidity_grab: 손절폭이 스타일 하한 미만이어도 허용 (sweep 직전 wickExtreme이 자연 손절). 단 0.36% 미만은 절대 금지. R:R ≥ 2.5 필수. qualityIssues에 "특수 셋업: 손절 좁음 — 리스크% 평소 절반 권장" 추가.
- funding_squeeze: 스타일 범위 그대로 적용. R:R ≥ 2 필수. warning에 "시간 한도 12~24h" 필수.
- session_open_drive: 데이 표준의 절반 손절폭까지 허용 (개장 캔들 시가가 자연 손절). 단 0.36% 미만은 절대 금지. qualityIssues에 "개장 드라이브 — 미국 마감 전 청산" 추가.

손절/목표 결정 순서 (★ 반드시 이 순서를 따라라 — 단순히 % 범위 안에 맞추지 마라):

1단계 — 구조에서 손절 위치 잡기 (먼저):
   롱이면: 최근 스윙 저점 / Order Block 하단 / FVG 하단 / 핵심 지지 **아래**.
   숏이면: 최근 스윙 고점 / Order Block 상단 / FVG 상단 / 핵심 저항 **위**.
   "내가 틀렸다면 가격이 어디까지 가야 하는가?" — 그 지점이 손절.

2단계 — ATR 노이즈 검증:
   스냅샷의 atr 배열에서 MTF(중간 시간대)의 pctOfPrice를 확인하라.
   |entry - invalidation| / entry × 100 < ATR_pct × 0.7 이면 손절이 노이즈 영역.
   → 이때는 진입가를 더 멀리(구조에 더 가깝게) 옮기거나, 시나리오 폐기.
   예: 1H ATR = 0.8%이면 손절폭은 최소 0.56% 필요.

3단계 — 스타일 % 범위 확인 (외곽 가드레일):
   1+2 단계 결과 손절폭이 스타일 표준 범위 안인지 확인.
   하한 미달이면 ATR이 작아서 그 자체로 거래 우위 없음 → 시나리오 폐기.
   상한 초과면 진입가가 너무 멀거나 셋업 무효 → 시나리오 폐기.

4단계 — 목표 위치 잡기:
   다음 핵심 레벨로 잡아라: 다음 매물대(POC/VAH/VAL), 직전 고점/저점, 다음 유동성 영역.
   "%로 임의 계산"하지 마라. 단, 결과가 스타일 범위 + R:R 최소를 만족해야 함.
   미달이면 시나리오 폐기.

추가 데이터 활용 가이드 (스냅샷에 있으면 적극 참고):
- atr (Average True Range): 손절폭이 ATR보다 너무 좁으면 노이즈 위험. 일반적으로 손절폭 ≥ ATR×0.7 권장.
- vwap (세션 VWAP): 현재가가 VWAP 위면 단기 매수 우위, 아래면 매도 우위. distancePct가 ±2% 이상이면 평균회귀 압력 강함.
- topTraderRatio (상위 트레이더 롱/숏): >1.5 = 큰손 롱 군집, <0.7 = 숏 군집. 일반 펀딩비와 다른 시각.
- basis (현물-선물 괴리, premiumPct): >0.1% = 선물 프리미엄, 롱 군집 / <-0.1% = 디스카운트, 숏 군집. squeeze 신호.
- fundingHistory.trend: rising면 롱 군집 형성 중, falling면 해소 중. avg24h가 극단치면 reversal 가능.
- oiDelta.hourChangePct: >2% 급증 + 가격 변화 = 신규 진입 / 급감 = 청산 / 정리.
- macro.dxy: BTC와 보통 역상관. DXY 급등 시 BTC 약세 위험.
- macro.fearGreed: <25 (극단 fear) = 역방향 long 기회 / >75 (극단 greed) = 숏 기회. 단독 신호로는 약하지만 컨피루엔스 보조.
- macro.dominanceRegime (★ 알트 매매 시 매우 중요): 시장 국면 자동 분류 결과.
  · alt_season (알트 시즌): BTC.D 낮음 + 총시총 상승 → 알트 롱 유리, 알트 숏 비추.
  · btc_season (BTC 시즌): BTC.D 높음 + 총시총 상승 → BTC 롱 유리, 알트는 약세이므로 알트 숏 가능, 알트 롱 위험.
  · alt_panic: 총시총 하락 + BTC.D 낮음 → 알트가 BTC보다 더 큰 폭 하락. 알트 숏만 유리.
  · btc_flight: 총시총 하락 + BTC.D 높음 → BTC로 자금 도피. BTC 롱(상대 강세) / 알트 숏 유리.
  · risk_off: USDT.D 높음 → 매도 압력 우세. 매수 시나리오 신뢰도 낮춤.
  · risk_on: USDT.D 낮음 + 총시총 상승 → 매수 우호적 환경.
  · neutral: 명확한 신호 없음 → 추세·구조 신호로만 판단.
  알트 매매 시 dominanceRegime이 시나리오 방향과 충돌하면 그 시나리오 warning에 명시.
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

export interface ScenarioEntry {
  tier: number;
  label: string;
  price: number;
  weight: number;
  note: string;
  distancePct?: number;
}

export interface AnalysisReport {
  summary: string;
  marketTrend?: {
    direction: "up" | "down" | "range";
    strength: "strong" | "moderate" | "weak";
    note: string;
  };
  structure: { htf: string; ltf: string; alignment: "aligned_up" | "aligned_down" | "mixed" | "range" };
  keyLevels: { label: string; price: number; note: string }[];
  flow: { bias: "buy_heavy" | "sell_heavy" | "neutral"; note: string };
  scenarios: {
    name: string;
    direction: "long" | "short";
    /** Which strategy this scenario belongs to. Falls back to the main strategy
     *  selected by Strategy Agent if not provided (backward compat). */
    strategyHint?: StrategyId;
    entryType?: "immediate" | "pending";
    qualityIssues?: string[];
    entries?: ScenarioEntry[];
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
메인 전략: ${STRATEGY_LABELS[strategy.primary]} (${strategy.primary})
메인 방향: ${strategy.direction ?? "N/A"}
신뢰도: ${(strategy.confidence * 100).toFixed(0)}%
근거: ${strategy.reasoning}
거부된 전략: ${strategy.rejected.map((r) => `${r.strategy}(${r.reason})`).join(", ") || "없음"}

다중 전략 시나리오 지침:
- 메인 전략을 가장 비중 있는 시나리오로 두되, 같은 시장에서 정합한 다른 전략의 시나리오도 함께 만든다.
- 시스템 프롬프트의 "다중 전략 시나리오 정책"을 그대로 따른다.
- 각 시나리오의 strategyHint를 정확히 적는다. 메인 전략과 다른 전략의 시나리오에는 그 전략 ID를 명시.
- 거부된 전략이라도 그 거부 사유가 단순히 "메인이 아니어서"인 경우, 실제 신호가 보이면 보조 시나리오로 활용 가능.
- 단, snapshot.liquiditySweeps가 비어있으면 liquidity_grab 시나리오 금지.
- snapshot.fundingSqueeze.active=false이면 funding_squeeze 시나리오 금지.
- snapshot.sessionOpenDrive.active=false이면 session_open_drive 시나리오 금지.
- 메인 전략이 "wait"이면 scenarios는 빈 배열 []. 보조 전략으로 채우지 마라 (wait은 신호 자체가 부재).
- 메인 방향이 명시됐다면 같은 strategyHint를 가진 시나리오는 그 방향만. 보조 전략 시나리오는 다른 방향 가능.`;

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
  return enforceEntryProximity(result.data, snapshot);
}

// Style-dependent maximum distance (entryZone midpoint vs current price) for each entryType.
// "immediate" must be reachable now; "pending" can be a stretch but must still be plausible.
//
// Tightened 2026-05-22: prior pending caps (day 3% / swing 8% / position 20%) let the
// LLM park entries that needed days-to-weeks to reach. Pulled in so the scenarios
// the user sees are actually tradeable within the style's expected hold time.
const PROXIMITY_LIMITS: Record<string, { immediate: number; pending: number }> = {
  scalp: { immediate: 0.4, pending: 0.4 }, // scalp doesn't wait
  day: { immediate: 1.5, pending: 2 },
  swing: { immediate: 4, pending: 5 },
  position: { immediate: 10, pending: 12 },
};

// Style-based stop/target % bounds (must match prompt) + min R:R
const STOP_RANGES: Record<string, { stopMin: number; stopMax: number; targetMin: number; minRR: number }> = {
  scalp: { stopMin: 0.3, stopMax: 0.7, targetMin: 0.7, minRR: 2 },
  day: { stopMin: 0.7, stopMax: 1.5, targetMin: 1.5, minRR: 1.5 },
  swing: { stopMin: 2, stopMax: 5, targetMin: 5, minRR: 2 },
  position: { stopMin: 5, stopMax: 15, targetMin: 15, minRR: 3 },
};

function enforceEntryProximity(report: AnalysisReport, snapshot: AnalysisSnapshot): AnalysisReport {
  const current = snapshot.ticker?.last;
  if (!current || current <= 0) return report;
  const proxLimits = PROXIMITY_LIMITS[snapshot.style] ?? PROXIMITY_LIMITS.swing;
  const stopLimits = STOP_RANGES[snapshot.style] ?? STOP_RANGES.swing;
  const mtfAtrPct = snapshot.atr?.find((a) => a.role === "MTF")?.pctOfPrice;

  const kept: AnalysisReport["scenarios"] = [];
  const dropped: string[] = [];
  for (const s of report.scenarios) {
    const mid = (s.entryZone.low + s.entryZone.high) / 2;
    const distPct = Math.abs((mid - current) / current) * 100;

    // 1) Proximity gate
    let resolved: "immediate" | "pending";
    if (distPct <= proxLimits.immediate) resolved = "immediate";
    else if (distPct <= proxLimits.pending) resolved = "pending";
    else {
      dropped.push(`${s.name} (진입가 ${distPct.toFixed(1)}% 떨어짐 — 도달 가능성 낮음)`);
      continue;
    }

    // 2) Stop/target/RR — collect issues. 절대 하한(수수료×3) 위반은 즉시 폐기.
    const stopPct = (Math.abs(mid - s.invalidation) / mid) * 100;
    const targetPct = (Math.abs(s.target - mid) / mid) * 100;
    const rr = stopPct === 0 ? 0 : targetPct / stopPct;
    const issues: string[] = [];

    // 하드 가드 1: 손절폭이 수수료×3 미만 → 폐기 (어떤 스타일/전략에서도 불허용)
    if (stopPct < MIN_STOP_PCT_VS_FEES) {
      dropped.push(
        `${s.name} (손절폭 ${stopPct.toFixed(3)}% < 수수료×3 ${MIN_STOP_PCT_VS_FEES.toFixed(2)}% — 손절 적중 시 -2R 이상 손실)`,
      );
      continue;
    }

    // 하드 가드 2: 손절폭이 스타일 표준 하한의 80% 미만 → 폐기
    if (stopPct < stopLimits.stopMin * 0.8) {
      dropped.push(
        `${s.name} (손절폭 ${stopPct.toFixed(2)}% < 스타일 하한 ${stopLimits.stopMin}% × 0.8 = ${(stopLimits.stopMin * 0.8).toFixed(2)}% — 노이즈에 잡힐 위험 큼)`,
      );
      continue;
    }

    if (stopPct < stopLimits.stopMin) {
      issues.push(`손절폭 ${stopPct.toFixed(2)}% — 스타일 하한 ${stopLimits.stopMin}% 미달 (노이즈 위험)`);
    } else if (stopPct > stopLimits.stopMax) {
      issues.push(`손절폭 ${stopPct.toFixed(2)}% — 스타일 상한 ${stopLimits.stopMax}% 초과 (리스크 과도)`);
    }
    if (targetPct < stopLimits.targetMin) {
      issues.push(`목표폭 ${targetPct.toFixed(2)}% — 스타일 하한 ${stopLimits.targetMin}% 미달`);
    }
    if (rr < stopLimits.minRR) {
      issues.push(`손익비 ${rr.toFixed(2)} — 스타일 최소 ${stopLimits.minRR} 미달`);
    }

    // 3) ATR floor — also as quality issue
    if (mtfAtrPct && stopPct < mtfAtrPct * 0.7) {
      issues.push(
        `손절 ${stopPct.toFixed(2)}% < MTF ATR×0.7 (${(mtfAtrPct * 0.7).toFixed(2)}%) — 시장 노이즈에 손절될 위험`,
      );
    }

    // 4) Annotate entries with distancePct + sanity-check tier ordering + per-tier gate
    let processedEntries = s.entries;
    const droppedTiers: string[] = [];
    if (processedEntries && processedEntries.length > 0) {
      const isLong = s.direction === "long";
      // For long: tiers should be progressively lower (deeper pullback).
      // For short: tiers should be progressively higher.
      const sorted = [...processedEntries].sort((a, b) => (isLong ? b.price - a.price : a.price - b.price));
      // Per-tier proximity gate — drop individual tiers that exceed pending limit
      // even if the scenario midpoint passed. This kills "3차 진입" prices that are
      // far enough away to be effectively unreachable.
      const tierLimit = proxLimits.pending;
      const withinLimit = sorted.filter((e) => {
        const d = Math.abs((e.price - current) / current) * 100;
        if (d <= tierLimit) return true;
        droppedTiers.push(`tier@${e.price}(${d.toFixed(1)}%↑${tierLimit}%)`);
        return false;
      });
      // If every tier got dropped the scenario itself is unreachable — fall back to
      // closing the entry to entryZone midpoint so the user still sees the setup,
      // but flag it heavily via qualityIssues below.
      const finalSet = withinLimit.length > 0 ? withinLimit : sorted.slice(0, 1);
      processedEntries = finalSet.map((e, idx) => ({
        ...e,
        tier: idx + 1,
        label: idx === 0 ? "1차 진입" : idx === 1 ? "2차 진입" : "3차 진입",
        distancePct: ((e.price - current) / current) * 100,
      }));
      // Normalize weights to sum 100 if any tiers were dropped or the sum is off
      const wSum = processedEntries.reduce((acc, e) => acc + (e.weight || 0), 0);
      if (wSum > 0 && Math.abs(wSum - 100) > 1) {
        processedEntries = processedEntries.map((e) => ({ ...e, weight: Math.round((e.weight / wSum) * 100) }));
      }
    }
    if (droppedTiers.length > 0) {
      issues.push(`먼 진입 단계 제거: ${droppedTiers.join(", ")}`);
    }

    const requested = s.entryType;
    const finalType = requested === "pending" || requested === "immediate" ? requested : resolved;
    kept.push({
      ...s,
      entryType: finalType,
      entries: processedEntries,
      qualityIssues: issues.length ? issues : undefined,
    });
  }

  const warnings = [...report.warnings];
  for (const msg of dropped) warnings.push(`시나리오 제외: ${msg}`);

  const flawedCount = kept.filter((s) => s.qualityIssues && s.qualityIssues.length > 0).length;
  const cleanCount = kept.length - flawedCount;
  let actionNow = report.actionNow;
  if (kept.length === 0) {
    actionNow = "현재가에서 거래 우위 보이지 않음. 다음 셋업 대기.";
  } else if (cleanCount === 0 && flawedCount > 0) {
    actionNow = `방향은 잡혔으나 시나리오마다 표준 미달 항목 있음. 카드의 "검토 항목"을 보고 진입 여부 본인 판단.`;
  }

  return {
    ...report,
    scenarios: kept,
    warnings,
    actionNow,
  };
}
