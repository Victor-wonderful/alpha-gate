-- 0018_remove_funding_arbitrage.sql
-- 펀딩비 차익거래 기능 제거. 김치 프리미엄만 유지.
-- 기존 펀딩 포지션은 강제 종료 처리 (status='closed', reason='deprecated').

-- 1) 진행 중인 펀딩 차익 포지션 강제 종료 (마진 회수는 수동/Supabase Studio에서)
update arbitrage_positions
set status = 'closed',
    closed_at = coalesce(closed_at, now()),
    close_reason = 'deprecated'
where kind = 'funding' and status = 'open';

-- 2) kind check 제약을 kimchi only로 교체
alter table arbitrage_positions
  drop constraint if exists arbitrage_positions_kind_check;

alter table arbitrage_positions
  add constraint arbitrage_positions_kind_check
  check (kind = 'kimchi');

-- 3) 펀딩 전용 컬럼/인덱스 제거
drop index if exists arbitrage_funding_open_idx;

alter table arbitrage_positions
  drop column if exists entry_funding_pct,
  drop column if exists accrued_funding,
  drop column if exists last_funding_at;
