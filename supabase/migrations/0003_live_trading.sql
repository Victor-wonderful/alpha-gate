-- Alpha Gate Phase 2 — 실거래 인프라
-- 1) 거래소 API 키 보관 (앱 레벨 AES-GCM 암호화)
-- 2) trades 테이블에 실거래 메타데이터 컬럼 추가
-- 3) 실거래 주문(진입/손절/목표) 추적 테이블
-- 4) analyses 테이블 strategy CHECK 제약에 신규 전략 3개 추가

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) exchange_api_keys
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists exchange_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,

  exchange text not null check (exchange in ('binance', 'upbit')),
  nickname text,                       -- 사용자가 붙인 이름 (예: "메인", "테스트")

  -- AES-GCM 암호문 (앱 레벨, ENCRYPTION_KEY env 사용). 각 필드 base64 인코딩.
  api_key_encrypted text not null,
  api_secret_encrypted text not null,
  -- 마스킹 표시용 (예: "Sk...AbCd"). 평문 키는 절대 저장 안 함.
  api_key_masked text not null,

  -- 거래소가 부여한 권한 자동 감지 결과
  permissions jsonb not null default '{}'::jsonb,
    -- 예: { "canTrade": true, "canWithdraw": false, "ipRestrict": true }

  -- 검증 상태
  last_verified_at timestamptz,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'valid', 'invalid', 'expired')),
  verification_error text,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- 한 사용자가 같은 거래소에 nickname이 같은 키 2개 못 만들도록
  unique (user_id, exchange, nickname)
);

create index if not exists exchange_api_keys_user_idx
  on exchange_api_keys (user_id, exchange);

alter table exchange_api_keys enable row level security;

drop policy if exists "own api keys" on exchange_api_keys;
create policy "own api keys" on exchange_api_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) trades 테이블 확장 — 실거래 메타데이터
-- ─────────────────────────────────────────────────────────────────────────────
alter table trades
  add column if not exists exchange text
    check (exchange in ('binance', 'upbit') or exchange is null),
  add column if not exists exchange_api_key_id uuid
    references exchange_api_keys on delete set null,
  add column if not exists is_paper boolean not null default true,
  add column if not exists exchange_status text
    check (
      exchange_status in (
        'pending', 'submitted', 'open', 'partial', 'filled',
        'canceled', 'rejected', 'expired', 'error'
      )
      or exchange_status is null
    ),
  add column if not exists exchange_error text;

create index if not exists trades_paper_idx on trades (user_id, is_paper, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) exchange_orders — 개별 주문 추적 (진입, 손절, 익절을 따로 기록)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists exchange_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  trade_id uuid not null references trades on delete cascade,
  api_key_id uuid references exchange_api_keys on delete set null,

  exchange text not null check (exchange in ('binance', 'upbit')),
  symbol text not null,
  kind text not null check (kind in ('entry', 'stop_loss', 'take_profit')),
  side text not null check (side in ('buy', 'sell')),
  type text not null check (
    type in ('market', 'limit', 'stop_market', 'take_profit_market', 'stop', 'take_profit')
  ),

  -- 주문 가격/수량
  price numeric,           -- limit 가격 (시장가면 null)
  stop_price numeric,      -- stop trigger 가격
  quantity numeric not null,
  reduce_only boolean default false,

  -- 거래소 응답
  exchange_order_id text,         -- 거래소가 부여한 ID
  status text not null default 'pending'
    check (
      status in (
        'pending', 'submitted', 'open', 'partial', 'filled',
        'canceled', 'rejected', 'expired', 'error'
      )
    ),
  filled_qty numeric default 0,
  avg_fill_price numeric,
  error_message text,

  -- 원본 응답 (디버깅용)
  raw_response jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists exchange_orders_trade_idx on exchange_orders (trade_id);
create index if not exists exchange_orders_user_status_idx
  on exchange_orders (user_id, status, created_at desc);

alter table exchange_orders enable row level security;

drop policy if exists "own exchange orders" on exchange_orders;
create policy "own exchange orders" on exchange_orders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) analyses CHECK 제약 갱신 — 신규 전략 3개 추가
-- ─────────────────────────────────────────────────────────────────────────────
alter table analyses drop constraint if exists analyses_primary_strategy_check;
alter table analyses add constraint analyses_primary_strategy_check
  check (
    primary_strategy in (
      'trend_pullback', 'breakout', 'range_fade', 'reversal',
      'liquidity_grab', 'funding_squeeze', 'session_open_drive',
      'wait'
    )
  );
