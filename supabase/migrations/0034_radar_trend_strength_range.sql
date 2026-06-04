-- 후보 레이더에 추세 지속력(A) + 예상 변동 범위 콘(B) 추가.
-- trend_strength: strong/moderate/weak (ADX/KER/Choppiness 종합) — 방향 아님.
-- range_low_pct / range_high_pct: 다음 horizon봉 80% 예상 변동폭(%) — 방향 예측 아님.
alter table radar_candidates
  add column if not exists trend_strength text not null default 'weak',
  add column if not exists range_low_pct numeric,
  add column if not exists range_high_pct numeric;
