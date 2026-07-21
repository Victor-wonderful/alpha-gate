-- 0047_auto_trade.sql
-- 자동매매(봇) MVP — Phase 1 (가상 전용).
-- 봇은 사용자가 켜둔 규칙에 따라, 크론이 신호(레이더 후보)를 코드 시나리오로
-- 평가하고 등급·위험예산 게이트를 통과한 건만 "되돌림 지정가"로 자동 예약한다.
-- 실행/청산은 기존 인프라(limit-order-filler·resolve-trades·expiry-sweep) 재사용.
-- 봇이 낸 거래는 trades.context_flags.bot = true 로 태깅한다(별도 실행 로그 테이블 없음).
--
-- ⚠️ 실거래 자동화 아님. is_paper=true 가상만. 실거래는 규칙별 성적 검증 후 별도 개방.

create table if not exists auto_trade_configs (
  user_id            uuid primary key references auth.users on delete cascade,
  -- 봇 on/off. 기본 off — 명시적으로 켜야 동작한다.
  enabled            boolean not null default false,
  -- 트레이딩 스타일 (데이/스윙). 코어 페르소나.
  style              text not null default 'day' check (style in ('day', 'swing')),
  -- 이 등급 이상만 진입 (A/B/C). D는 항상 차단.
  min_grade          text not null default 'B' check (min_grade in ('A', 'B', 'C')),
  -- 방향 필터. 검증된 엣지(추세추종)에 맞춰 제한 가능.
  direction_filter   text not null default 'both' check (direction_filter in ('both', 'long', 'short')),
  -- 신호 소스: 레이더 후보(코드 신호) / 고정 심볼.
  symbol_source      text not null default 'radar' check (symbol_source in ('radar', 'fixed')),
  fixed_symbols      text[] not null default '{}',
  -- 동시 봇 포지션(오픈+예약) 상한.
  max_concurrent     int not null default 3 check (max_concurrent between 1 and 10),
  -- 거래당 리스크 %.
  risk_pct           numeric not null default 1 check (risk_pct > 0 and risk_pct <= 5),
  -- 오늘 누적 R 이 이 값(음수) 이하로 떨어지면 그날 봇 정지.
  daily_loss_limit_r numeric not null default -2,
  -- 레버리지 (가상).
  leverage           int not null default 3 check (leverage between 1 and 20),
  last_run_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table auto_trade_configs enable row level security;

drop policy if exists "own auto config" on auto_trade_configs;
create policy "own auto config" on auto_trade_configs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table auto_trade_configs is '자동매매 봇 규칙 (사용자당 1행). 가상 전용 Phase 1.';
