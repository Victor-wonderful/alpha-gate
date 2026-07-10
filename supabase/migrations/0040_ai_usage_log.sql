-- AI 사용량/원가 로그
--
-- 배경: 분석 실행 시 Anthropic 응답의 usage(입력/출력/캐시 토큰)를 그냥 버리고 있었다.
-- 유료 구독 제품화를 위해 "분석 1회의 실제 토큰·원가·지연"을 알아야 구독료·쿼터를
-- 감이 아니라 데이터로 정할 수 있다. LLM 호출(전략 선택 + 시나리오 생성)마다 1행 기록.
--
-- 원가는 코드에서 모델 단가로 계산해 cost_usd에 저장 (사후 집계·어드민 모니터링용).
-- RLS: 본인 행만 조회/삽입 (삽입 값은 서버 액션이 계산 — 사용자가 위조 불가).

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_id        UUID REFERENCES analyses(id) ON DELETE SET NULL,
  stage              TEXT NOT NULL,            -- 'strategy' | 'synthesize'
  model              TEXT NOT NULL,
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd           NUMERIC(12, 6) NOT NULL DEFAULT 0,
  latency_ms         INTEGER NOT NULL DEFAULT 0,
  symbol             TEXT,
  style              TEXT,
  mode               TEXT,                     -- 'live' | 'backtest'
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_log(created_at DESC);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_select_own" ON ai_usage_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ai_usage_insert_own" ON ai_usage_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);
