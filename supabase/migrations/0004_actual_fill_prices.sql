-- Alpha Gate Phase 2 후속 — 페이퍼 트레이딩을 실거래와 동일하게 시뮬레이션하기 위한 컬럼 추가
-- 사용자가 입력한 "의도 진입가/청산가"와 시뮬레이션상 "실제 체결가"를 분리한다.
-- 페이퍼는 entry_actual을 Binance 현재가 + 슬리피지로 채우고, result_r 계산은 entry_actual을 기준으로 한다.

alter table trades
  add column if not exists entry_actual numeric,        -- 실제 체결가 (페이퍼는 fetch한 시장가 + 슬리피지)
  add column if not exists exit_actual numeric,         -- 실제 청산가 (페이퍼는 적중 봉의 가격, 실거래는 거래소 체결가 — exchange_orders에서 가져옴)
  add column if not exists entry_slippage_pct numeric,  -- 진입 슬리피지 % (방향성, long=양수=더 비싸게 체결)
  add column if not exists exit_slippage_pct numeric,   -- 청산 슬리피지 %
  add column if not exists fees_pct numeric;            -- 적용된 round-trip 수수료 % (0.04 등)

create index if not exists trades_entry_actual_idx on trades (user_id, entry_actual)
  where entry_actual is not null;

comment on column trades.entry_actual is
  '실제 진입 체결가. 페이퍼는 저장 시점 Binance 현재가 + 슬리피지 / 실거래는 exchange_orders.avg_fill_price';
comment on column trades.exit_actual is
  '실제 청산 체결가. 페이퍼는 적중 봉의 close 등 / 실거래는 stop_loss·take_profit 주문의 avg_fill_price';
comment on column trades.entry_slippage_pct is
  '진입 시 적용된 슬리피지 (방향성). long은 양수(더 비싸게), short는 음수.';
