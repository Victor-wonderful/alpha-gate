-- 0022_arbitrage_coin_rename.sql
-- 인벤토리 컬럼 네이밍 정정: btc → coin.
-- 실제로는 진입 코인(DOGE/ETH/etc)의 수량을 저장하는데, 초기 BTC 전용 모델 흔적으로 잘못 명명되어 있었음.

-- arbitrage_positions
alter table arbitrage_positions
  rename column inventory_btc_upbit to inventory_coin_upbit;
alter table arbitrage_positions
  rename column inventory_btc_binance to inventory_coin_binance;
alter table arbitrage_positions
  rename column btc_price_at_entry_usd to coin_price_at_entry_usd;

-- arbitrage_cycles
alter table arbitrage_cycles
  rename column btc_moved to coin_moved;
alter table arbitrage_cycles
  rename column upbit_btc_after to upbit_coin_after;
alter table arbitrage_cycles
  rename column binance_btc_after to binance_coin_after;
