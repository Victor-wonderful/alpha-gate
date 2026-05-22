# Alpha Gate — Project Context for Codex

> **이 파일은 매 세션마다 자동 로드됩니다.** 컨텍스트 압축 후에도 이 정보는 유지됩니다.

---

## 한 줄 소개

**"매매 전 의사결정 체크 + AI 분석"** — 암호화폐 트레이더가 진입 버튼을 누르기 전에 "이 거래를 해도 되는가"를 검증하게 만드는 도구.

핵심 메시지: "무엇을 살까"가 아니라 "이 거래를 해도 되는가"에 답하는 도구.

연계 자산: 사용자의 [Victor Alpha 블로그](https://victor-alpha-neon.vercel.app/) — 사이드바 하단에서 외부 링크로 연결.

---

## 기술 스택

| 영역 | 선택 |
|------|------|
| 프레임워크 | **Next.js 16.2.6** (App Router, TypeScript, Turbopack) |
| 스타일 | Tailwind v4 + 자체 UI 컴포넌트 + Geist 폰트 (Vercel) |
| DB / Auth | **Supabase** (Postgres + RLS + GoTrue) — Cloud, 셀프호스팅 옵션 열려있음 |
| AI | **`@anthropic-ai/sdk`**, model `Codex-sonnet-4-6`, **프롬프트 캐싱 필수** |
| 차트 | **lightweight-charts v5** (TradingView 오픈소스) + recharts (대시보드) |
| 마켓 데이터 | **Binance Futures 공개 API** (`fapi.binance.com`) + CoinGecko (BTC 도미넌스) |
| 상태 | Zustand (sessionStorage persist), TanStack Query |
| 폼 | react-hook-form + zod |
| 알림 | Telegram Bot API + Discord Webhook (직접 HTTP fetch) |
| 캡처/다운로드 | html-to-image (PNG 페이지 캡처) |
| 테스트 | Vitest (단위) — `pnpm test` |
| 배포 | Vercel + Vercel Cron (일일 요약) |

**중요한 의사결정 — Supabase Cloud 선택 (Docker 자체호스팅 X)**: 사용자 동의함. 락인 약함, 코드 그대로 셀프호스팅으로 옮겨갈 수 있음.

---

## 디렉터리 구조 (요약)

```
src/
  app/
    layout.tsx               // 루트 + 메타데이터 + favicon(icon.svg) + OG
    page.tsx                 // 랜딩 (비로그인)
    login/page.tsx           // Supabase Auth
    icon.svg                 // favicon (두 겹 셰브론 로고)
    opengraph-image.png      // 1200x630 OG
    app/                     // 로그인 보호 영역
      layout.tsx             // Sidebar wrapper
      page.tsx               // 홈 대시보드 (통계 + 시세 + 최근 거래)
      analyze/               // AI 분석
        page.tsx
        analyze-client.tsx   // 입력 폼 + 결과 표시
        analysis-result.tsx  // 결과 화면 (Simple + Advanced)
        _actions.ts          // runAnalysisAction, loadAnalysisAction
      trade/page.tsx         // 거래 평가 (analyze에서 prefill 받음)
      journal/               // 저널 + AI 복기
      dashboard/             // 복기 통계 + AI 분석 기록
      settings/notify/       // 알림 채널 설정
  components/
    ui/                      // Button, Card, Input, Select, etc.
    app/
      sidebar.tsx            // 좌측 고정 사이드바 + 모바일 드로어
      logo.tsx               // 두 겹 셰브론 SVG (글자 없음, 순수 기하)
    trade/
      trade-form.tsx         // 거래 입력 + 매매 평가 (with leverage)
      result-panel.tsx       // 우측 결과 패널 (등급, 사이징, 마진)
      grade-badge.tsx        // A/B/C/D 색상 배지
      tradingview-widget.tsx
    analyze/
      scenario-chart.tsx     // lightweight-charts 캔들 + 진입/손절/목표
      chart-error-boundary.tsx
      download-buttons.tsx   // PNG / Markdown / JSON 다운로드
  lib/
    grading.ts               // 매매 등급 계산 (A/B/C/D)
    sizing.ts                // 포지션 사이징 (리스크 % 기반)
    utils.ts                 // cn(), formatNumber, formatCurrency
    supabase/
      server.ts              // createServerClient (RSC)
      client.ts              // createBrowserClient (Client)
      service.ts             // service-role (서버 전용)
    analysis/
      binance.ts             // Binance Futures API client
      smc.ts                 // 스윙/FVG/OB/Liquidity 감지
      volume-profile.ts      // POC/VAH/VAL 계산
      order-flow.ts          // 체결 흐름, 호가 임밸런스, 펀딩 분류
      analyze.ts             // buildSnapshot() — 데이터 수집 + 패턴 계산
      strategy.ts            // classifyStrategy() — Strategy Agent (LLM)
      synthesize.ts          // synthesizeAnalysis() — Scenario Generator (LLM)
      persist.ts             // saveAnalysis() / loadAnalysis()
      style.ts               // 트레이딩 스타일 프리셋 (scalp/day/swing/position)
      standards.ts           // 스타일별 표준 손절/목표/RR + 체크 함수
      export.ts              // Markdown/JSON exporter
      json-extract.ts        // 강건한 JSON 파서
    anthropic.ts             // AI 복기 코칭 (저널)
    notify.ts                // Telegram/Discord 어댑터
    notify-dispatch.ts       // 이벤트 → 채널 디스패치
    stores/
      analysis-store.ts      // Zustand + sessionStorage persist
  types/
    trade.ts                 // TradeInput, Grade, MARKET_CHECK_KEYS 등
  middleware.ts              // /app/* 보호 (Supabase 세션 검증)
supabase/
  migrations/
    0001_init.sql            // profiles, trades, notification_channels, notification_log + RLS
    0002_analyses.sql        // analyses + RLS
samples/
  generate_chart_sample.py   // matplotlib 차트 샘플 생성
  generate_og.py             // OG 이미지 생성
```

---

## 환경변수 (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...   # 새 키 시스템 (Publishable)
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...            # 새 키 시스템 (Secret) — 서버 전용
ANTHROPIC_API_KEY=sk-ant-api03-...                 # AI 분석/복기
TELEGRAM_BOT_TOKEN=                                # 알림용 (선택)
CRON_SECRET=                                       # 일일 요약 Cron 보호
NEXT_PUBLIC_APP_URL=http://localhost:3002          # 알림 링크용
```

**Supabase 키 시스템 주의**: Anon/Service 대신 Publishable/Secret 사용 중. 그대로 호환됨.

---

## 자주 쓰는 명령

```bash
pnpm dev                    # 개발 서버 (localhost:3000, 사용 중이면 3002)
pnpm build                  # 프로덕션 빌드
pnpm test                   # Vitest 단위 테스트
pnpm exec tsc --noEmit      # 타입체크만
```

**플랫폼: Windows + PowerShell**. Bash도 사용 가능.

**중요**: `node_modules`는 hoisted 모드로 설치됨 (D: 드라이브 exFAT라 심볼릭 링크 안 됨). `.npmrc`에 `node-linker=hoisted` 명시.

---

## AI 분석 파이프라인 (핵심 도메인)

3단계 + 1단계 정리:

### Stage 1 — Market Data (코드, 결정론적)

[`analyze.ts:buildSnapshot()`](src/lib/analysis/analyze.ts)

- Binance Futures: 멀티 TF klines (3개), 호가창, aggTrades, 펀딩비, OI, 24h ticker
- CoinGecko: BTC 도미넌스
- 모두 병렬 fetch (Promise.all)
- 트레이딩 스타일에 따라 다른 TF 가져옴 ([`style.ts`](src/lib/analysis/style.ts))
- 자체 계산: 스윙 포인트, FVG, Order Block, Liquidity Zone, Volume Profile (POC/VAH/VAL), Order Flow

### Stage 2 — Strategy Agent (LLM, 가벼움)

[`strategy.ts:classifyStrategy()`](src/lib/analysis/strategy.ts)

- 스냅샷 보고 **5개 전략 중 1개** 선택: `trend_pullback` / `breakout` / `range_fade` / `reversal` / `wait`
- 출력 JSON: `{ primary, direction, confidence, reasoning, rejected }`
- 프롬프트는 평범한 한국어로 응답하도록 강제 (전문 용어 금지)
- 시스템 프롬프트 `cache_control: ephemeral`로 캐싱

### Stage 3 — Scenario Generator (LLM, 메인)

[`synthesize.ts:synthesizeAnalysis()`](src/lib/analysis/synthesize.ts)

- Strategy Agent의 결과를 입력으로 받음 (시나리오를 그 전략 안으로 제약)
- 출력 JSON: `{ summary, structure, keyLevels, flow, scenarios[], actionNow, warnings }`
- 시나리오에 `marketAssessment` 자동 채움 (거래 평가 prefill용)
- max_tokens: 3000 (응답 자름 방지)
- **스타일별 표준 손절/목표 범위 강제** (스캘핑 R:R 2+, 스윙 2+ 등)
- 차트 이미지 첨부 시: 보조 컨텍스트로만 사용, 데이터가 ground truth

### Stage 4 — Persist (코드)

[`persist.ts:saveAnalysis()`](src/lib/analysis/persist.ts)

- 분석 완료 시 자동으로 Supabase `analyses` 테이블에 저장
- 대시보드 / 분석 기록에 표시
- `?load=<id>` 쿼리로 복원 가능

---

## 트레이딩 스타일 (4개)

[`style.ts`](src/lib/analysis/style.ts)

| ID | 라벨 | HTF/MTF/LTF | Volume Profile TF |
|----|-----|------------|-------------------|
| `scalp` | 스캘핑 (수분~수시간) | 1H / 15M / 5M | 15M |
| `day` | 데이 (수시간~하루) | 4H / 1H / 15M | 1H |
| `swing` | 스윙 (며칠~수주) ⭐ 기본 | 1D / 4H / 1H | 4H |
| `position` | 포지션 (수주~수개월) | 1D / 4H / 1H | 1D |

---

## 표준 손절/목표/RR (수수료 차감 후 현실판)

[`standards.ts`](src/lib/analysis/standards.ts)

- 왕복 비용 가정: **0.12%** (BTC/ETH 기준, 시장가 + 슬리피지)

| 스타일 | 손절폭 | 목표폭 | 최소 R:R |
|--------|--------|--------|---------|
| 스캘핑 | 0.3~0.7% | 0.7~1.5% | 2+ |
| 데이 | 0.7~1.5% | 1.5~3% | 1.5+ |
| 스윙 | 2~5% | 5~15% | 2+ |
| 포지션 | 5~15% | 15~50% | 3+ |

Strategy Agent + Scenario Generator 둘 다 이 범위를 강제. 벗어나면 `wait` 또는 시나리오 거부.

---

## 등급 시스템

[`grading.ts`](src/lib/grading.ts)

점수 합계 → 등급:
- ≥ 8: **A** (좋은 거래)
- 5~7: **B** (조건부 진입)
- 2~4: **C** (비추천)
- ≤ 1: **D** (거래 금지)

플러스 요소:
- 손익비 ≥3: +3, ≥2: +2
- 손절 기준 명확 (지지/저항 + 구조): +2
- BTC 정렬: +1
- 박스 회피: +1
- 거래량 동반: +1
- 심리 체크 전부 통과: +2

마이너스 요소:
- 손익비 구조 무효: -2
- 손절폭 과도: -1
- 목표 비현실적: -1
- BTC 충돌: -2
- 박스 중간 진입: -2
- 뉴스 직후: -1
- 연속 손실: -2
- 심리 2개 이상 미충족: -1

---

## 포지션 사이징 — 리스크 % 기반

[`sizing.ts`](src/lib/sizing.ts)

```ts
maxLoss = accountSize × allowedLossPct
riskPerUnit = |entry - stop|
quantity = floor(maxLoss / riskPerUnit × 10000) / 10000
positionSize = quantity × entry
```

**용어 통일** (UI에서):
- "잃을 한도" = 거래당 리스크 % 및 절대 금액
- "노출 금액" = positionSize (계좌 대비 %)
- "매수 수량" = quantity (코인 개수)
- "필요 마진" = positionSize / leverage (계좌 대비 %)
- "실효 손익비" = 수수료 0.12% 차감 후 R

---

## DB 스키마 핵심

### `trades` ([migration 0001](supabase/migrations/0001_init.sql))
- 진입 입력 + 진입 시 평가 (pre_grade, pre_score, pre_rr, pre_score_breakdown)
- 결과 (exit_price, result_r, exit_reason, mistake_tags, note, closed_at)
- AI 복기 (ai_coach_comment, ai_coach_generated_at)
- RLS: 본인 행만 접근

### `analyses` ([migration 0002](supabase/migrations/0002_analyses.sql))
- 분석 결과 영구 저장
- symbol/style/primary_strategy/strategy_direction/strategy_confidence/scenarios_count/current_price (빠른 조회용)
- snapshot/strategy/report JSONB (복원용)
- RLS: 본인 행만

### `notification_channels`
- telegram_chat_id, discord_webhook_url
- 이벤트별 토글 (enable_d_grade_warn, losing_streak, ai_coach_done, daily_digest)

### `notification_log`
- 모든 알림 발송 기록 (event, channel, status, error)

---

## 주요 디자인 결정 (역사)

1. **레이아웃**: 상단 탑바 → **좌측 고정 사이드바** 전환 (트레이딩 도구 표준)
2. **로고**: 단순 A자 → **두 겹 셰브론** (글자 없는 순수 기하)
3. **이름**: TradeGate → **Alpha Gate** (Victor Alpha 블로그와 통합)
4. **AI 분석**: 차트 이미지 단독 분석 X → **데이터 기반 + 이미지 보조** (정확도 차이)
5. **에이전트 구조**: Single LLM call → **3 stage 분리** (Data → Strategy → Scenarios)
6. **결과 페이지**: 모든 정보 노출 → **심플 우선 + "전문가 정보 보기" 펼치기**
7. **결과 저장**: sessionStorage만 → **자동 Supabase 영구 저장** + 대시보드 표시
8. **언어**: 전문 용어 직접 사용 → **평범한 한국어 강제** (Codex 프롬프트로)
9. **심리 체크리스트**: 양심에 의존 → (진행 중) **트리거 검증 + 자금 관리 + 시장 컨텍스트로 교체 예정**
10. **수수료 표시**: 정가 % 만 → **"실현" % (수수료 차감) 같이 표시**

---

## 코딩 스타일 / 컨벤션

- 한국어 UI 우선 (영어 약자 최소화)
- 숫자에 `font-mono` + `tabular-nums` 필수
- 컬러 토큰 사용 (`grade-a/b/c/d`, `primary`, `muted-foreground` 등). hex 직접 쓰지 말 것.
- 클라이언트 컴포넌트는 파일 최상단에 `"use client"`
- 서버 액션은 `_actions.ts` 패턴 (라우트별)
- 서버 전용 코드는 `import "server-only"` 또는 동등한 가드
- 환경변수 접근: 서버 코드에서만, `NEXT_PUBLIC_` 접두사는 클라이언트 노출 명시
- Supabase 호출: RLS로 보안. service role은 서버 액션에서만, cron 등 특수 케이스만

---

## 알려진 이슈 / 워크어라운드

1. **lightweight-charts "Object is disposed"** — 비동기 ResizeObserver가 dispose 후 fire. [`layout.tsx`](src/app/layout.tsx)의 인라인 스크립트가 글로벌 핸들러로 차단. + [ChartErrorBoundary](src/components/analyze/chart-error-boundary.tsx).

2. **D: 드라이브 exFAT** — pnpm symlink 안 됨. `.npmrc`에 `node-linker=hoisted`.

3. **Next.js 16 deprecation** — `middleware.ts` deprecated, `proxy.ts`로 이름 변경 권장. 현재 middleware 그대로 사용 중 (작동함, 경고만 뜸).

4. **Codex JSON 응답 잘림** — max_tokens 3000으로 상향 + 응답 길이 제한 명시. [`json-extract.ts`](src/lib/analysis/json-extract.ts)로 강건한 파싱.

---

## 🔖 다음 세션 시작 지점 (RESUME)

### 즉시 이어갈 작업: **거래 평가 페이지 재설계**

**컨텍스트**: 사용자가 "심리 체크리스트는 양심에 의존해서 무의미하다. 더 트레이더에게 도움 되는 걸로 바꾸자"고 요청. 제안 단계까지 끝났고 실구현은 아직 안 함.

**제안된 새 구조** (사용자 동의 받음):

1. **거래 입력** (그대로 유지) — 코인/방향/TF/진입가/손절가/목표가/계좌/리스크/레버리지
2. **시장 구조 체크리스트** (그대로 유지) — AI가 자동 채움, 사용자가 확인
3. ❌ **심리 체크리스트** (4개) — **삭제**
4. ❌ **뉴스 직후 / 연속 손실 플래그** — **삭제** (자동 감지로 대체)
5. ✨ **NEW: 트리거 검증** (3개 체크)
   - AI 시나리오의 trigger 문구 표시
   - "위 조건이 캔들로 확인됐다" 체크
   - "진입가 ±X% 안에서 거래" 자동 계산 + 추격 경고
   - "캔들 종가 확정" 체크
6. ✨ **NEW: 자금 관리 상태** (저널 DB 자동 집계, 사용자 입력 없음)
   - 오늘 거래 N건, 오늘 누적 R
   - 일일 손실 한도까지 남은 R (예: -2R 한도)
   - 진행 중 포지션 N건 + 종목 리스트
   - 동일 코인 중복 진입 경고
   - 같은 방향 누적 노출 % 경고
7. ✨ **NEW: 시장 컨텍스트** (Binance API 자동)
   - BTC 현재가 + 24h 변동
   - 펀딩비 + 다음 정산까지 시간
   - 펀딩 정산 ±10분 전 자동 경고

**등급 로직 영향**:
- 오늘 -1.5R 손실 + 신규 거래 시도 → 자동 -2점 (연속 손실)
- 동일 코인 진행 중에 또 진입 → 자동 -1점 (중복 노출)
- 진행 중 포지션이 계좌의 80% 넘으면 → 자동 -2점

**작업 파일들**:
- 수정: [src/components/trade/trade-form.tsx](src/components/trade/trade-form.tsx) — UI 재구성
- 수정: [src/lib/grading.ts](src/lib/grading.ts) — 자동 감지 입력 받도록
- 신규: 자금 관리 자동 집계 함수 (저널 쿼리)
- 수정: [src/app/app/trade/page.tsx](src/app/app/trade/page.tsx) — 자금 관리 데이터 서버에서 fetch

**예상 작업량**: 1일 (트리거 검증 2h + 자금 관리 3h + 시장 컨텍스트 2h + 등급 로직 1h)

### 보류된 작업 (나중에)

| 우선순위 | 기능 | 메모 |
|---|---|---|
| 보류 | **Supabase Secret Key 폐기** | 사용자가 "나중에 하자, 지금은 개발 우선" 결정. 키 노출 위험 인지하고 의도적 보류. |
| 1 | 일일 리스크 한도 (홈 게이지 + D급 자동 차단) | 거래 평가 재설계와 시너지 |
| 2 | 워치리스트 + 트리거 알림 (AI 분석 시나리오 저장 + 가격 도달 시 텔레그램) | retention의 분기점 |
| 3 | 거래소 API 연동 (자동 저널) | 저널·대시보드 활용도 5배 |
| 4 | 셋업 템플릿 ("내 셋업 저장") | 가벼움 |
| 5 | 거래 평가 단순화 후속 — 셋업별 동적 체크리스트 | UX 폴리시 |
| 5 | 분석 자동 저장에 "삭제 버튼" 추가 | UX 폴리시 |

### 사용자가 해야 할 환경 작업 (보류 중)

- `ANTHROPIC_API_KEY` 입력 (현재 비어있음, AI 분석 안 됨) — Anthropic Console에서 발급 후 `.env.local`
- Supabase Secret Key 폐기 + 재발급 (위 표 참고)
- `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL` 끝의 `/rest/v1/` 제거 (현재 잘못 들어가 있음, 작동은 하나 정상화 권장)

---

## 면책

본 서비스는 투자 자문이 아닙니다. 모든 매매 결정과 결과는 사용자 본인의 책임. (랜딩 페이지, AI 분석 결과, 모든 다운로드 파일에 명시)
