-- 거래 체결 시각(filled_at) 추가
--
-- 배경: resolve-trades cron 이 손절/목표 정산 시 캔들을 created_at(주문 "낸" 시각)부터
-- 훑었다. 시장가 진입은 created_at == 체결시각이라 문제없지만, 역지정(STOP)·지정가(LIMIT)
-- 예약 주문은 주문을 낸 뒤 가격이 트리거에 도달해야 비로소 체결된다. 그 대기 구간엔 포지션이
-- 없는데도 정산이 그 구간 캔들까지 훑어, 진입 전에 손절선을 스친 봉을 "손절 적중"으로 오인했다.
-- 특히 역지정 롱은 트리거 아래에서 횡보하다 돌파하므로 대기 구간이 손절 방향으로 불리해
-- 거의 항상 가짜 손절이 잡혔다.
--
-- → 체결 시각을 별도로 기록하고, 정산은 filled_at 이후 캔들만 훑게 한다.

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS filled_at TIMESTAMPTZ;

-- 백필: 이미 체결된 기존 행은 체결 시각을 복구할 수 없으므로 created_at 으로 간주한다.
-- (레거시 시장가 진입은 created_at == 체결시각이라 정확. 레거시 예약주문은 기존 동작 유지.)
UPDATE trades
  SET filled_at = created_at
  WHERE order_status = 'filled' AND filled_at IS NULL;
