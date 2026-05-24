-- 0012_profile_defaults.sql
-- Add trading default preferences for the /app/account page.
-- display_name and default_risk_pct already exist from 0001_init.

alter table profiles
  add column if not exists default_style text
    check (default_style in ('scalp', 'day', 'swing', 'position'))
    default 'swing',
  add column if not exists default_leverage numeric default 3;

-- Backfill defaults for existing users.
update profiles
set default_style = coalesce(default_style, 'swing'),
    default_leverage = coalesce(default_leverage, 3);
