-- 후보 레이더 — "지금 볼 만한 코인" 스캔 결과.
-- 크론이 거래대금 상위 30개를 코드 구조신호로 점수화해 적재한다.
-- 시장 데이터(유저별 아님)라 인증 사용자는 모두 읽기 가능. 쓰기는 service role 전용.
create table if not exists radar_candidates (
  id bigint generated always as identity primary key,
  symbol text not null,
  score numeric not null default 0,
  -- [{ key: string, label: string }] — 발동한 신호 칩
  signals jsonb not null default '[]'::jsonb,
  price numeric,
  change24h_pct numeric,
  funding_rate numeric,
  volume24h_usd numeric,
  scanned_at timestamptz not null default now()
);

create index if not exists idx_radar_scanned_at on radar_candidates (scanned_at desc);
create index if not exists idx_radar_batch on radar_candidates (scanned_at desc, score desc);

alter table radar_candidates enable row level security;

-- 인증 사용자 읽기 허용 (시장 데이터)
drop policy if exists "radar readable by authenticated" on radar_candidates;
create policy "radar readable by authenticated" on radar_candidates
  for select to authenticated using (true);

-- insert/update/delete 정책 없음 → service role(RLS 우회)만 쓰기 가능
