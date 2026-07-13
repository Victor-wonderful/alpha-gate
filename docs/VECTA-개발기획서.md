# VECTA — 제품/서비스 개발 기획서

> **문서 상태:** 초안 (v0.1)
> **대상 독자:** 협업자 · 개발팀 (온보딩 / 인수인계용)
> **최종 수정:** 2026-07-13
> **한 줄 요약:** 암호화폐 트레이더가 진입 버튼을 누르기 전에 *"이 거래를 해도 되는가"* 를 검증하게 만드는, 데이터 기반 AI 분석 + 의사결정 게이트 도구.

---

## 목차

1. [문서 개요](#1-문서-개요)
2. [제품 정의 — 무엇을, 왜](#2-제품-정의--무엇을-왜)
3. [시장 · 타깃 · 차별점](#3-시장--타깃--차별점)
4. [시스템 아키텍처](#4-시스템-아키텍처)
5. [핵심 ① AI 분석 파이프라인](#5-핵심--ai-분석-파이프라인)
6. [핵심 ② 의사결정 검증 로직](#6-핵심--의사결정-검증-로직)
7. [데이터 · 백테스트 근거](#7-데이터--백테스트-근거)
8. [구현 현황 — 기능 인벤토리](#8-구현-현황--기능-인벤토리)
9. [데이터 모델](#9-데이터-모델)
10. [주요 의사결정 이력](#10-주요-의사결정-이력)
11. [알려진 이슈 · 기술 부채 · 리스크](#11-알려진-이슈--기술-부채--리스크)
12. [로드맵 & 다음 단계](#12-로드맵--다음-단계)
13. [부록](#13-부록)

---

## 1. 문서 개요

### 1.1 목적
이 문서는 **VECTA**(구 Alpha Gate) 서비스가 **지금까지 어디까지 만들어졌는지**를 협업자·개발팀 관점에서 정리한 개발 기획서다. 새로 합류하는 사람이 이 문서 하나로 "무엇을, 왜, 어떻게 만들었고, 지금 어디에 서 있는가"를 파악하는 것을 목표로 한다.

### 1.2 브랜드 상태 (읽기 전 주의)
- 제품명은 **Alpha Gate → VECTA**로 리브랜딩됨 (2026-07). 코드·메타·법적문서·i18n 전역 반영 완료.
- 단, **배포 도메인은 아직 `alpha-gate.vercel.app`** 그대로다 (브랜드만 VECTA, 도메인 미확정).
- 이 문서는 **VECTA**를 정식 제품명으로 사용한다. 코드/인프라 문맥에서 `alpha-gate`가 보이면 같은 것을 가리킨다.

### 1.3 현재 상태 한눈에

| 항목 | 상태 |
|------|------|
| 배포 | ✅ 프로덕션 라이브 (`alpha-gate.vercel.app`, Vercel) |
| 코어 기능 | ✅ AI 분석 · 거래 평가 · 저널 · 대시보드 · 후보 레이더 · 백테스트 · 어드민 · 알림 전부 구현 |
| DB 마이그레이션 | 40개 적용 완료 (Supabase Cloud) |
| 테스트 | Vitest 61종 통과, `tsc --noEmit` clean |
| 🔴 **AI 분석 (실 LLM)** | **현재 비활성** — `ANTHROPIC_API_KEY` 무효(401). 지금은 **코드 폴백**으로만 동작 (무중단). 새 키 발급 시 즉시 복구 |
| 수익화 | 방향 확정(유료 구독 + 분석 횟수 제한), 결제 연동은 미착수 |

### 1.4 개발 규모 (참고)
- 약 8개월 누적 개발 (2026-05 ~ 2026-07 활발한 기록 기준).
- DB 마이그레이션 40개, `src/lib` 도메인 모듈 70+개, 검증용 백테스트/스크립트 하니스 20+개.

---

## 2. 제품 정의 — 무엇을, 왜

### 2.1 한 문장
> **"무엇을 살까"가 아니라 "이 거래를 해도 되는가"에 답하는 도구.**

대부분의 트레이딩 서비스는 "이 코인을 사라/팔아라"(신호)를 판다. VECTA는 방향을 대신 정해주는 것이 아니라, 트레이더가 **진입 버튼을 누르기 직전**에 "이 거래가 규칙에 맞는 거래인가"를 스스로 검증하도록 만든다.

### 2.2 핵심 철학 — 의사결정 게이트
트레이더가 돈을 잃는 이유는 대부분 "나쁜 종목"이 아니라 **나쁜 의사결정**이다: 추격 진입, 손절 없는 진입, 연속 손실 후 복수매매, 과도한 노출. VECTA는 이 지점들을 **게이트**로 막는다.

- 진입 전 **등급(A/B/C/D)** 으로 "지금 이 거래를 해도 되는가"를 즉답.
- 등급은 감(感)이 아니라 **코드로 계산된 시장 사실 + 자금 관리 상태 + 시장 컨텍스트**의 합산 점수.
- D급("강한 자제")은 원인별로 분기 — 계좌발(일일 한도 초과/과노출)이면 "오늘은 보류", 셋업발이면 "고위험, 사이즈 축소".

### 2.3 왜 AI인가 (그리고 왜 AI가 등급을 정하지 않는가)
- **AI의 역할은 "시나리오 생성"** — 시장 데이터를 읽고 진입/손절/목표가 포함된 매매 시나리오를 사람이 읽는 언어로 제시.
- **AI는 등급을 결정하지 않는다.** 등급은 결정론적 코드가 계산한다. AI가 못 쓰는 상황(키 만료·장애)에서도 **코드 폴백**으로 분석과 등급이 무중단으로 나온다. → *AI 독립성*은 이 제품의 설계 원칙이다.

### 2.4 연계 자산
사용자(Victor)의 [Victor Alpha 블로그](https://victor-alpha-neon.vercel.app/)와 통합 브랜드. 사이드바 하단에서 외부 링크로 연결.

### 2.5 면책
투자 자문이 아니다. 모든 매매 결정과 결과는 사용자 본인 책임 — 랜딩/분석 결과/모든 다운로드 파일에 명시.

---

## 3. 시장 · 타깃 · 차별점

### 3.1 타깃 사용자
- 암호화폐 **무기한 선물(Perpetual Futures)** 을 거래하는 개인 트레이더.
- 이미 "무엇을 살지"에 대한 자기 판단이 있으나, **일관된 규율(리스크 관리, 손절, 노출 통제)** 이 약한 층.
- 스타일 스펙트럼: 스캘핑(수분) ~ 포지션(수개월) 전부 커버.

### 3.2 차별점

| 축 | 일반 시그널 서비스 | VECTA |
|----|------|-------|
| 제공 가치 | 매수/매도 신호 | 의사결정 검증(게이트) |
| 근거 | 블랙박스 / 지표 몇 개 | 멀티 TF 시장구조 + 오더플로우 + 백테스트 검증 |
| AI 의존 | 서비스 전체가 AI에 종속 | AI=시나리오 생성만, 등급/사이징은 코드. **AI 없어도 동작** |
| 리스크 관리 | 없음 또는 부가 | **핵심 기능** (자금 관리 자동 집계, 노출 경고, 일일 손실 한도) |
| 정직성 | "지금 사라" 편향 | 확신이 낮으면 낮다고 표시, 검증 안 된 엣지는 강제하지 않음 |

### 3.3 포지셔닝 요약
"트레이딩 신호 판매점"이 아니라 **"트레이더의 규율 코치 + 데이터 검증 레이어"**. 종목 추천의 정확도가 아니라 **의사결정 품질**로 경쟁한다.

---

## 4. 시스템 아키텍처

### 4.1 기술 스택

| 영역 | 선택 | 비고 |
|------|------|------|
| 프레임워크 | **Next.js 16.2.6** (App Router, TS, Turbopack) | React 19.2 |
| 스타일 | Tailwind v4 + 자체 UI 컴포넌트 | 폰트 Inter / Noto Sans KR / JetBrains Mono |
| DB / Auth | **Supabase Cloud** (Postgres + RLS + GoTrue) | 셀프호스팅 이전 가능(락인 약함) |
| AI | `@anthropic-ai/sdk` v0.96, model `claude-sonnet-4-6` | **프롬프트 캐싱 필수** |
| 차트 | lightweight-charts v5 (TradingView OSS) + recharts | |
| 마켓 데이터 | **Binance Futures 공개 API** (`fapi.binance.com`) + CoinGecko(도미넌스) | 무료 API |
| 상태 | Zustand (sessionStorage persist) + TanStack Query | |
| 폼 | react-hook-form + zod | |
| 알림 | Telegram Bot API + Discord Webhook | 직접 HTTP fetch |
| 캡처 | html-to-image (PNG) | |
| 테스트 | Vitest | `pnpm test` |
| 배포 | Vercel + Vercel Cron | 일일 요약·타이밍·레이더 스캔 |

**의사결정 메모:** Supabase는 **Cloud** 선택(Docker 자체호스팅 X). 사용자 동의. 락인이 약해 코드 그대로 셀프호스팅 이전 가능.

### 4.2 데이터 흐름 (분석 요청 1회)

```
[사용자: 심볼 + 스타일 선택]
        │
        ▼
Stage 1  Market Data (코드, 결정론적)
  Binance 멀티 TF klines · 호가창 · aggTrades · 펀딩 · OI · 24h ticker
  CoinGecko BTC 도미넌스   →  전부 병렬 fetch
  자체 계산: 스윙 · FVG · OB · Liquidity · Volume Profile(POC/VAH/VAL) · Order Flow
        │  snapshot
        ▼
Stage 2  Strategy Agent (LLM, 가벼움)
  스냅샷 → 5개 전략 중 1개 선택 (trend_pullback / breakout / range_fade / reversal / wait)
        │  strategy { primary, direction, confidence, ... }
        ▼
Stage 3  Scenario Generator (LLM, 메인)
  전략 제약 안에서 시나리오 생성 (진입/손절/목표/트리거)
  스타일별 표준 손절·목표·R:R 강제
        │  report { scenarios[], keyLevels, actionNow, warnings, ... }
        ▼
[코드] marketAssessment 계산 → 등급(A/B/C/D) + 사이징
        │
        ▼
Stage 4  Persist (코드) → Supabase `analyses` 저장 → 대시보드/기록 표시

⚠️ Stage 2·3에서 AI 실패 시 → code-scenario.ts 폴백(추세 기반 시나리오) + 운영자 알림, 분석 횟수 미차감
```

### 4.3 디렉터리 구조 (요약)

```
src/
  app/
    (공개) page.tsx · login · layout(메타/OG/favicon)
    app/                      # 로그인 보호 영역
      page.tsx                # 홈 대시보드
      analyze/                # AI 분석 (client + result + _actions + _radar-actions)
      trade/                  # 거래 평가 (analyze에서 prefill)
      virtual-trade/          # 가상 거래소 UI (order-actions, exchange-ui)
      journal/                # 저널 + AI 복기
      dashboard/              # 복기 통계 + 분석 기록
      market/                 # 시장 위젯
      admin/                  # 어드민 (users, activity, system) — ADMIN_EMAILS 가드
      settings/ · credits/ · account/ · guide/
  components/  ui/ · app/ · trade/ · analyze/
  lib/
    analysis/                 # ★ 도메인 핵심 (아래 §5)
    grading.ts · sizing.ts · money-management.ts · market-context.ts
    backtest/ (simulator, metrics) · simulation/ (monte-carlo)
    supabase/ · i18n/ · admin/ · notify*.ts · crypto.ts · live-guards.ts
  types/  ·  middleware.ts (/app/* 보호)
supabase/migrations/          # 0001 ~ 0040
scripts/                      # 백테스트·검증·백필 하니스 20+
```

---

## 5. 핵심 ① AI 분석 파이프라인

3단계 + 1단계 정리. **결정론(코드) → LLM(가벼움) → LLM(메인) → 코드(저장)** 의 하이브리드.

### 5.1 Stage 1 — Market Data (코드, 결정론적)
파일: [`analyze.ts`](../src/lib/analysis/analyze.ts) `buildSnapshot()`
- Binance Futures: 멀티 TF klines(3개), 호가창, aggTrades, 펀딩비, OI, 24h ticker. CoinGecko: BTC 도미넌스. **전부 병렬 fetch**.
- 트레이딩 스타일에 따라 다른 TF를 가져옴 ([`style.ts`](../src/lib/analysis/style.ts)).
- 자체 계산: 스윙 포인트, FVG, Order Block, Liquidity Zone, Volume Profile(POC/VAH/VAL), Order Flow.
- **백테스트 지원**: `{ at: Date }` 옵션으로 과거 시점 스냅샷 재구성(모든 kline에 `endTime` → lookahead bias 방지). 라이브 전용 데이터(depth/펀딩 등)는 과거 시점에 null fallback.

### 5.2 Stage 2 — Strategy Agent (LLM, 가벼움)
파일: [`strategy.ts`](../src/lib/analysis/strategy.ts) `classifyStrategy()`
- 스냅샷을 보고 **5개 전략 중 1개** 선택: `trend_pullback` / `breakout` / `range_fade` / `reversal` / `wait`.
- 출력: `{ primary, direction, confidence, reasoning, rejected }`.
- 프롬프트가 **평범한 한국어**로 응답하도록 강제(전문 용어 금지). 시스템 프롬프트 `cache_control: ephemeral`로 캐싱.
- **레짐×전략 게이트**: 백테스트로 검증된 엣지에 맞춰 레짐별 기본 전략을 코드가 제약(`eligibility.regimeDefaultStrategy`). 횡보에서 검증 안 된 `range_fade`(페이드) 대신 `breakout`(박스 돌파) 유도.

### 5.3 Stage 3 — Scenario Generator (LLM, 메인)
파일: [`synthesize.ts`](../src/lib/analysis/synthesize.ts) `synthesizeAnalysis()`
- Strategy Agent 결과를 입력받아 시나리오를 그 전략 **안으로 제약**.
- 출력: `{ summary, structure, keyLevels, flow, scenarios[], actionNow, warnings }`.
- **스타일별 표준 손절/목표 범위 강제** (§6.3). 벗어나면 시나리오 거부.
- `enforceEntryProximity`가 진입가 vs 현재가 방향으로 `orderHint`(market/limit/stop) 산출 → 돌파 셋업은 역지정가(STOP)로 매핑.
- `max_tokens: 3000`(응답 잘림 방지). 차트 이미지 첨부 시 **보조 컨텍스트로만**, 데이터가 ground truth.
- **강건성**: JSON 파싱 실패 시 최대 2회 재시도([`json-extract.ts`](../src/lib/analysis/json-extract.ts)).

### 5.4 Stage 4 — Persist (코드)
파일: [`persist.ts`](../src/lib/analysis/persist.ts) `saveAnalysis()`
- 분석 완료 시 자동으로 Supabase `analyses` 저장. 대시보드/기록에 표시. `?load=<id>`로 복원.

### 5.5 AI 미가용 시 — 코드 폴백 (무중단 설계)
파일: [`code-scenario.ts`](../src/lib/analysis/code-scenario.ts), [`ai-outage.ts`](../src/lib/analysis/ai-outage.ts)
- `buildCodeReport(snapshot)`: 방향=추세, 손절=MTF ATR% clamp, 목표=손절×R:R min. 진입/손절/목표/방향만 제시(등급·사이징은 UI 계산).
- 2겹 방어: **Layer 1** = Anthropic 계정 Auto-reload / **Layer 2** = 폴백 + 운영자 텔레그램 알림(10분 스로틀).
- 폴백은 **분석 횟수 미차감** + `aiUnavailable` 플래그.
- **현재 프로덕션은 이 폴백 모드로 동작 중** (API 키 무효 상태, §11).

### 5.6 AI 원가·속도 계측
파일: [`ai-usage.ts`](../src/lib/analysis/ai-usage.ts) — 모델 단가표(sonnet $3/$15, haiku $1/$5, opus $5/$25 + 캐시 배율) + `meterCall`/`persistAiUsage`. 회당 $·ms·토큰을 `ai_usage_log`(마이그 0040)에 기록. 실 원가 실측은 키 복구 후.

---

## 6. 핵심 ② 의사결정 검증 로직

AI가 시나리오를 만들면, **코드가 그 거래의 품질을 등급·사이징으로 판정**한다.

### 6.1 marketAssessment — 등급 입력을 코드 사실로 계산
파일: [`market-assessment.ts`](../src/lib/analysis/market-assessment.ts)
등급 계산의 입력이 되는 5개 시장 "사실"을 **AI가 아니라 코드가 계산**한다 (설계 원칙: AI 독립):
- 추세 구조 (trendMetrics)
- 핵심 레벨과의 거리 (Volume Profile 레벨)
- 박스 내 위치 (VAL~VAH)
- 거래량 (flow 1분봉 매수 비율)
- 도미넌스 정렬 (altLong/ShortFavorable)

→ AI값을 코드값으로 덮어씀. 폴백도 동일 사용. **등급이 AI에 독립적이고, 실LLM/폴백 간 일관됨.**

### 6.2 등급 시스템 (A/B/C/D)
파일: [`grading.ts`](../src/lib/grading.ts). 점수 합계 → 등급:

| 점수 | 등급 | 의미 |
|------|------|------|
| ≥ 8 | **A** | 좋은 거래 |
| 5~7 | **B** | 조건부 진입 |
| 2~4 | **C** | 비추천 |
| ≤ 1 | **D** | 강한 자제 (원인별 분기) |

**가산 요소:** R:R ≥3(+3)/≥2(+2)/≥1.5(+1), 손절 기준 명확(+2), BTC 정렬(+1), 박스 회피(+1), 거래량 동반(+1), 자금관리·컨텍스트 통과(+2).
**감산 요소:** R:R 무효(-2), 손절폭 과도(-1), 목표 비현실(-1), BTC 충돌(-2), 박스 중간 진입(-2), 뉴스 직후(-1), 연속 손실(-2), 일일 한도 근접(-1).

**D급 분기 (`dCause`):** 계좌발(일일 한도/과노출) = "오늘은 보류"(firm) / 셋업발 = "고위험, 10% 축소(막지 않음)". 실거래 하드 차단([`live-guards.ts`](../src/lib/live-guards.ts))은 유지.

### 6.3 표준 손절/목표/R:R (수수료 차감 후 현실판)
파일: [`standards.ts`](../src/lib/analysis/standards.ts). 왕복 비용 가정 **0.075%**(테이커+메이커), 손절 절대 하한 **0.225%**(×3).

| 스타일 | 손절폭 | 목표폭 | 최소 R:R |
|--------|--------|--------|---------|
| 스캘핑 | 0.3~1.2% (MTF ATR 1.5~2배) | 0.4~2% | **1.3+** |
| 데이 | 0.7~1.5% | 1.5~3% | 1.5+ |
| 스윙 | 2~5% | 5~15% | 2+ |
| 포지션 | 5~15% | 15~50% | 3+ |

> 스캘핑 밴드는 6코인 ~2년 A/B 백테스트로 검증되어 갱신됨(§7). 데이·스윙·포지션은 미검증이라 현행 고정 %.

### 6.4 포지션 사이징 — 리스크 % 기반
파일: [`sizing.ts`](../src/lib/sizing.ts)
```
maxLoss = accountSize × allowedLossPct
riskPerUnit = |entry - stop|
quantity = floor(maxLoss / riskPerUnit × 10000) / 10000
positionSize = quantity × entry
```
**용어 통일:** 잃을 한도 · 노출 금액 · 매수 수량 · 필요 마진(=positionSize/leverage) · 실효 손익비(수수료 0.075% 차감 후 R).

### 6.5 자금 관리 자동 집계
파일: [`money-management.ts`](../src/lib/money-management.ts)
저널 DB에서 자동 집계(사용자 입력 없음): 오늘 거래 수·누적 R, 일일 손실 한도까지 남은 R, 진행 중 포지션·종목, 동일 코인 중복 진입 경고, 같은 방향 누적 노출 경고. → 등급 감산에 연결.

### 6.6 트레이딩 스타일
파일: [`style.ts`](../src/lib/analysis/style.ts)

| ID | 라벨 | HTF/MTF/LTF | VP TF |
|----|-----|------------|-------|
| `scalp` | 스캘핑 (수분~수시간) | 1H/15M/5M | 15M |
| `day` | 데이 (수시간~하루) | 4H/1H/15M | 1H |
| `swing` | 스윙 (며칠~수주) ⭐기본 | 1D/4H/1H | 4H |
| `position` | ~~포지션~~ **UI 숨김** (2026-07-13) | 1D/4H/1H | 1D |

> **position 숨김 사유**: 무기한 선물 × 수개월 보유는 구조 부적합(펀딩 누적 출혈) + `scenario_outcomes` 결정 13건 **전패**(승률 0%, 평균 −3.4R). 코드·타입·기존 데이터는 보존(레이더/분석 UI에서만 제외). 장기 수요는 **현물 적립(DCA) 모드**로 이관 — [DCA-모드-설계.md](DCA-모드-설계.md). 타깃 페르소나 정리: 코어 = 데이(하루 1~3회)·스윙(주 1~5회), 스캘핑은 레이더 보조, 포지션은 현물 영역.

---

## 7. 데이터 · 백테스트 근거

VECTA의 전략 로직은 감이 아니라 **백테스트로 검증된 것만 강제**한다. 검증 하니스는 `scripts/`에 상주하며 재실행 가능하다.

### 7.1 검증된 엣지 (게이트 통과)
- **강한 추세 추종 + 돌파(breakout)** — 검증된 엣지. 강한 추세에서는 역추세 시나리오를 억제.
- **추세 강도 = 레이더 선별 1순위** — 분석 291건으로 검증, **추세 방향만 98.4% 유효**, 다른 신호는 역효과. → 임의 가중치 금지, 추세 기반 확정.
- **스캘핑 ATR 상대 손절 + R:R 1.3** — 6코인 ~2년 A/B 백테스트에서 순R +0.067로 개선 검증 → 반영. (구 0.3~0.7%/RR2는 손절이 노이즈 대비 좁아 수수료 출혈)

### 7.2 검증 실패 → 강제하지 않음 (정직성)
- **횡보 레짐 페이드(range_fade)** — 스캘프·데이·스윙에서 손실. 폐기하고 돌파로 유도.
- **강한 지지/저항 페이드** — 포지션만 강도↑ 단조 개선(+0.038→+0.091R) 유망했으나 **워크포워드 미통과** → 현행 유지(등급 변경 없음).
- **데이·스윙·포지션 ATR 적응형 밴드** — 미검증 → 고정 % 유지.
- **진입 즉시화 자체** — 기대값 −0.013R(≈본전). 즉시 진입이 수익 동력이 아니라, 엣지는 "강도 필터"에 있음을 확인.

### 7.3 검증 하니스 (재실행 가능)
`scripts/` 내 주요 스크립트:
- `measure-bands.mjs` · `ab-bands.mjs` — 스타일별 손절 밴드 A/B
- `backtest-matrix.ts` · `backtest-trend-first.ts` · `backtest-detectors.ts` — 레짐×전략 엣지 매트릭스
- `backtest-range*.ts` · `backtest-strong-sr-fade.ts` — 횡보/페이드 검증
- `sim-immediate-entry.mjs` · `check-live-outcomes.ts` — 라이브/시뮬 사후검증
- `validate-radar-*.mjs` — 레이더 방향/규칙 검증

### 7.4 백테스트 시스템 (앱 내장)
파일: [`backtest/simulator.ts`](../src/lib/backtest/simulator.ts), [`backtest/metrics.ts`](../src/lib/backtest/metrics.ts)
- Walk-forward 봉별 진입 체결 → 손절/목표 체크. 같은 봉 동시 터치 시 보수적 손절 가정. MFE/MAE·보유 봉 수 기록. 진입 ±0.3% 허용.
- 분석 폼 [🟢 라이브][⏮ 백테스트] 토글 + KST 시점 피커. 백테스트는 자금/마켓 컨텍스트를 무시(가상 시뮬 격리).
- 몬테카를로([`monte-carlo.ts`](../src/lib/simulation/monte-carlo.ts)): 시나리오 도달 확률(목표/손절/미도달) + R 분포 + 낙폭. **부트스트랩 + 드리프트 0**(방향 예측 아님, winsorize).

---

## 8. 구현 현황 — 기능 인벤토리

전부 프로덕션 배포됨. (AI 실LLM만 키 이슈로 폴백 대기 — §11)

### 8.1 AI 분석 (`/app/analyze`)
- 3단계 파이프라인(§5). 심볼 + 스타일 + (선택) 자금/리스크 입력.
- 결과: 심플 우선 + "전문가 정보 보기" 펼치기. 시나리오 카드(등급 배지 + 방향 색상 배지 + 진입/손절/목표 + 사이즈).
- lightweight-charts 캔들에 진입/손절/목표 마커. PNG/Markdown/JSON 다운로드([`export.ts`](../src/lib/analysis/export.ts)).
- 자동 Supabase 저장 + 분석 기록(삭제 버튼 포함).

### 8.2 거래 평가 (`/app/trade`)
- 분석에서 prefill(심볼/방향/진입·손절·목표/스타일). 등급·사이징·마진 재계산.
- 시장 구조 체크리스트(AI 자동 채움) + 자금 관리 상태 + 시장 컨텍스트(BTC·펀딩).
- 주문유형 3-토글(시장가/지정가/역지정가), orderHint 자동 선택. 지정가 무효 시 원클릭 시장가 전환(R:R 재계산).

### 8.3 후보 레이더 (분석 페이지 상단)
파일: [`radar.ts`](../src/lib/analysis/radar.ts)
- "지금 볼 만한 코인" — **시총 상위 15 대장주(큐레이션 상수) 중 5개 선별** (2026-07 개편).
- **하드 게이트**: ① 변동성 밴드(ATR ≥ 손절하한×1.1 && ≤ 스타일 상한) ② R:R 도달 가능성(최소 R:R 목표폭이 예상 변동 콘 안).
- **랭킹(사전식)**: 진입 자리 근접(현재가↔POC/VAH/VAL 거리, ATR 배수) → 추세 강도(검증된 엣지) → BTC 레짐 정렬 → 신호 점수(타이브레이크).
- **BTC 항상 고정 + 랭킹 4개 = 최대 5**. 조건 미달이면 억지로 안 채움(정직). 랭킹은 score 컬럼에 인코딩(DB 정렬 = 선별 순서).
- 신호 칩: sweep/변동성 수축/매물대/펀딩/거래량/24h 극단 + 강한 추세. 스타일별 4 TF 점수화 + 긴-TF 핸디캡으로 best-style.
- 추세 방향/강도 칩, 예상폭 콘(몬테카를로). 클릭 → 심볼+스타일 carry-over(수동 [분석 실행], AI 크레딧 보호).
- 같은 소스를 가상거래 코인 선택기·홈 "주목 후보"도 사용. `scan-radar` cron 10분 주기.

### 8.4 저널 + AI 복기 (`/app/journal`)
- 진입 입력 + 진입 시 평가(등급/점수/RR) 저장. 결과(청산가/실현 R/청산 사유/실수 태그/노트).
- AI 복기 코칭([`anthropic.ts`](../src/lib/anthropic.ts)). 실거래/가상거래/백테스트 **3탭**(모드 필터).
- STOP(역지정) 배지, 미체결 예약 취소, 손절/목표 정산 cron.

### 8.5 대시보드 (`/app/dashboard`)
- 복기 통계 + 분석 기록. 월별 차트(recharts). 모드 필터.

### 8.6 가상 거래소 (`/app/virtual-trade`)
- 가상(paper) 지갑 vUSDT. 주문(시장/지정/역지정), 대기 주문 체결기([`limit-order-filler.ts`](../src/lib/limit-order-filler.ts)).
- 청산가(대략·Isolated), 미실현 손익.

### 8.7 어드민 (`/app/admin`)
- 접근 제어: **ADMIN_EMAILS 환경변수 화이트리스트**(MVP). service-role 호출 전 재검증.
- 5페이지: 대시보드 / 회원 목록·검색 / 회원 상세 + 4액션(AI 크레딧 부여·vUSDT 입금·초기화·계정 비활성화) / 활동 타임라인 / 시스템(cron·AI 사용량·env 점검).
- 감사 로그(`admin_audit_logs`, service-role 전용).

### 8.8 알림
파일: [`notify.ts`](../src/lib/notify.ts), [`notify-dispatch.ts`](../src/lib/notify-dispatch.ts)
- Telegram Bot + Discord Webhook. 이벤트별 토글(D급 경고·연속 손실·AI 복기 완료·일일 요약·분석 타이밍).
- 텔레그램 deep-link 자동 폴링 연결. 분석 타이밍 알림(6개 시각 체크박스, cron 10분).

### 8.9 시장 위젯 (`/app/market`)
파일: `src/lib/market-widgets/*`
- 도미넌스, 알트시즌, 펀딩 롱숏, 김프, DeFi TVL, 스테이블캡, 공포탐욕(FnG), FX/DXY, 캘린더, 자본 흐름 등.

### 8.10 국제화 (i18n)
파일: `src/lib/i18n/*`
- 한/영 지원. 쿠키 기반 로케일. lib/LLM 코드 기반 번역 패턴. 앱 전체 + 공개 페이지 + AI 분석 LLM 로케일 분기.

### 8.11 결제/크레딧
- 크레딧 시스템 기초 존재(`/app/credits`, `/app/deposit`). **유료 구독 결제 연동은 미착수**(§12).

---

## 9. 데이터 모델

Supabase Postgres + **RLS(본인 행만 접근)** 기본. 마이그레이션 40개(`0001`~`0040`), 전부 Cloud 적용 완료. **dev와 prod가 동일 Supabase 프로젝트를 공유**(주의 §11).

### 9.1 핵심 테이블

| 테이블 | 역할 | 마이그 |
|--------|------|--------|
| `profiles` | 사용자 프로필, 기본값, disabled | 0001, 0012, 0029 |
| `trades` | 진입 입력 + 진입 평가(pre_grade/score/rr) + 결과(exit/result_r/reason/mistake_tags) + AI 복기 | 0001, 0003~04, 0038 |
| `analyses` | 분석 결과 영구 저장(snapshot/strategy/report JSONB + 빠른조회 컬럼) | 0002, 0027 |
| `scenario_outcomes` | 시나리오 사후 추적(trend_strength/classification) | 0023~24, 0039 |
| `radar_candidates` | 후보 레이더 스캔 결과(best_style/trend/atr) | 0031~34, 0037 |
| `paper_wallets` | 가상 지갑 vUSDT(통합) | 0005, 0010 |
| `pending_limit_orders` | 대기 지정/역지정 주문(order_kind) | 0006, 0035 |
| `notification_channels` | telegram/discord + 이벤트 토글 + 분석 타이밍 | 0001, 0026, 0030 |
| `notification_log` | 알림 발송 기록 | 0001 |
| `admin_audit_logs` | 어드민 액션 감사(service-role 전용) | 0029 |
| `ai_usage_log` | AI 회당 원가·토큰·ms | 0040 |
| `kimchi_history` | 김프 스냅샷(레거시 차익거래) | 0021 |

### 9.2 정리/보류된 기능 (DB 보존)
- **게임(binary)·김프 차익거래·랭킹**: 네비/UI에서 제거, 일부 코드 삭제. 라우트·`lib/arbitrage`·관련 DB 테이블은 **보존**(완전 삭제 시 별도 drop 마이그레이션 필요).

### 9.3 절대 변경 금지 상수
- `crypto.ts` `KEY_SALT = "alpha-gate.v1"` — 바꾸면 저장된 API 키 복호화 파손.
- `analysis-store` persist 키.

---

## 10. 주요 의사결정 이력

설계가 지금 모습이 된 이유(협업자가 "왜 이렇게?"를 묻지 않도록):

1. **레이아웃**: 상단 탑바 → 좌측 고정 사이드바(트레이딩 도구 표준).
2. **브랜드**: TradeGate → Alpha Gate → **VECTA**(Victor Alpha 블로그와 통합).
3. **로고**: 단순 A자 → 두 겹 셰브론 → **속빈 삼각형 + 상승 화살표**(VECTA). 워드마크 단독 락업.
4. **AI 분석**: 차트 이미지 단독 X → **데이터 기반 + 이미지 보조**(정확도).
5. **에이전트 구조**: Single LLM call → **3 stage 분리**(Data→Strategy→Scenarios).
6. **AI vs 코드 경계**: 등급을 AI가 채우던 것 → **등급 입력을 코드 사실로 계산**(Victor 지적: "AI는 시나리오 생성이지 등급 결정 안 한다"). AI 독립성 확보.
7. **AI 장애 대응**: 에러로 중단 → **코드 폴백 + 운영자 알림 + 횟수 미차감**(무중단).
8. **결과 페이지**: 전부 노출 → **심플 우선 + 펼치기**.
9. **결과 저장**: sessionStorage만 → **자동 Supabase 영구 저장**.
10. **언어**: 전문 용어 → **평범한 한국어 강제**(프롬프트).
11. **전략 선택**: 임의 가중치 → **백테스트 검증된 엣지만 강제**(레짐×전략 매트릭스).
12. **수수료**: 정가 % → **실현 %(수수료 0.075% 차감) 병기**.
13. **D급 UX**: "매매 금지" → 원인별 분기 "강한 자제/오늘 보류"(실거래 하드 차단은 유지).
14. **디자인 팔레트**: 다크 바이올렛 → **라이트 우선 모노크롬(Apple식)**, 손익만 green/red 예외.
15. **수익화**: 크레딧 판매 X → **유료 구독 + 구독 내 분석 횟수 제한**. AI는 품질용 Sonnet 유지.

---

## 11. 알려진 이슈 · 기술 부채 · 리스크

### 11.1 🔴 최우선 (기능 영향)
- **`ANTHROPIC_API_KEY` 무효(401)** — 로컬·프로덕션 둘 다. 지금 모든 분석은 **코드 폴백**(무중단이지만 AI 시나리오 품질은 안 나옴). **조치:** 새 키 발급(console.anthropic.com) → Vercel(Production) + `.env.local` 교체 → 재배포. 복구 후 `count_tokens`로 유효성 검증.

### 11.2 인프라 함정 (운영 필수 지식)
- **Vercel 자동배포 끊김** (2026-06-02~): GitHub App이 repo 접근 상실 → main push해도 배포 안 됨. **우회:** `cd D:/web01; vercel --prod` 수동(`.vercelignore` 필수). 근본 해결: 대시보드 Settings→Git 재연결.
- **dev = prod Supabase 공유**: 로컬 코드를 배포 안 하면 prod cron(10분)이 옛 코드로 같은 테이블을 덮어씀. → 스키마·cron 변경 시 반드시 배포.
- **Claude Code dev 서버 env**: Claude Code가 `ANTHROPIC_API_KEY=""`(빈 문자열)를 자식 프로세스에 export → Next.js가 빈 값을 잡음. **별도 PowerShell 창에서 `pnpm dev`** 실행해야 AI 동작.
- **D: 드라이브 exFAT**: pnpm symlink 불가 → `.npmrc`에 `node-linker=hoisted`.

### 11.3 보안 (인지된 부채)
- **Supabase Secret Key 폐기·재발급 보류** — 사용자가 "개발 우선"으로 의도적 보류. 노출 위험 인지 상태.
- 지원 이메일 `hello@alphagate.app` 등 17곳 미교체(VECTA 도메인 확정 후).
- 법적문서 운영주체명 "VECTA" — 실제 사업자 상호 확정 시 교정.

### 11.4 기술 부채 (기능엔 무해)
- Next.js 16: `middleware.ts` deprecated(`proxy.ts` 권장) — 경고만, 동작함.
- `app-shell`·`radar-panel` 등 기존 lint 경고(set-state-in-effect, Date.now purity) — 빌드 통과, 무관.
- 레이더 모바일 반응형(컬럼 많음 → 카드형 폴백 필요).
- lightweight-charts "Object is disposed" — 글로벌 핸들러 + ChartErrorBoundary로 차단됨.

---

## 12. 로드맵 & 다음 단계

### 12.1 즉시 (키 복구 후 순서)
1. 🔴 **API 키 발급 → 유효성 검증 → 재배포** (최우선).
2. `OPERATOR_TELEGRAM_CHAT_ID` + Anthropic Auto-reload 설정.
3. 실분석 돌려 `ai_usage_log` **실 원가 확인** → 구독료 설계.
4. 구독 → **분석 횟수 제한** 연동 + 크레딧 하드닝(fail-closed·선차감 환불).
5. 폴백 UI 배너(`aiUnavailable` 노출).

### 12.2 로드맵 (확정 방향)
> 순서: **백테스팅 시스템(진행 중) → 실거래 시스템 → 다중 포지션**

| 우선 | 작업 | 메모 |
|------|------|------|
| 1 | 실거래 시스템 (Bybit API) | API 키 암호화·출금 권한 거부·다중 포지션. 저널/대시보드 활용도 급증. 코드 기초 존재 |
| 2 | 유료 구독 + Toss 결제 | 수익화 |
| 3 | **현물 적립(DCA) 모드** | 포지션 스타일 대체 그릇. 4게이트(자산/밸류존/배분/규율) + 플랜 + 가상현물 연동. **설계 완료** → [DCA-모드-설계.md](DCA-모드-설계.md). AI 키 무관(전부 코드) · 구현 전 밸류존 백테스트 게이트 |
| 4 | 워치리스트 + 트리거 알림 | 시나리오 저장 → 가격 도달 시 텔레그램. retention 분기점. DCA 밸류존 알림과 기반 공유 |
| 5 | 셋업 템플릿("내 셋업 저장") | 가벼움 |
| 6 | 일일 리스크 한도 홈 게이지 + D급 자동 차단 | 거래 평가와 시너지 |

### 12.3 검증 후보 (선택)
- 포지션 강한 S/R 페이드 재도전(워크포워드 통과 목표).
- 데이·스윙·포지션 ATR 적응형 밴드(엣지 인지 LLM 백테스트 후).
- 저유동성 코인 universe 필터 강화.

---

## 13. 부록

### 13.1 환경변수 (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...   # Publishable(신 키 시스템)
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...            # Secret(서버 전용)
ANTHROPIC_API_KEY=sk-ant-api03-...                 # 🔴 현재 무효, 재발급 필요
TELEGRAM_BOT_TOKEN=                                # 알림(선택)
OPERATOR_TELEGRAM_CHAT_ID=                         # AI 장애 운영자 알림
CRON_SECRET=                                       # Cron 보호
ADMIN_EMAILS=cjstkdry@gmail.com                    # 어드민 화이트리스트
NEXT_PUBLIC_APP_URL=http://localhost:3002
```
> Supabase는 Anon/Service 대신 **Publishable/Secret** 신 키 시스템 사용(호환됨).

### 13.2 자주 쓰는 명령
```bash
pnpm dev                    # 개발 서버 (3000, 사용 중이면 3002) — 별도 PS 창에서!
pnpm build                  # 프로덕션 빌드
pnpm test                   # Vitest (현재 61종)
pnpm exec tsc --noEmit      # 타입체크
cd D:/web01; vercel --prod  # 수동 배포 (자동배포 끊김)
```
플랫폼: **Windows + PowerShell**(Bash도 가능).

### 13.3 용어집
- **레짐(regime)**: 시장 상태(추세/횡보 등). 전략 선택의 기준.
- **엣지(edge)**: 통계적으로 검증된 우위. VECTA는 검증된 엣지만 강제.
- **워크포워드**: 과거 구간 학습 → 이후 구간 검증. 과최적화 방지.
- **FVG / OB / Liquidity**: Fair Value Gap / Order Block / 유동성 구간(SMC 개념).
- **POC/VAH/VAL**: Volume Profile의 Point of Control / Value Area High·Low.
- **orderHint**: 진입가 vs 현재가 방향으로 산출한 주문 유형(market/limit/stop).
- **폴백(fallback)**: AI 미가용 시 코드가 대신 만드는 시나리오.

### 13.4 참고 문서
- 프로젝트 상시 컨텍스트: [`CLAUDE.md`](../CLAUDE.md)
- 소개 자료: `docs/intro`
- 검증 하니스: `scripts/`

---

> **면책:** 본 서비스는 투자 자문이 아닙니다. 모든 매매 결정과 결과는 사용자 본인의 책임입니다.
