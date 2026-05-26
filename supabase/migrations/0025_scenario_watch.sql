-- 0025_scenario_watch.sql
-- 시나리오 알림 옵트인 + 중복 알림 방지.
-- 사용자가 "알림 등록" 클릭한 시나리오만 cron 에서 Telegram/Discord 발송.

alter table scenario_outcomes
  add column if not exists watch boolean default false,
  add column if not exists last_notified_status text;

create index if not exists scenario_outcomes_watch_idx
  on scenario_outcomes (watch, status) where watch = true;

-- 본인 시나리오만 watch 토글 가능
drop policy if exists scenario_outcomes_update_watch on scenario_outcomes;
create policy scenario_outcomes_update_watch on scenario_outcomes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
