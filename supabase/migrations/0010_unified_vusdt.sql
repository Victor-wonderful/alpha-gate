-- 0010_unified_vusdt.sql
-- vUSDT 통합: paper_wallets를 단일 진실의 원천(SSOT)으로 확립
-- game_wallets.points → paper_wallets.usdt_balance 통합
-- wallet_transactions 원장 테이블 신설

-- 1. paper_wallets에 ai_credits 컬럼 추가
ALTER TABLE paper_wallets
  ADD COLUMN IF NOT EXISTS ai_credits INTEGER NOT NULL DEFAULT 5;

-- 2. 기존 game_wallets 유저 중 paper_wallets가 없는 유저 → upsert (초기 잔액 = 기존 포인트)
INSERT INTO paper_wallets (user_id, usdt_balance, starting_balance, ai_credits)
SELECT
  gw.user_id,
  COALESCE(gw.points, 0),
  COALESCE(gw.points, 0),
  5
FROM game_wallets gw
LEFT JOIN paper_wallets pw ON pw.user_id = gw.user_id
WHERE pw.user_id IS NULL;

-- 3. 이미 paper_wallets가 있는 유저는 기존 포인트를 vUSDT 잔액에 합산
UPDATE paper_wallets pw
SET usdt_balance = pw.usdt_balance + COALESCE(gw.points, 0)
FROM game_wallets gw
WHERE pw.user_id = gw.user_id;

-- 4. game_wallets.points는 호환 목적으로 컬럼 유지하되 0으로 리셋 (이후 사용 안 함)
UPDATE game_wallets SET points = 0;

-- 5. 거래 원장 테이블 (audit log — vUSDT 모든 입출금 기록)
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'signup_bonus', 'deposit', 'trade_lock', 'trade_settle',
    'game_bet', 'game_payout', 'ai_credit_purchase',
    'tournament_reward', 'admin_adjust'
  )),
  amount NUMERIC NOT NULL,         -- 음수=차감, 양수=입금
  balance_after NUMERIC NOT NULL,  -- 거래 후 vUSDT 잔액
  meta JSONB,                      -- 추가 컨텍스트 (game_id, trade_id 등)
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wtx_user_time ON wallet_transactions (user_id, created_at DESC);
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own wallet tx" ON wallet_transactions
  FOR SELECT USING (auth.uid() = user_id);
