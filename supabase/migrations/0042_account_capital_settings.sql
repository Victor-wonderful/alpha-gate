-- "내 자금" 설정 — 실거래 계좌(배정액) / 가상 계좌 이원화 + 활성 모드.
-- 배경: 모든 위험 계산(노출%·청산여유·등급)이 "내 자금이 얼마냐"에서 출발하는데,
--   지금은 설정 화면이 없고 default_account_size 가 조용히 10000으로 깔림.
--   실거래는 API 잔액 중 "트레이딩 배정액"만 위험 기준으로 삼는다.

ALTER TABLE profiles
  -- 활성 계좌 모드: 앱 전체가 이 모드 기준으로 자금·위험을 계산.
  ADD COLUMN IF NOT EXISTS account_mode TEXT NOT NULL DEFAULT 'virtual'
    CHECK (account_mode IN ('real', 'virtual')),
  -- 실거래 배정 방식: 금액(amount) 또는 잔액 대비 비율(pct)
  ADD COLUMN IF NOT EXISTS real_alloc_type TEXT NOT NULL DEFAULT 'amount'
    CHECK (real_alloc_type IN ('amount', 'pct')),
  ADD COLUMN IF NOT EXISTS real_alloc_amount NUMERIC,        -- 배정 금액(USDT)
  ADD COLUMN IF NOT EXISTS real_alloc_pct NUMERIC,           -- 배정 비율(%, 0~100)
  -- 실거래 잔액 캐시(설정 화면/주기적 갱신) — 매 페이지마다 거래소 호출 안 하려고.
  ADD COLUMN IF NOT EXISTS real_balance_cached NUMERIC,
  ADD COLUMN IF NOT EXISTS real_balance_cached_at TIMESTAMPTZ;

-- default_account_size 는 이제 "가상 계좌 자금"의 의미로 재사용(기존 값 보존).
COMMENT ON COLUMN profiles.default_account_size IS
  '가상 계좌 자금(USDT). 가상 모드의 위험/등급 계산 기준.';
COMMENT ON COLUMN profiles.account_mode IS
  'real=실거래 배정액 기준, virtual=가상 자금 기준. 앱 전체 자금 계산의 단일 기준.';
