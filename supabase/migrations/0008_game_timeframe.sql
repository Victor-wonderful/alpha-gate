-- 바이너리 게임에 타임프레임 컬럼 추가
ALTER TABLE binary_games
  ADD COLUMN IF NOT EXISTS timeframe TEXT NOT NULL DEFAULT '1m'
    CHECK (timeframe IN ('1m', '5m', '15m'));

CREATE INDEX IF NOT EXISTS idx_bg_user_status_time
  ON binary_games (user_id, status, candle_close_time);
