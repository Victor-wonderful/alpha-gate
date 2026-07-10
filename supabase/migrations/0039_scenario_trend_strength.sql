-- 시나리오 결과에 추세 강도/분류 기록
--
-- 배경: 6/28 "강한 추세는 즉시 진입" 수정은 trendMetrics.strength='strong' 일 때만 적용된다.
-- 그런데 scenario_outcomes 에 추세 강도가 저장돼 있지 않아, 나중에 "강한 추세 즉시진입만"
-- 골라 실제 엣지를 측정할 수 없었다(약·중·강이 섞여 평균이 희석됨).
--
-- → 시나리오 생성 시점의 추세 강도(strong/moderate/weak)와 분류(up/down/range/mixed)를
--   같이 기록해, 향후 check-live-outcomes / sim-immediate-entry 에서 강도별 분리 측정이 가능하게 한다.
-- (기존 행은 스냅샷에 그 정보가 없으므로 NULL — 백필 불가.)

ALTER TABLE scenario_outcomes
  ADD COLUMN IF NOT EXISTS trend_strength TEXT,
  ADD COLUMN IF NOT EXISTS trend_classification TEXT;
