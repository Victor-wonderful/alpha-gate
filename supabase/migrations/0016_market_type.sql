-- 0016_market_type.sql
-- 가상 거래소에 Spot(현물) 거래 추가.
-- 기존 거래는 모두 'futures' (USDT-M Futures), 신규 spot 거래는 'spot'.
--
-- Spot 거래 특성:
--  - direction은 항상 'long' (현물은 매수만)
--  - leverage = 1 (실물 보유)
--  - paper_margin = notional (전액)
--  - 만료 적용 안 됨 (extended_until 무시)
--  - 수수료 0.2% 왕복 (Binance Spot Taker 0.1%×2)

alter table trades
  add column if not exists market_type text
    not null default 'futures'
    check (market_type in ('futures', 'spot'));

create index if not exists trades_market_type_idx on trades (market_type);
