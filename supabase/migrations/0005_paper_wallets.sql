-- Alpha Gate 가상 트레이딩 인프라
-- 한 사용자당 USDT 한 종류로 마진 거래를 시뮬레이션한다 (Binance Futures USDT-M 흉내).
-- 코인은 별도 잔액으로 관리하지 않고, "포지션"(trades 테이블의 진행 중 행)으로만 존재.

create table if not exists paper_wallets (
  user_id uuid primary key references auth.users on delete cascade,

  /** 현재 USDT 잔액 (실현 손익이 반영됨). */
  usdt_balance numeric not null default 10000,
  /** 현재 진행 중 포지션들이 잡고 있는 마진 합계. */
  used_margin numeric not null default 0,

  /** 통계용: 처음 받은 시드. */
  starting_balance numeric not null default 10000,
  /** 통계용: 누적 입금 횟수 (리셋·추가). */
  deposits_count int not null default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table paper_wallets enable row level security;
drop policy if exists "own wallet" on paper_wallets;
create policy "own wallet" on paper_wallets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Trigger: 신규 사용자 가입 시 paper_wallet 자동 생성
create or replace function ensure_paper_wallet_for_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into paper_wallets (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_paper_wallet on auth.users;
create trigger on_auth_user_created_paper_wallet
  after insert on auth.users
  for each row execute function ensure_paper_wallet_for_new_user();

-- 기존 사용자에게도 backfill (한 번만 실행)
insert into paper_wallets (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- trades에 페이퍼 트레이딩 마진/PnL 추적 컬럼 추가
alter table trades
  add column if not exists paper_margin numeric,        -- 진입 시 잡힌 증거금 (= notional / leverage)
  add column if not exists paper_realized_pnl numeric;  -- 청산 시 실현된 PnL (USDT)

comment on column trades.paper_margin is
  '페이퍼 거래 시 사용된 증거금. is_paper=true에서만 의미 있음.';
comment on column trades.paper_realized_pnl is
  '페이퍼 청산 시 실현된 PnL (USDT, 수수료 차감 후). is_paper=true에서만 의미 있음.';

-- 입금/리셋 로그
create table if not exists paper_wallet_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  action text not null check (action in ('deposit', 'reset', 'lock', 'unlock', 'settle')),
  amount numeric not null,
  balance_after numeric not null,
  used_margin_after numeric not null,
  trade_id uuid references trades on delete set null,
  note text,
  created_at timestamptz default now()
);

create index if not exists paper_wallet_logs_user_idx on paper_wallet_logs (user_id, created_at desc);

alter table paper_wallet_logs enable row level security;
drop policy if exists "own wallet logs" on paper_wallet_logs;
create policy "own wallet logs" on paper_wallet_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
