-- 0037_radar_style_atr.sql
-- 후보 레이더: 스타일별 ATR%(변동성) 저장 → "이 스타일로 진입 가능한가" 판정용.
-- style_atr: { scalp, day, swing, position } 각 스타일 기준 TF의 ATR% (가격 대비).
--   진입 가능 = 1.5 × ATR ≥ 스타일 손절 하한 (수수료/노이즈를 이기는 손절이 가능).

alter table radar_candidates
  add column if not exists style_atr jsonb not null default '{}'::jsonb;

comment on column radar_candidates.style_atr is
  '스타일별 ATR%(가격 대비). { scalp, day, swing, position }. 진입 가능 판정·손절/목표 추정용.';
