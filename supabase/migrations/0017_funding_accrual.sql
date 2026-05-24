-- 0017_funding_accrual.sql
-- 차익거래 펀딩비 자동 누적을 위한 추적 컬럼.
-- last_funding_at = 마지막으로 펀딩이 누적된 시점.
-- cron은 이 시점 이후 발생한 Binance 펀딩 정산만 모두 합산해 accrued_funding 에 더한다.

alter table arbitrage_positions
  add column if not exists last_funding_at timestamptz;

-- 기존 open 포지션은 created_at 부터 다시 시작
update arbitrage_positions
set last_funding_at = coalesce(last_funding_at, created_at)
where status = 'open' and kind = 'funding';

create index if not exists arbitrage_funding_open_idx
  on arbitrage_positions (last_funding_at)
  where status = 'open' and kind = 'funding';
