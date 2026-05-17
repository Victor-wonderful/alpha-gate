-- Alpha Gate initial schema

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  account_currency text default 'USD' check (account_currency in ('USD', 'KRW')),
  default_account_size numeric,
  default_risk_pct numeric default 1.0,
  created_at timestamptz default now()
);

create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,

  symbol text not null,
  direction text not null check (direction in ('long','short')),
  timeframe text not null check (timeframe in ('15m','1h','4h','1D')),
  entry numeric not null,
  stop numeric not null,
  target numeric not null,
  account_size numeric not null,
  allowed_loss_pct numeric not null,
  position_quantity numeric not null,
  market_checks jsonb not null,
  psych_checks jsonb not null,
  context_flags jsonb,

  pre_grade text not null check (pre_grade in ('A','B','C','D')),
  pre_score int not null,
  pre_score_breakdown jsonb not null,
  pre_actions jsonb not null,
  pre_rr numeric not null,

  exit_price numeric,
  result_r numeric,
  exit_reason text check (exit_reason in ('target','stop','manual') or exit_reason is null),
  mistake_tags text[] default '{}',
  note text,
  closed_at timestamptz,

  ai_coach_comment text,
  ai_coach_generated_at timestamptz,

  created_at timestamptz default now()
);

create index if not exists trades_user_created_idx on trades (user_id, created_at desc);
create index if not exists trades_user_grade_idx on trades (user_id, pre_grade);

create table if not exists notification_channels (
  user_id uuid primary key references auth.users on delete cascade,
  telegram_chat_id text,
  discord_webhook_url text,
  enable_d_grade_warn boolean default true,
  enable_losing_streak boolean default true,
  enable_ai_coach_done boolean default true,
  enable_daily_digest boolean default false,
  updated_at timestamptz default now()
);

create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  channel text not null check (channel in ('telegram','discord')),
  event text not null,
  status text not null check (status in ('sent','error')),
  error text,
  sent_at timestamptz default now()
);

create index if not exists notification_log_user_sent_idx on notification_log (user_id, sent_at desc);

alter table profiles enable row level security;
alter table trades enable row level security;
alter table notification_channels enable row level security;
alter table notification_log enable row level security;

drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own trades" on trades;
create policy "own trades" on trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own channels" on notification_channels;
create policy "own channels" on notification_channels
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own logs" on notification_log;
create policy "own logs" on notification_log
  for select using (auth.uid() = user_id);

-- Auto-create profile row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
