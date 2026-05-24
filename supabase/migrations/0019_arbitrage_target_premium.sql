-- 0019_arbitrage_target_premium.sql
-- 김치 프리미엄 차익거래에 청산 목표 김프 추가.
-- 사용자가 진입 시 지정 (기본 1.0%). cron 이 현재 김프 >= target 도달 시 자동 청산.

alter table arbitrage_positions
  add column if not exists target_premium_pct numeric default 1.0;

-- 기존 open 포지션은 1.0% 로 채움
update arbitrage_positions
set target_premium_pct = 1.0
where target_premium_pct is null;

-- cron 스캔 가속용
create index if not exists arbitrage_kimchi_open_idx
  on arbitrage_positions (status, kind)
  where status = 'open' and kind = 'kimchi';
