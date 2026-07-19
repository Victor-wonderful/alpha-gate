-- 현물 적립(DCA) 플랜 — "이 매집을 해도 되는가"의 실행 단위.
--
-- 사용자가 만드는 것은 개별 주문이 아니라 플랜이다: 얼마를 몇 번에 걸쳐 어떤 주기로
-- 모을 것인가. 회차 실행 기록은 기존 trades(현물·가상)를 재사용하고
-- context_flags.dcaPlanId 로 연결한다 — 별도 체결 테이블을 만들지 않는다.
--
-- cf. docs/DCA-모드-설계.md §4 · §7

create table if not exists dca_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,

  symbol text not null,

  -- 총 매집 예산과 분할 횟수. 회당 기본 금액 = total_budget / tranches.
  -- 실제 회차 금액은 밸류 존 배수(cheap 2 / 중립 1 / 비쌈 0.5)를 곱해 결정된다.
  total_budget numeric not null check (total_budget > 0),
  tranches int not null check (tranches between 1 and 200),

  -- periodic: period_days 마다 / ladder: 기준가에서 step_pct 씩 내릴 때마다
  mode text not null default 'periodic' check (mode in ('periodic', 'ladder')),
  period_days int check (period_days is null or period_days between 1 and 90),
  ladder_base_price numeric check (ladder_base_price is null or ladder_base_price > 0),
  ladder_step_pct numeric check (ladder_step_pct is null or ladder_step_pct > 0),

  -- 포트폴리오 대비 이 자산의 배분 상한 (G3에서 사용).
  max_allocation_pct numeric not null default 10 check (max_allocation_pct > 0 and max_allocation_pct <= 100),

  status text not null default 'active' check (status in ('active', 'paused', 'completed')),

  -- 마지막 회차 실행 시각 — 스케줄 규율(G4) 판정 기준.
  last_executed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dca_plans_user_idx on dca_plans (user_id, status, created_at desc);

alter table dca_plans enable row level security;

drop policy if exists "own dca plans" on dca_plans;
create policy "own dca plans" on dca_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 회차 실행을 플랜별로 빠르게 집계하기 위한 인덱스 (context_flags->>'dcaPlanId').
create index if not exists trades_dca_plan_idx
  on trades ((context_flags->>'dcaPlanId'))
  where context_flags ? 'dcaPlanId';
