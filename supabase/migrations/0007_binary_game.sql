-- 게임 포인트 지갑
CREATE TABLE IF NOT EXISTS game_wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  points NUMERIC NOT NULL DEFAULT 1000,
  total_games INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE game_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own game wallet" ON game_wallets
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 게임 기록
CREATE TABLE IF NOT EXISTS binary_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('call', 'put')),
  bet_points NUMERIC NOT NULL CHECK (bet_points >= 10),
  entry_price NUMERIC NOT NULL,
  entry_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  candle_close_time BIGINT NOT NULL,
  exit_price NUMERIC,
  won BOOLEAN,
  pnl_points NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'settled')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bg_user ON binary_games (user_id, status);
CREATE INDEX IF NOT EXISTS idx_bg_pending ON binary_games (status, candle_close_time);
ALTER TABLE binary_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own binary games" ON binary_games
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
