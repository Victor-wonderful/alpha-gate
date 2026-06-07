-- 역지정가(STOP) 주문 지원 추가
--
-- 배경: 돌파(breakout) 추격 진입은 "가격이 레벨을 통과하는 방향"으로 들어가는 주문이라
-- 거래소에서는 역지정가(STOP)로 처리한다. 기존엔 LIMIT만 있어서 돌파형 진입가(롱은 현재가
-- 위, 숏은 현재가 아래)가 LIMIT으로 잘못 매핑되면 "현재가가 이미 지정가 통과" 가드에 걸렸다.
--
-- 체결 조건:
--   LIMIT 롱: 현재가 <= limit_price (되돌림 대기)   |  LIMIT 숏: 현재가 >= limit_price
--   STOP  롱: 현재가 >= limit_price (돌파 추격)      |  STOP  숏: 현재가 <= limit_price
-- (STOP에서도 트리거가는 limit_price 컬럼을 재사용한다.)

-- 1) trades.order_type CHECK 에 'stop' 허용
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_order_type_check;
ALTER TABLE trades
  ADD CONSTRAINT trades_order_type_check
  CHECK (order_type IN ('market', 'limit', 'stop'));

-- 2) pending_limit_orders 에 주문 종류 컬럼 추가 (기존 행은 모두 'limit')
ALTER TABLE pending_limit_orders
  ADD COLUMN IF NOT EXISTS order_kind TEXT NOT NULL DEFAULT 'limit'
    CHECK (order_kind IN ('limit', 'stop'));
