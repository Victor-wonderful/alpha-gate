import type Anthropic from "@anthropic-ai/sdk";

/**
 * AI 사용량/원가 계측 — LLM 호출마다 토큰·원가·지연을 모아 분석 종료 시 ai_usage_log에 기록.
 * 유료 구독 제품화를 위한 실제 단위 경제(회당 원가·속도) 측정용. cf. migration 0040.
 */

// $/1M 토큰 (2026-06 기준). 캐시 읽기 ≈ 입력가 0.1×, 캐시 쓰기(5분 TTL) ≈ 입력가 1.25×.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-opus-4-8": { input: 5, output: 25 },
};
const DEFAULT_PRICE = { input: 3, output: 15 };

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export interface AiCallRecord {
  stage: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  latencyMs: number;
}

export interface AiMeter {
  calls: AiCallRecord[];
}

export function newMeter(): AiMeter {
  return { calls: [] };
}

/** usage → USD 원가. 입력은 캐시 미적중분만(input_tokens), 캐시 읽기/쓰기는 별도 배율. */
export function costForUsage(model: string, u: Usage): number {
  const p = PRICING[model] ?? DEFAULT_PRICE;
  const inTok = u.input_tokens ?? 0;
  const outTok = u.output_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  return (
    (inTok / 1e6) * p.input +
    (cacheRead / 1e6) * p.input * 0.1 +
    (cacheWrite / 1e6) * p.input * 1.25 +
    (outTok / 1e6) * p.output
  );
}

/** LLM 응답 1건을 미터에 기록. meter가 없으면 no-op(호출부에서 optional). */
export function meterCall(
  meter: AiMeter | undefined,
  args: { stage: string; model: string; message: Anthropic.Message; latencyMs: number },
): void {
  if (!meter) return;
  const u = args.message.usage as Usage;
  meter.calls.push({
    stage: args.stage,
    model: args.model,
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    costUsd: costForUsage(args.model, u),
    latencyMs: args.latencyMs,
  });
}

export function meterTotals(meter: AiMeter) {
  return meter.calls.reduce(
    (a, c) => ({
      costUsd: a.costUsd + c.costUsd,
      latencyMs: a.latencyMs + c.latencyMs,
      inputTokens: a.inputTokens + c.inputTokens,
      outputTokens: a.outputTokens + c.outputTokens,
    }),
    { costUsd: 0, latencyMs: 0, inputTokens: 0, outputTokens: 0 },
  );
}

// Supabase 클라이언트를 느슨하게 타이핑 — .from().insert()만 필요.
// PostgrestFilterBuilder는 thenable(PromiseLike)이라 Promise가 아니므로 PromiseLike로 받는다.
interface InsertableClient {
  from(table: string): {
    insert(rows: unknown[]): PromiseLike<{ error: { message: string } | null }>;
  };
}

/** 미터의 모든 호출을 ai_usage_log에 기록 (best-effort — 실패해도 분석에 영향 없음). */
export async function persistAiUsage(
  supabase: InsertableClient,
  ctx: {
    userId: string;
    analysisId: string | null;
    symbol: string;
    style: string;
    mode: string;
    meter: AiMeter;
  },
): Promise<void> {
  if (ctx.meter.calls.length === 0) return;
  const rows = ctx.meter.calls.map((c) => ({
    user_id: ctx.userId,
    analysis_id: ctx.analysisId,
    stage: c.stage,
    model: c.model,
    input_tokens: c.inputTokens,
    output_tokens: c.outputTokens,
    cache_read_tokens: c.cacheReadTokens,
    cache_write_tokens: c.cacheWriteTokens,
    cost_usd: Number(c.costUsd.toFixed(6)),
    latency_ms: c.latencyMs,
    symbol: ctx.symbol,
    style: ctx.style,
    mode: ctx.mode,
  }));
  try {
    const { error } = await supabase.from("ai_usage_log").insert(rows);
    if (error) console.error("[ai-usage] insert failed:", error.message);
  } catch (e) {
    console.error("[ai-usage] insert threw:", e instanceof Error ? e.message : e);
  }
}
