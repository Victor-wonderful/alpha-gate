-- 다음 캔들 시가→종가 판정 방식으로 변경
-- 타임프레임을 1m / 3m 만 허용
ALTER TABLE binary_games
  DROP CONSTRAINT IF EXISTS binary_games_timeframe_check;

ALTER TABLE binary_games
  ADD CONSTRAINT binary_games_timeframe_check
    CHECK (timeframe IN ('1m', '3m'));
