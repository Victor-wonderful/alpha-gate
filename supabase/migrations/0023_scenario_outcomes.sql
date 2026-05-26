-- 0023_scenario_outcomes.sql
-- AI 분석이 만든 시나리오의 실제 결과를 자동 추적.
-- 사용자가 진입했는지 여부와 무관하게 시스템이 가격 모니터링 → 시나리오별 적중률 집계 가능.

create table if not exists scenario_outcomes (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario_index int not null,

  -- 시나리오 메타 (조회 인덱싱용)
  symbol text not null,
  timeframe text not null,
  style text not null,
  strategy_primary text not null,       -- trend_pullback / breakout / range_fade / reversal
  direction text not null check (direction in ('long', 'short')),

  -- 시나리오 가격
  entry_price numeric not null,         -- entryZone 중간값
  stop_price numeric not null,          -- invalidation
  target_price numeric not null,

  -- 결과 추적
  status text not null default 'pending'
    check (status in ('pending', 'triggered', 'target', 'stop', 'expired')),
  triggered_at timestamptz,             -- entry 터치 시점
  resolved_at timestamptz,              -- target/stop/expired 시점
  outcome_price numeric,
  result_r numeric,                     -- (resolved - triggered) / |triggered - stop|, 부호 포함

  -- 만료 (분석 시점 + timeframe별 timeout)
  expires_at timestamptz not null,

  created_at timestamptz default now(),

  unique (analysis_id, scenario_index)
);

create index if not exists scenario_outcomes_status_expires_idx
  on scenario_outcomes (status, expires_at);
create index if not exists scenario_outcomes_symbol_strategy_idx
  on scenario_outcomes (symbol, strategy_primary, status);
create index if not exists scenario_outcomes_user_idx
  on scenario_outcomes (user_id, created_at desc);

alter table scenario_outcomes enable row level security;

-- 본인 결과 + 모든 로그인 유저는 집계 조회 가능 (개인 정보 아닌 통계용)
drop policy if exists scenario_outcomes_read on scenario_outcomes;
create policy scenario_outcomes_read on scenario_outcomes
  for select using (auth.role() = 'authenticated');
