-- trades 테이블 확장: 지정가 주문 컬럼 추가
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'market'
    CHECK (order_type IN ('market', 'limit')),
  ADD COLUMN IF NOT EXISTS limit_price NUMERIC,
  ADD COLUMN IF NOT EXISTS order_status TEXT DEFAULT 'filled'
    CHECK (order_status IN ('pending', 'filled', 'canceled', 'expired'));

-- 미체결 지정가 주문 추적 테이블
CREATE TABLE IF NOT EXISTS pending_limit_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  trade_id UUID NOT NULL REFERENCES trades ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  limit_price NUMERIC NOT NULL,
  quantity NUMERIC NOT NULL,
  leverage NUMERIC NOT NULL DEFAULT 1,
  stop NUMERIC,
  target NUMERIC,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'filled', 'canceled', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plo_user_status ON pending_limit_orders (user_id, status);
CREATE INDEX IF NOT EXISTS idx_plo_symbol ON pending_limit_orders (symbol, limit_price);

ALTER TABLE pending_limit_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own limit orders" ON pending_limit_orders
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
