-- 후보 레이더에 추세 추가. best 스타일 TF 기준 up/down/range.
alter table radar_candidates
  add column if not exists trend text not null default 'range';
