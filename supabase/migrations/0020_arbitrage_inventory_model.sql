-- 0020_arbitrage_inventory_model.sql
-- 김치 프리미엄 차익거래 — 리밸런싱 인벤토리 모델로 전환.
-- 양쪽 거래소에 BTC + USDT 보유. 김프가 ±threshold 도달 시 자동 리밸런싱.
-- 양방향(±) 모두에서 수익 누적 가능 (시장 메이킹 스타일).

-- 1) 인벤토리 컬럼 추가
alter table arbitrage_positions
  add column if not exists inventory_btc_upbit numeric default 0,
  add column if not exists inventory_btc_binance numeric default 0,
  add column if not exists inventory_usdt_upbit numeric default 0,
  add column if not exists inventory_usdt_binance numeric default 0,
  add column if not exists target_threshold_pct numeric default 1.0,
  add column if not exists cycles_count integer default 0,
  add column if not exists accrued_cycle_pnl numeric default 0,
  -- BTC 가격 변동 노출 추적용
  add column if not exists btc_price_at_entry_usd numeric;

-- 2) 사이클 이벤트 로그 테이블
create table if not exists arbitrage_cycles (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references arbitrage_positions(id) on delete cascade,
  executed_at timestamptz default now(),
  -- 사이클 방향: 'positive' = 김프 +방향 (Upbit 매도 + Binance 매수)
  --              'negative' = 김프 -방향 (Upbit 매수 + Binance 매도)
  direction text not null check (direction in ('positive', 'negative')),
  premium_at_cycle numeric not null,        -- 사이클 실행 시점 김프 %
  threshold_pct numeric not null,           -- 발동 임계값
  btc_moved numeric not null,               -- 이동시킨 BTC 수량 (한쪽 거래소 기준)
  profit_usdt numeric not null,             -- 이 사이클로 캡처된 수익 (USDT)
  -- 사이클 후 인벤토리 스냅샷 (디버깅용)
  upbit_btc_after numeric,
  upbit_usdt_after numeric,
  binance_btc_after numeric,
  binance_usdt_after numeric
);

create index if not exists arbitrage_cycles_position_idx
  on arbitrage_cycles (position_id, executed_at desc);

alter table arbitrage_cycles enable row level security;

-- 본인 포지션의 사이클만 조회 가능
drop policy if exists "own arbitrage cycles" on arbitrage_cycles;
create policy "own arbitrage cycles" on arbitrage_cycles
  for all
  using (
    exists (
      select 1 from arbitrage_positions p
      where p.id = position_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from arbitrage_positions p
      where p.id = position_id and p.user_id = auth.uid()
    )
  );

-- 3) 기존 open kimchi 포지션은 인벤토리 0 으로 마이그레이션 (이전 방식 보존만 위해)
--    실제 운영에서는 기존 포지션 강제 종료 후 재진입 권장.
update arbitrage_positions
set inventory_btc_upbit = coalesce(inventory_btc_upbit, 0),
    inventory_btc_binance = coalesce(inventory_btc_binance, 0),
    inventory_usdt_upbit = coalesce(inventory_usdt_upbit, 0),
    inventory_usdt_binance = coalesce(inventory_usdt_binance, 0),
    target_threshold_pct = coalesce(target_threshold_pct, 1.0),
    cycles_count = coalesce(cycles_count, 0),
    accrued_cycle_pnl = coalesce(accrued_cycle_pnl, 0)
where kind = 'kimchi';
