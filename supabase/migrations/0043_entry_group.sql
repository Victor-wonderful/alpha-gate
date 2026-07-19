-- 분할 진입(래더 예약주문) — 시나리오 1~3차 tier를 한 세트로 묶어 한 포지션으로 추적.
-- cf. docs/분할진입-설계.md (D1 그룹핑, §4 데이터 모델)
--
-- 별도 entry_groups 테이블은 만들지 않는다(v1은 group_id 집계로 충분). N tier =
-- N개 trade(row) + N개 pending_limit_order 가 같은 entry_group_id 를 공유한다.
-- 공유 손절/목표/방향/심볼은 각 row 에 이미 있으니 동일 값으로 저장.

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS entry_group_id UUID,
  ADD COLUMN IF NOT EXISTS entry_tier INT,
  ADD COLUMN IF NOT EXISTS entry_weight NUMERIC;

ALTER TABLE pending_limit_orders
  ADD COLUMN IF NOT EXISTS entry_group_id UUID,
  ADD COLUMN IF NOT EXISTS entry_tier INT;

-- 그룹 집계·미체결 tier 취소 조회용 (그룹이 있는 행만 인덱싱).
CREATE INDEX IF NOT EXISTS trades_entry_group_idx
  ON trades (entry_group_id) WHERE entry_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS plo_entry_group_idx
  ON pending_limit_orders (entry_group_id) WHERE entry_group_id IS NOT NULL;
