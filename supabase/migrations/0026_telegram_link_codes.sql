-- 0026_telegram_link_codes.sql
-- Telegram deep-link 연결 코드.
-- 사용자가 "텔레그램 연결" 버튼 클릭 → 코드 생성 → t.me/bot?start=code 로 이동
-- → 봇에게 /start code 자동 전송 → webhook 이 코드로 user_id 찾아 chat_id 자동 저장.

create table if not exists telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique,                     -- 짧은 랜덤 토큰 (16자)
  expires_at timestamptz not null,               -- 15분 후 만료
  used_at timestamptz,                           -- 연결 완료 시점
  created_at timestamptz default now()
);

create index if not exists telegram_link_codes_code_idx
  on telegram_link_codes (code) where used_at is null;
create index if not exists telegram_link_codes_user_idx
  on telegram_link_codes (user_id, created_at desc);

alter table telegram_link_codes enable row level security;

-- 본인 코드만 조회 (UPDATE/INSERT 는 server-side service-role 이 처리)
drop policy if exists telegram_link_codes_read_own on telegram_link_codes;
create policy telegram_link_codes_read_own on telegram_link_codes
  for select using (auth.uid() = user_id);
