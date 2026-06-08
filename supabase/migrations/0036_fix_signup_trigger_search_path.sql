-- 0036_fix_signup_trigger_search_path.sql
-- FIX: 회원가입 시 "Database error saving new user"
--
-- 원인: ensure_paper_wallet_for_new_user (0005) 가 SECURITY DEFINER 이면서
--   `set search_path` 를 지정하지 않고 테이블을 스키마 미명시(`paper_wallets`)로 참조함.
--   Supabase 인증은 supabase_auth_admin 롤(search_path 에 public 없음)로 auth.users 에
--   INSERT 하므로, 트리거 안에서 `paper_wallets` 가 해석되지 않아 예외 발생 →
--   GoTrue 가 "Database error saving new user" 로 가입을 실패시킴.
--
-- 조치:
--   1) search_path = public 명시 + 테이블 스키마 명시(public.paper_wallets)
--   2) 지갑 생성은 부수 작업이므로 실패해도 인증을 막지 않도록 예외를 삼킴
--      (지갑은 앱에서 lazy 하게 보장하거나 backfill 로 복구 가능)

create or replace function public.ensure_paper_wallet_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.paper_wallets (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
exception
  when others then
    -- 지갑 생성 실패가 회원가입 자체를 막지 않도록 한다.
    raise warning 'ensure_paper_wallet_for_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

-- handle_new_user 도 동일하게 방어적으로 (이미 search_path 는 있으나 예외 가드 추가)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
exception
  when others then
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

-- 그동안 가입 실패/지갑 누락된 기존 유저 backfill
insert into public.paper_wallets (user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into public.profiles (id, display_name)
select u.id, split_part(u.email, '@', 1)
from auth.users u
on conflict (id) do nothing;
