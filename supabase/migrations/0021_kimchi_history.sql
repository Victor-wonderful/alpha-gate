-- 0021_kimchi_history.sql
-- 김프 변동성 측정용 시계열. 5분마다 26개 코인 김프 스냅샷 저장.
-- 일주일 모이면 코인별 표준편차/범위로 변동성 랭킹 가능.

create table if not exists kimchi_history (
  id bigserial primary key,
  recorded_at timestamptz not null default now(),
  symbol text not null,
  premium_pct numeric not null,
  upbit_krw numeric not null,
  binance_usd numeric not null,
  usd_krw_rate numeric not null
);

create index if not exists kimchi_history_symbol_time_idx
  on kimchi_history (symbol, recorded_at desc);
create index if not exists kimchi_history_time_idx
  on kimchi_history (recorded_at desc);

-- 30일 이전 데이터 자동 삭제 (테이블 무한 증가 방지) — cron 또는 수동
-- 5분 × 12 × 24 × 30 × 26개 = ~280k rows / 월 (감당 가능)

-- RLS: 읽기는 모든 로그인 유저, 쓰기는 service role만
alter table kimchi_history enable row level security;

drop policy if exists kimchi_history_read on kimchi_history;
create policy kimchi_history_read on kimchi_history
  for select using (auth.role() = 'authenticated');
