-- 0024_scenario_outcomes_insert_policy.sql
-- 0023에서 RLS는 켰지만 SELECT 정책만 있고 INSERT/UPDATE 정책이 없어서
-- 일반 supabase 클라이언트로 시나리오 등록이 차단됐음. 본인 행 INSERT 허용.
-- UPDATE 는 cron(service-role) 만 수행하므로 정책 불필요.

drop policy if exists scenario_outcomes_insert_own on scenario_outcomes;
create policy scenario_outcomes_insert_own on scenario_outcomes
  for insert with check (auth.uid() = user_id);
