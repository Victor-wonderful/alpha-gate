-- Admin panel: account disable flag + admin audit log

-- 1) Account deactivation flag
alter table profiles
  add column if not exists disabled boolean not null default false;

-- 2) Admin action audit log
create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users on delete cascade,
  admin_email text not null,
  target_user_id uuid references auth.users on delete set null,
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz default now()
);

create index if not exists admin_audit_created_idx
  on admin_audit_logs (created_at desc);
create index if not exists admin_audit_target_idx
  on admin_audit_logs (target_user_id, created_at desc);

-- RLS on, no policies -> only service-role (RLS bypass) can read/write.
-- Admin pages use getSupabaseService() which bypasses RLS.
alter table admin_audit_logs enable row level security;
