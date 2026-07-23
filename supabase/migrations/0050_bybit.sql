-- Alpha Gate — 다중 거래소: Bybit 추가
-- exchange 컬럼의 CHECK 제약 3곳에 'bybit'를 허용한다.
-- (기존 인라인 제약은 Postgres 자동 이름 규칙 <table>_<column>_check 를 따른다.)

-- 1) exchange_api_keys.exchange
alter table exchange_api_keys drop constraint if exists exchange_api_keys_exchange_check;
alter table exchange_api_keys add constraint exchange_api_keys_exchange_check
  check (exchange in ('binance', 'upbit', 'bybit'));

-- 2) trades.exchange (null 허용 — 가상 거래는 거래소 없음)
alter table trades drop constraint if exists trades_exchange_check;
alter table trades add constraint trades_exchange_check
  check (exchange in ('binance', 'upbit', 'bybit') or exchange is null);

-- 3) exchange_orders.exchange
alter table exchange_orders drop constraint if exists exchange_orders_exchange_check;
alter table exchange_orders add constraint exchange_orders_exchange_check
  check (exchange in ('binance', 'upbit', 'bybit'));

-- 4) 키별 testnet 플래그 — 실거래 전 테스트넷으로 왕복 검증할 수 있게.
--    (한 키는 테스트넷 전용이거나 메인넷 전용. 어댑터가 이 값으로 엔드포인트를 고른다.)
alter table exchange_api_keys
  add column if not exists testnet boolean not null default false;
