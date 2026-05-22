# Alpha Gate — 내일 세션 시작 가이드

> 작성일: 2026-05-22 (오늘 진행 후)

---

## 🚨 내일 가장 먼저 할 일 (필수 1)

### ✅ Supabase 마이그레이션 2개 실행

배포는 성공했지만 **DB 테이블이 아직 안 만들어졌습니다**. 이거 안 하면 신규 기능들이 에러 납니다.

**Supabase Dashboard → SQL Editor → New query → 두 개 차례로 실행**:

#### 마이그레이션 1 — `0010_unified_vusdt.sql`
```sql
ALTER TABLE paper_wallets
  ADD COLUMN IF NOT EXISTS ai_credits INTEGER NOT NULL DEFAULT 5;

INSERT INTO paper_wallets (user_id, usdt_balance, starting_balance, ai_credits)
SELECT gw.user_id, COALESCE(gw.points, 0), COALESCE(gw.points, 0), 5
FROM game_wallets gw
LEFT JOIN paper_wallets pw ON pw.user_id = gw.user_id
WHERE pw.user_id IS NULL;

UPDATE paper_wallets pw
SET usdt_balance = pw.usdt_balance + COALESCE(gw.points, 0)
FROM game_wallets gw
WHERE pw.user_id = gw.user_id;

UPDATE game_wallets SET points = 0;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'signup_bonus', 'deposit', 'trade_lock', 'trade_settle',
    'game_bet', 'game_payout', 'ai_credit_purchase',
    'tournament_reward', 'admin_adjust'
  )),
  amount NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wtx_user_time ON wallet_transactions (user_id, created_at DESC);
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own wallet tx" ON wallet_transactions
  FOR SELECT USING (auth.uid() = user_id);
```

#### 마이그레이션 2 — `0011_rankings.sql`
```sql
CREATE TABLE IF NOT EXISTS ranking_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('game', 'trading', 'combined')),
  period_key TEXT NOT NULL,
  rank INT NOT NULL,
  score NUMERIC NOT NULL,
  reward NUMERIC NOT NULL,
  paid_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category, period_key)
);
CREATE INDEX IF NOT EXISTS idx_rr_period ON ranking_rewards (period_key);
CREATE INDEX IF NOT EXISTS idx_rr_user_paid ON ranking_rewards (user_id, paid_at DESC);
ALTER TABLE ranking_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ranking rewards" ON ranking_rewards
  FOR SELECT USING (auth.uid() = user_id);
```

> 참고: 0008(timeframe), 0009(next_candle)는 이전에 이미 실행한 것으로 추정. 안 했으면 `binary_games` 테이블에 `timeframe` 컬럼이 없어서 게임이 안 됨 → 게임이 정상이면 실행 완료된 것.

---

## ✅ 내일 두 번째 할 일 — 동작 확인

**https://alpha-gate.vercel.app/app** 접속 후 새 메뉴들 클릭:

| 메뉴 | URL | 확인할 것 |
|------|-----|---------|
| 내 지갑 | `/app/wallet` | vUSDT 잔액 + AI 크레딧 + 거래 내역 |
| 랭킹 | `/app/rankings` | 게임/트레이딩/통합 탭 동작 |
| ⚙️ 설정 → vUSDT 충전 | `/app/deposit` | AG 패키지 4개 표시 |
| ⚙️ 설정 → AI 크레딧 | `/app/credits` | 패키지 4개 (5/100/500/1000회) |
| 가격 예측 게임 | `/app/game` | 캔들 차트 + 페이즈 배너 |

문제 있는 메뉴 알려주시면 디버깅.

---

## 📋 다음 작업 후보 (우선순위 순)

### 1. 내 거래 + 성과 분석 페이지에 게임 데이터 통합
- 현재 두 페이지가 가상 트레이딩(`trades` 테이블)만 보여줌
- 게임 데이터(`binary_games`)까지 통합 필요
- **방향**: 탭 분리 (거래/게임/전체) + 통합 KPI 카드
- 자세한 설계: 이전 채팅 참고

### 2. 보너스 시스템
- 데일리 로그인 보너스 (매일 +10 vUSDT, 7일 연속 +100)
- 첫 거래 보너스 (+50 vUSDT)
- 친구 초대 (가입 시 양쪽 +200 vUSDT)
- 레벨 시스템 (거래/게임 횟수 기반 마일스톤)

### 3. 실제 결제 연동 (현재 MVP는 모의 충전)
- 토스 / 카드 / USDT 입금 PG 연동
- 환율: 1 AG = 1 USDT(실제) = 1,000 vUSDT(플랫폼)

### ✅ ~~Pro 업그레이드 후 cron 복구~~ (2026-05-22 완료)
- Vercel Pro 전환 완료. cron 3종(resolve-trades / sync-exchange-orders / fill-limit-orders)을 `*/5 * * * *`로 복구.
- 함수 타임아웃 `maxDuration = 60` 명시 (AI 분석/복기 + cron 3종).
- 중복 생성됐던 `web01` Vercel 프로젝트 삭제 + 로컬 `.vercel/` link 정리.

---

## 🛠 오늘 완료한 주요 작업 (Phase 1~4)

### Phase 1 — 통합 vUSDT 지갑 + AI 크레딧 차감
- `paper_wallets`에 `ai_credits` 컬럼
- `game_wallets.points` → `paper_wallets.usdt_balance` 흡수
- `wallet_transactions` 원장 테이블
- 게임/트레이딩 모두 단일 vUSDT 잔액 사용
- AI 분석 1회 = 1 크레딧 차감 (신규 가입 5개 무료)
- UI 라벨 "USDT"/"pt" → "vUSDT" 통일

### Phase 2 — AI 크레딧 구매 페이지 (`/app/credits`)
| 패키지 | 회수 | 가격 |
|--------|------|------|
| 스타터 | 5회 | 10 vUSDT |
| 베이직 | 100회 | 1,000 vUSDT |
| 프로 | 500회 | 5,000 vUSDT |
| VIP | 1,000회 | 10,000 vUSDT |

### Phase 3 — AG 충전 페이지 (`/app/deposit`)
환율: **1 AG = 1 USDT(실제) = 1,000 vUSDT**

| 패키지 | AG | vUSDT (보너스 포함) |
|--------|-----|------|
| 시작 | 1 AG | 1,000 |
| 베이직 | 10 AG | 10,000 |
| 프리미엄 | 50 AG | 55,000 (+10%) |
| VIP | 200 AG | 240,000 (+20%) |

> MVP는 모의 결제 (버튼 누르면 즉시 입금)

### Phase 4 — 랭킹 시스템 (`/app/rankings`)
- **카테고리**: 게임 / 트레이딩 / 통합
- **기간**: 일간 / 주간 / 월간 / 전체
- **점수**: vUSDT PnL 기준
- **주간 보상** (매주 월요일 00:00 KST 자동):
  - 게임/트레이딩 각 카테고리: 1등 1,000 / 2등 500 / 3등 300 / 4~10등 각 100
  - 통합: 1등 3,000 / 2등 1,500 / 3등 800 / 4~10등 각 300
  - 총 주간 지급: 12,500 vUSDT

### 통합 지갑 페이지 (`/app/wallet`)
- vUSDT 잔액 + AI 크레딧 카드
- vUSDT 사용처 4개 바로가기
- 최근 거래 내역 20건 (`wallet_transactions` 기반)

### 가격 예측 게임 풀 개편
- 3컬럼 레이아웃 (히스토리/차트/컨트롤)
- 라이브 캔들스틱 차트 (lightweight-charts)
- 페이즈 배너 (베팅가능 → 마감임박 → 캔들시작대기 → 캔들진행중 → 정산중)
- 베팅 마감 5초 전 자동 차단
- **다음 캔들 시가→종가 판정** (베팅 시점 무관 공정)
- 1m/3m 시간 선택
- 진입가 점선이 실제 캔들 시가에 정확히 일치 (off-by-one 버그 수정)

---

## 🚀 배포 환경 정보

- **프로덕션**: https://alpha-gate.vercel.app
- **Vercel 프로젝트**: `victor-alpha/alpha-gate`
- **GitHub repo**: `Victor-wonderful/alpha-gate`
- **Vercel 플랜**: **Pro** (2026-05-22 업그레이드)
- **main 최신 커밋**: `3b66274 perf: maxDuration=60 — Pro 플랜 활용해 함수 타임아웃 확장`
- **자동 배포**: ✅ 정상

### Cron 현황 (`vercel.json`) — Pro 기준
| Cron | Schedule | 비고 |
|------|---------|------|
| daily-digest | `0 0 * * *` | 매일 자정 |
| resolve-trades | `*/5 * * * *` | 5분마다 — 페이퍼 트레이드 정산 |
| sync-exchange-orders | `*/5 * * * *` | 5분마다 — 실거래 주문 동기화 |
| fill-limit-orders | `*/5 * * * *` | 5분마다 — 지정가 주문 체결 |
| distribute-rankings | `0 15 * * 0` | 매주 일요일 15:00 UTC = 월요일 00:00 KST |

### 함수 타임아웃 (`maxDuration`)
| 라우트 | 값 | 이유 |
|---|---|---|
| `/app/analyze` (page) | 60s | Claude Sonnet + 차트 이미지, 20-40s 가능 |
| `/app/journal/[id]` (page) | 60s | AI 복기 코칭 |
| `/api/cron/sync-exchange-orders` | 60s | 최대 200건 거래소 주문 순차 처리 |
| `/api/cron/resolve-trades` | 60s | 페이퍼 트레이드 정산 |
| `/api/cron/fill-limit-orders` | 60s | 지정가 주문 체결 |
| `/api/cron/distribute-rankings` | 60s | 주간 랭킹 보상 분배 |

### 환경변수 확인 사항
- `CRON_SECRET`: 설정돼있어야 cron route 동작 (이미 설정됨)
- 다른 기존 변수들은 그대로

---

## 🐛 오늘 해결한 문제 기록

1. **off-by-one 버그**: 진입가가 캔들 시가와 1ms 어긋남 → `currentCandle.openTime + tfMs`로 정확히 계산
2. **placeholder 진입가**: 베팅 직후 임시 가격이 그대로 표시됨 → LiveChart가 실제 캔들 시가를 콜백으로 전달, 캔들 시작 후 갱신
3. **자동 배포 멈춤**: `*/5 * * * *` cron이 Hobby 플랜 위반 → daily로 변경, 자동 배포 정상화 (이후 Pro 전환으로 5분 주기 복구)
4. **Vercel 중복 프로젝트**: 폴더명 `D:\web01\` 때문에 `web01`이라는 별도 Vercel 프로젝트가 잘못 생성되어 같은 레포에서 이중 빌드. `web01` 삭제 + 로컬 `.vercel/` 제거로 정리
5. **AI 분석 잠재 타임아웃**: Hobby 10초 한도에서 Claude 호출이 잘릴 위험 있던 라우트들에 `maxDuration = 60` 명시

---

## 🔧 자주 쓰는 명령어

### 새 코드 배포
```powershell
cd D:\web01
git add .
git commit -m "feat: ..."
git push origin main
# → Vercel 자동 배포 (1~3분)
```

### 로컬 dev 서버
```powershell
cd D:\web01
pnpm dev
# → localhost:3002
```

### Vercel CLI는 사용하지 마세요
- 잘못된 별도 프로젝트(`web01`)를 만들 위험
- 자동 배포가 정상이므로 불필요

### 잘못된 Vercel link 정리 (필요 시)
```powershell
cd D:\web01
Remove-Item -Recurse -Force .vercel
```

---

## 💬 내일 첫 메시지 추천

> "/init NEXT_SESSION.md 읽고 시작해줘. 마이그레이션 0010, 0011 실행했어 (또는 안 했어). 다음 작업으로 [원하는 것] 하자."

또는 그냥 자연스럽게:
> "어제 작업 이어가자. 마이그레이션 실행했어. 다음에 뭐 할까?"
