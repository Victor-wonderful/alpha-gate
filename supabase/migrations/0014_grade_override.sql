-- 0014_grade_override.sql
-- D 등급(거래 금지 권장)을 사용자가 확인 모달로 override 하고 진입한 경우 추적.
-- 나중에 "D override 거래의 실제 결과" 통계 분석에 사용.

alter table trades
  add column if not exists grade_override boolean not null default false;
