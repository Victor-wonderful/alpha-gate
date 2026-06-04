-- 후보 레이더에 스타일 적합도 추가.
-- best_style: 셋업이 가장 뚜렷한 트레이딩 스타일 (scalp/day/swing/position)
-- style_fit: 스타일별 신호 점수 { scalp, day, swing, position }
alter table radar_candidates
  add column if not exists best_style text,
  add column if not exists style_fit jsonb not null default '{}'::jsonb;
