import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";
import { loadLatestRadar } from "@/lib/analysis/radar-persist";
import { buildSnapshot } from "@/lib/analysis/analyze";
import { buildCodeReport } from "@/lib/analysis/code-scenario";
import { gradeTrade } from "@/lib/grading";
import { sizePosition } from "@/lib/sizing";
import { getMoneyContext } from "@/lib/money-management";
import { TRIGGER_CHECK_KEYS, type TradeInput, type Timeframe } from "@/types/trade";
import type { TradingStyle } from "@/lib/analysis/style";

/**
 * 자동매매 봇 엔진 (Phase 1 — 가상 전용).
 *
 * 사람이 [분석 → 등급 확인 → 발주]하던 과정을 규칙으로 자동화한다:
 *   신호(레이더 후보) → 코드 시나리오(AI 불필요) → 등급·위험예산 게이트 →
 *   통과분만 "되돌림 지정가"로 자동 예약(is_paper). 체결·청산·만료는 기존 크론 재사용.
 *
 * 안전장치(제품 정체성):
 *  - 지정가(되돌림)만. 시장가 추격 금지(지는 구조로 검증됨).
 *  - 등급 < min_grade, D등급, 위험예산 초과, 중복코인, 일일손실한도 도달 → 자동 차단.
 *  - dryRun=true 면 평가만 하고 발주하지 않는다(검증용).
 */

const GRADE_RANK: Record<string, number> = { A: 3, B: 2, C: 1, D: 0 };

// 스타일 → 거래 timeframe (resolve-trades TIMEOUT_MS 키와 일치).
const STYLE_TF: Record<"day" | "swing", Timeframe> = { day: "1h", swing: "4h" };
// 스타일별 지정가 유효기간(ms) — 만료 시 fill-limit-orders/expiry-sweep 가 취소.
const STYLE_EXPIRY_MS: Record<"day" | "swing", number> = {
  day: 24 * 60 * 60_000,
  swing: 72 * 60 * 60_000,
};
const PAPER_FEES_PCT = 0.075;
const MAX_SCAN = 8; // 한 실행에서 스냅샷 조회할 심볼 상한(네트워크 보호).

export interface AutoTradeConfig {
  user_id: string;
  enabled: boolean;
  style: "day" | "swing";
  min_grade: "A" | "B" | "C";
  direction_filter: "both" | "long" | "short";
  symbol_source: "radar" | "fixed";
  fixed_symbols: string[];
  max_concurrent: number;
  risk_pct: number;
  daily_loss_limit_r: number;
  leverage: number;
}

export interface AutoTradeDecision {
  symbol: string;
  direction: "long" | "short";
  grade: string;
  entry: number;
  stop: number;
  target: number;
  placed: boolean;
  skipped?: string; // 스킵 사유
}

export interface AutoTradeRunResult {
  userId: string;
  evaluated: number;
  placed: number;
  decisions: AutoTradeDecision[];
  note?: string;
}

/** 한 사용자의 봇 규칙을 1회 실행. dryRun 이면 발주하지 않고 결정만 반환. */
export async function runAutoTradeForUser(
  config: AutoTradeConfig,
  opts: { dryRun?: boolean } = {},
): Promise<AutoTradeRunResult> {
  const svc = getSupabaseService();
  const dryRun = !!opts.dryRun;
  const decisions: AutoTradeDecision[] = [];
  const result: AutoTradeRunResult = { userId: config.user_id, evaluated: 0, placed: 0, decisions };

  if (!config.enabled) return { ...result, note: "disabled" };

  // 계좌 자금 — 프로필 기본값 → 없으면 가상지갑 잔액 → 10000.
  const { data: profile } = await svc
    .from("profiles")
    .select("default_account_size")
    .eq("id", config.user_id)
    .maybeSingle();
  const { data: wallet } = await svc
    .from("paper_wallets")
    .select("usdt_balance")
    .eq("user_id", config.user_id)
    .maybeSingle();
  const accountSize =
    Number(profile?.default_account_size) || Number(wallet?.usdt_balance) || 10_000;

  const money = await getMoneyContext(accountSize, { client: svc, userId: config.user_id });

  // 게이트 0: 일일 손실 한도 도달 → 그날 봇 정지.
  if (money.todayCumulativeR <= config.daily_loss_limit_r) {
    return { ...result, note: `daily loss limit hit (${money.todayCumulativeR.toFixed(2)}R)` };
  }

  // 게이트 1: 봇의 현재 진행 포지션(오픈+예약) 수 상한.
  const { data: botOpen } = await svc
    .from("trades")
    .select("id")
    .eq("user_id", config.user_id)
    .eq("is_paper", true)
    .is("closed_at", null)
    .in("order_status", ["filled", "pending"])
    .filter("context_flags->>bot", "eq", "true");
  const botCount = botOpen?.length ?? 0;
  let slots = config.max_concurrent - botCount;
  if (slots <= 0) return { ...result, note: `max concurrent reached (${botCount}/${config.max_concurrent})` };

  // 신호 소스 심볼.
  let symbols: string[];
  if (config.symbol_source === "fixed") {
    symbols = config.fixed_symbols.slice(0, MAX_SCAN);
  } else {
    const radar = await loadLatestRadar().catch(() => ({ candidates: [] as { symbol: string }[] }));
    symbols = radar.candidates.map((c) => c.symbol).slice(0, MAX_SCAN);
  }
  if (symbols.length === 0) return { ...result, note: "no signal symbols" };

  const style = config.style as TradingStyle;
  const openSymbols = new Set(money.openPositions.map((p) => p.symbol));
  const now = Date.now();

  for (const symbol of symbols) {
    if (slots <= 0) break;
    // 중복 코인 — 이미 (봇이든 수동이든) 진행 중이면 스킵.
    if (openSymbols.has(symbol)) {
      decisions.push({ symbol, direction: "long", grade: "-", entry: 0, stop: 0, target: 0, placed: false, skipped: "duplicate symbol" });
      continue;
    }

    let snapshot;
    try {
      snapshot = await buildSnapshot(symbol, style);
    } catch {
      decisions.push({ symbol, direction: "long", grade: "-", entry: 0, stop: 0, target: 0, placed: false, skipped: "snapshot failed" });
      continue;
    }
    result.evaluated++;

    const { report } = buildCodeReport(snapshot);
    const sc = report.scenarios[0];
    if (!sc) {
      decisions.push({ symbol, direction: "long", grade: "-", entry: 0, stop: 0, target: 0, placed: false, skipped: "no scenario" });
      continue;
    }

    const direction = sc.direction;
    // 방향 필터.
    if (config.direction_filter !== "both" && config.direction_filter !== direction) {
      decisions.push({ symbol, direction, grade: "-", entry: 0, stop: 0, target: 0, placed: false, skipped: `direction filtered (${direction})` });
      continue;
    }

    const entry = (sc.entryZone.low + sc.entryZone.high) / 2;
    const stop = sc.invalidation;
    const target = sc.target;
    const price = snapshot.ticker.last;

    // 되돌림 지정가 방향 검증 — 롱은 진입가가 현재가보다 낮고, 숏은 높아야 한다.
    // (코드 시나리오는 항상 되돌림이라 정상이지만, 방어적으로 확인.)
    const isRetraceLimit =
      direction === "long" ? entry < price : entry > price;
    if (!isRetraceLimit) {
      decisions.push({ symbol, direction, grade: "-", entry, stop, target, placed: false, skipped: "not a retracement limit" });
      continue;
    }

    // 등급 계산 — 사람이 거래 실행 페이지에서 보던 것과 동일 기준.
    const marketCtx = {
      btcPrice: null,
      btc24hChangePct: null,
      symbolPrice: price,
      fundingRate: snapshot.funding?.rate ?? null,
      minutesToFunding: snapshot.funding?.nextFundingTime
        ? Math.max(0, Math.round((snapshot.funding.nextFundingTime - now) / 60_000))
        : null,
    };
    const trigger = Object.fromEntries(TRIGGER_CHECK_KEYS.map((k) => [k, false]));
    const input = {
      symbol,
      direction,
      timeframe: STYLE_TF[config.style],
      entry,
      stop,
      target,
      accountSize,
      allowedLossPct: config.risk_pct,
      market: sc.marketAssessment,
      trigger,
      money,
      marketCtx,
    } as TradeInput;

    const graded = gradeTrade(input, style, sc.strategyHint);

    // 게이트 2: 최소 등급. D는 항상 차단.
    if (GRADE_RANK[graded.grade] < GRADE_RANK[config.min_grade]) {
      decisions.push({ symbol, direction, grade: graded.grade, entry, stop, target, placed: false, skipped: `grade ${graded.grade} < ${config.min_grade}` });
      continue;
    }

    // 게이트 3: 위험 예산 남았는지.
    if ((money.remainingRiskPct ?? 0) <= 0) {
      decisions.push({ symbol, direction, grade: graded.grade, entry, stop, target, placed: false, skipped: "risk budget exhausted" });
      continue;
    }

    // 사이징.
    const sizing = sizePosition({ accountSize, allowedLossPct: config.risk_pct, entry, stop });
    if (sizing.quantity <= 0) {
      decisions.push({ symbol, direction, grade: graded.grade, entry, stop, target, placed: false, skipped: "quantity 0" });
      continue;
    }

    if (dryRun) {
      decisions.push({ symbol, direction, grade: graded.grade, entry, stop, target, placed: false, skipped: "dry-run" });
      slots--;
      openSymbols.add(symbol);
      continue;
    }

    // ── 발주: trades(pending) + pending_limit_orders(limit) ──
    const { data: trade, error: insErr } = await svc
      .from("trades")
      .insert({
        user_id: config.user_id,
        symbol,
        direction,
        timeframe: STYLE_TF[config.style],
        entry,
        stop,
        target,
        account_size: accountSize,
        allowed_loss_pct: config.risk_pct,
        position_quantity: sizing.quantity,
        market_checks: sc.marketAssessment,
        psych_checks: {},
        context_flags: { leverage: config.leverage, bot: true, limitOrder: true, autoStyle: config.style },
        pre_grade: graded.grade,
        pre_score: graded.score,
        pre_score_breakdown: graded.reasons ?? [],
        pre_actions: [],
        pre_rr: graded.rr,
        simulation_meta: null,
        entry_actual: null,
        entry_slippage_pct: 0,
        fees_pct: PAPER_FEES_PCT,
        paper_margin: null,
        is_paper: true,
        order_type: "limit",
        limit_price: entry,
        order_status: "pending",
        market_type: "futures",
      })
      .select("id")
      .single();

    if (insErr || !trade) {
      decisions.push({ symbol, direction, grade: graded.grade, entry, stop, target, placed: false, skipped: `insert failed: ${insErr?.message ?? "?"}` });
      continue;
    }

    const expiresAt = new Date(now + STYLE_EXPIRY_MS[config.style]).toISOString();
    const { error: ploErr } = await svc.from("pending_limit_orders").insert({
      user_id: config.user_id,
      trade_id: trade.id,
      symbol,
      direction,
      limit_price: entry,
      quantity: sizing.quantity,
      leverage: config.leverage,
      stop,
      target,
      order_kind: "limit",
      expires_at: expiresAt,
    });
    if (ploErr) {
      // 주문 등록 실패 → trade 롤백.
      await svc.from("trades").delete().eq("id", trade.id);
      decisions.push({ symbol, direction, grade: graded.grade, entry, stop, target, placed: false, skipped: `order failed: ${ploErr.message}` });
      continue;
    }

    decisions.push({ symbol, direction, grade: graded.grade, entry, stop, target, placed: true });
    result.placed++;
    slots--;
    openSymbols.add(symbol);
  }

  // last_run_at 갱신 (실발주 실행에서만).
  if (!dryRun) {
    await svc.from("auto_trade_configs").update({ last_run_at: new Date().toISOString() }).eq("user_id", config.user_id);
  }

  return result;
}

/** 모든 enabled 봇 규칙을 순회 실행 (크론에서 호출). */
export async function runAllAutoTrades(): Promise<{ users: number; placed: number }> {
  const svc = getSupabaseService();
  const { data: configs } = await svc
    .from("auto_trade_configs")
    .select("*")
    .eq("enabled", true);
  let placed = 0;
  for (const c of configs ?? []) {
    try {
      const r = await runAutoTradeForUser(c as AutoTradeConfig);
      placed += r.placed;
    } catch (e) {
      console.error(`[auto-trade] user=${(c as { user_id?: string }).user_id} 실행 오류:`, e instanceof Error ? e.message : e);
    }
  }
  return { users: configs?.length ?? 0, placed };
}
