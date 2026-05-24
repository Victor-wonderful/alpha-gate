-- 0015_arbitrage.sql
-- 차익거래(Arbitrage) 시스템: 김치 프리미엄 + 펀딩비 차익.
-- 한 포지션 = 두 다리(long leg + short leg). 양쪽 동시 진입/청산.
--
-- 김치 프리미엄:
--   long  = Binance(USD) BTC 매수 (싼 쪽)
--   short = Upbit(KRW)  BTC 매도 (비싼 쪽) — 가상이라 short 시뮬레이션 OK
--   수익  = 김프 수렴 시
--
-- 펀딩비 차익:
--   funding > 0:  long  = Spot,  short = Perp  → 펀딩 수취
--   funding < 0:  long  = Perp,  short = Spot  → 역방향 펀딩 수취
--   수익  = 펀딩 누적 + 가격 차이 변동

create table if not exists arbitrage_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,

  kind text not null check (kind in ('kimchi', 'funding')),
  symbol text not null,            -- BTC, ETH, ...
  notional_usd numeric not null,   -- 양쪽 다리 각각의 USD 노출

  -- Long leg
  long_exchange text not null,     -- 'binance' | 'upbit' | 'binance_spot' | 'binance_perp'
  long_entry_price numeric not null,
  long_qty numeric not null,

  -- Short leg
  short_exchange text not null,
  short_entry_price numeric not null,
  short_qty numeric not null,

  -- 진입 시점의 차익 폭 (%)
  entry_premium_pct numeric,
  -- 펀딩비 차익에 한해 진입 시 펀딩비 (per 8h, %)
  entry_funding_pct numeric,

  -- 만료
  expires_at timestamptz not null default (now() + interval '7 days'),

  -- 상태
  status text not null default 'open' check (status in ('open', 'closed', 'expired')),

  -- 종료 정보
  closed_at timestamptz,
  long_exit_price numeric,
  short_exit_price numeric,
  accrued_funding numeric default 0,  -- funding kind 에서 누적된 펀딩 수익 (USD)
  realized_pnl numeric,
  close_reason text,                  -- 'manual' | 'expired' | 'converged'

  created_at timestamptz default now()
);

create index if not exists arbitrage_user_status_idx
  on arbitrage_positions (user_id, status);

create index if not exists arbitrage_open_idx
  on arbitrage_positions (status, expires_at)
  where status = 'open';

alter table arbitrage_positions enable row level security;
drop policy if exists "own arbitrage" on arbitrage_positions;
create policy "own arbitrage" on arbitrage_positions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
