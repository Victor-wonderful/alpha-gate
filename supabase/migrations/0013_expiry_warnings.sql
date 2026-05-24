-- 0013_expiry_warnings.sql
-- 진행 중 포지션 & 미체결 지정가 주문의 만료 경고 시스템.
-- 만료 도달 시 자동 청산하기 전 사용자에게 1차/2차 경고를 보내고
-- 사용자가 [청산/연장/그냥 두기] 선택할 수 있게 한다.
--
-- 흐름:
--   D-N (스타일별 6h~48h, 지정가는 D-4h): 1차 경고 → expiry_warned_first_at 세팅
--   D-1h: 2차(마지막) 경고 → expiry_warned_final_at 세팅
--   만료 시점: 응답 없으면 자동 청산/취소
--   연장 시: warned_first_at/warned_final_at NULL로 reset 하여 새 사이클

alter table trades
  add column if not exists expiry_warned_first_at timestamptz,
  add column if not exists expiry_warned_final_at timestamptz,
  add column if not exists extended_until         timestamptz,
  add column if not exists extension_count        int not null default 0;

-- pending_limit_orders는 expires_at이 절대 만료시각이므로 extended_until은 expires_at을 직접 갱신.
alter table pending_limit_orders
  add column if not exists expiry_warned_first_at timestamptz,
  add column if not exists expiry_warned_final_at timestamptz,
  add column if not exists extension_count        int not null default 0;

-- 자주 조회되는 패턴: "곧 만료될 거래" 필터링.
create index if not exists trades_expiry_warned_first_idx
  on trades (expiry_warned_first_at)
  where expiry_warned_first_at is not null and closed_at is null;

create index if not exists pending_limit_warned_first_idx
  on pending_limit_orders (expiry_warned_first_at)
  where expiry_warned_first_at is not null and status = 'open';
