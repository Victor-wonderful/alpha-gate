-- Alpha Gate AI 분석 기록 (Stage 2: Strategy + Stage 3: Scenarios)

create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,

  symbol text not null,
  style text not null check (style in ('scalp', 'day', 'swing', 'position')),

  -- Strategy Agent summary
  primary_strategy text not null
    check (primary_strategy in ('trend_pullback', 'breakout', 'range_fade', 'reversal', 'wait')),
  strategy_direction text check (strategy_direction in ('long', 'short') or strategy_direction is null),
  strategy_confidence numeric,

  -- Quick aggregates
  scenarios_count int not null default 0,
  current_price numeric,

  -- Full payloads (for replay)
  snapshot jsonb not null,
  strategy jsonb not null,
  report jsonb not null,

  created_at timestamptz default now()
);

create index if not exists analyses_user_created_idx on analyses (user_id, created_at desc);
create index if not exists analyses_user_symbol_idx on analyses (user_id, symbol, created_at desc);

alter table analyses enable row level security;

drop policy if exists "own analyses" on analyses;
create policy "own analyses" on analyses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
