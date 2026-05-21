-- 랭킹 보상 지급 기록 (중복 지급 방지)
CREATE TABLE IF NOT EXISTS ranking_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('game', 'trading', 'combined')),
  period_key TEXT NOT NULL,  -- 예: 'weekly_2024-W12'
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
