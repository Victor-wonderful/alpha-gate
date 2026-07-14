-- pending_limit_orders 진단성 강화: 주문이 왜/언제 open을 벗어났는지 추적.
-- 배경: 역지정가(stop) 취소 4건의 원인을 데이터로 특정할 수 없었음
--   (updated_at·사유 컬럼 부재 → margin 실패 vs 수동취소 vs 크론 미체결 구분 불가).
-- 앞으로 모든 filled/canceled/expired 전이에 resolved_at + resolve_reason 을 남긴다.

ALTER TABLE pending_limit_orders
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolve_reason TEXT;

COMMENT ON COLUMN pending_limit_orders.resolved_at IS
  'open → filled/canceled/expired 로 전이된 시각';
COMMENT ON COLUMN pending_limit_orders.resolve_reason IS
  '전이 사유: filled | expired_24h | margin_insufficient | user_canceled | user_canceled_exchange_ui';
