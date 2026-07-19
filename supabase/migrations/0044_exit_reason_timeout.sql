-- 만료 자동청산이 DB 제약에 막혀 한 번도 성공하지 못하던 버그 수정.
--
-- 0001_init.sql 의 CHECK 는 ('target','stop','manual') 만 허용하는데,
-- resolve-trades 크론은 만료 도달 시 exit_reason='timeout' 으로 UPDATE 한다.
-- → 매 실행마다 제약 위반으로 거부(errors++ 후 continue) → 포지션이 영구히
--   "진행 중"으로 남음. 실제로 exit_reason='timeout' 행은 0건이었다.
--
-- cf. src/app/api/cron/resolve-trades/route.ts (만료 분기)

ALTER TABLE trades
  DROP CONSTRAINT IF EXISTS trades_exit_reason_check;

ALTER TABLE trades
  ADD CONSTRAINT trades_exit_reason_check
  CHECK (exit_reason IN ('target', 'stop', 'manual', 'timeout') OR exit_reason IS NULL);
