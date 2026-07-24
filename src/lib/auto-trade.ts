import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";
import { loadLatestRadar } from "@/lib/analysis/radar-persist";
import { fetchTicker24h } from "@/lib/analysis/binance";
import { buildSnapshot } from "@/lib/analysis/analyze";
import { buildCodeReport } from "@/lib/analysis/code-scenario";
import { gradeTrade } from "@/lib/grading";
import { recommendTradeParams } from "@/lib/recommend";
import { sizePosition } from "@/lib/sizing";
import { buildLadder, type LadderTierInput } from "@/lib/ladder";
import { getMoneyContext } from "@/lib/money-management";
import { dispatch } from "@/lib/notify-dispatch";
import { TRIGGER_CHECK_KEYS, TOTAL_RISK_BUDGET_PCT, type TradeInput, type Timeframe } from "@/types/trade";
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
// 미실현손실 브레이크 — 진행 중 포지션들의 평가손익 합이 계좌의 이 % 이하로 내려가면
// 신규 진입 중단(안전장치, 사용자 조절 불가). 위험예산(6%)이 "손절 시 손실"만 보는
// 사각을 메운다: 동조 급락으로 여러 포지션이 동시에 물려 평가손실이 커지는 상황을 차단.
const UNREALIZED_HALT_PCT = -4;
// 합계 마진 상한 — 오픈+예약 포지션의 필요 마진 합이 계좌의 이 %를 넘으면 신규 진입 중단.
// 가상이라도 "가진 자금 이상으로 마진 못 쓴다"를 실거래처럼 강제(레버리지/노출 폭주 차단).
// 위험 예산(6%)이 "손절 시 손실"만 보는 사각을 메운다: 타이트한 손절은 6% 위험을
// 계좌의 수배 노출로 바꾸는데, 그 레버리지 자체는 예산이 안 막았다.
const MAX_GROSS_MARGIN_PCT = 100;

/** 봇이 넣은(오픈+예약) 선물 포지션의 필요 마진 합(USDT). 봉투 모델 — 봇 몫만. */
async function computeUsedMargin(
  svc: ReturnType<typeof getSupabaseService>,
  userId: string,
): Promise<number> {
  const { data } = await svc
    .from("trades")
    .select("entry, limit_price, position_quantity, context_flags, market_type, order_status")
    .eq("user_id", userId)
    .eq("is_paper", true)
    .is("closed_at", null)
    .in("order_status", ["filled", "pending"])
    .filter("context_flags->>bot", "eq", "true")
    .limit(100);
  let margin = 0;
  for (const r of (data ?? []) as Array<{
    entry?: number | null; limit_price?: number | null; position_quantity?: number | null;
    context_flags?: { dcaPlanId?: string; leverage?: number } | null; market_type?: string | null;
  }>) {
    if (r.context_flags?.dcaPlanId || r.market_type === "spot") continue;
    const px = Number(r.entry ?? r.limit_price) || 0;
    const qty = Number(r.position_quantity) || 0;
    const lev = Number(r.context_flags?.leverage) || 1;
    if (px > 0 && qty > 0 && lev > 0) margin += (px * qty) / lev;
  }
  return margin;
}

/** 봇이 넣은(오픈+예약) 선물 포지션의 위험(|진입-손절|×수량) 합(USDT). 봉투 모델 — 봇 몫만. */
async function computeBotUsedRisk(
  svc: ReturnType<typeof getSupabaseService>,
  userId: string,
): Promise<number> {
  const { data } = await svc
    .from("trades")
    .select("entry, limit_price, stop, position_quantity, context_flags, market_type, order_status")
    .eq("user_id", userId)
    .eq("is_paper", true)
    .is("closed_at", null)
    .in("order_status", ["filled", "pending"])
    .filter("context_flags->>bot", "eq", "true")
    .limit(100);
  let risk = 0;
  for (const r of (data ?? []) as Array<{
    entry?: number | null; limit_price?: number | null; stop?: number | null;
    position_quantity?: number | null; context_flags?: { dcaPlanId?: string } | null; market_type?: string | null;
  }>) {
    if (r.context_flags?.dcaPlanId || r.market_type === "spot") continue;
    const px = Number(r.entry ?? r.limit_price) || 0;
    const stop = Number(r.stop) || 0;
    const qty = Number(r.position_quantity) || 0;
    if (px > 0 && stop > 0 && qty > 0) risk += Math.abs(px - stop) * qty;
  }
  return risk;
}

/** 진행 중(체결·미마감) 선물 가상 포지션들의 평가손익 합을 계좌 대비 %로. DCA·현물 제외. */
async function computeUnrealizedPct(
  svc: ReturnType<typeof getSupabaseService>,
  userId: string,
  accountSize: number,
): Promise<number> {
  const { data } = await svc
    .from("trades")
    .select("symbol, direction, entry, entry_actual, position_quantity, context_flags, market_type")
    .eq("user_id", userId)
    .eq("is_paper", true)
    .is("closed_at", null)
    .eq("order_status", "filled")
    .limit(50);
  const rows = (data ?? []).filter(
    (r: { context_flags?: { dcaPlanId?: string } | null; market_type?: string | null }) =>
      !r.context_flags?.dcaPlanId && r.market_type !== "spot",
  );
  if (rows.length === 0 || accountSize <= 0) return 0;
  const symbols = [...new Set(rows.map((r: { symbol: string }) => r.symbol))];
  const prices: Record<string, number> = {};
  await Promise.all(
    symbols.map(async (s) => {
      try {
        prices[s] = (await fetchTicker24h(s)).lastPrice;
      } catch {
        // 시세 실패 시 해당 심볼은 평가손익 0으로 취급(보수적으로 브레이크 약화 안 함 위해 스킵)
      }
    }),
  );
  let pnl = 0;
  for (const r of rows) {
    const px = prices[r.symbol];
    if (!px) continue;
    const entry = Number(r.entry_actual ?? r.entry);
    const qty = Number(r.position_quantity ?? 0);
    pnl += (r.direction === "long" ? px - entry : entry - px) * qty;
  }
  return (pnl / accountSize) * 100;
}

/** 레이더 bestStyle(scalp/day/swing/position)을 봇이 지원하는 2종(day/swing)으로 접는다.
 *  스캘프→데이(임펄스), 포지션→스윙(모멘텀). 코어 페르소나가 임펄스·모멘텀이라 그 둘로 수렴. */
function normalizeStyle(s: TradingStyle): "day" | "swing" {
  return s === "swing" || s === "position" ? "swing" : "day";
}

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

/**
 * 봇 발주 — 분할(라더) 또는 단일. 티어들을 같은 entry_group_id 로 묶어 한 세트로 예약한다.
 * 총수량은 buildLadder 가 가중평균 진입↔공유 손절 기준 위험 %로 산정 → 비중 배분.
 * 전부 되돌림 지정가(order_status=pending). 체결/청산은 기존 크론이 처리.
 */
async function placeBotLadder(
  svc: ReturnType<typeof getSupabaseService>,
  args: {
    config: AutoTradeConfig;
    symbol: string;
    direction: "long" | "short";
    style: "day" | "swing";
    tiers: LadderTierInput[];
    stop: number;
    target: number;
    currentPrice: number;
    leverage: number;
    graded: { grade: string; score: number; reasons?: unknown; rr: number };
    riskPct: number;
    accountSize: number;
    expiresAt: string;
    marketChecks: Record<string, boolean>;
    strategyHint: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const built = buildLadder({
    direction: args.direction,
    tiers: args.tiers,
    stop: args.stop,
    target: args.target,
    accountSize: args.accountSize,
    riskPct: args.riskPct,
    currentPrice: args.currentPrice,
  });
  if (!built.ok) return { ok: false, error: built.error ?? "ladder sizing 실패" };
  const placeable = built.tiers.filter((t) => t.quantity > 0);
  if (placeable.length === 0) return { ok: false, error: "quantity 0" };

  const groupId = crypto.randomUUID();
  const isLadder = placeable.length > 1;
  const rollback = async () => {
    await svc.from("pending_limit_orders").delete().eq("entry_group_id", groupId).eq("user_id", args.config.user_id);
    await svc.from("trades").delete().eq("entry_group_id", groupId).eq("user_id", args.config.user_id);
  };

  for (const t of placeable) {
    const posMargin = args.leverage > 0 ? (t.quantity * t.price) / args.leverage : t.quantity * t.price;
    const pre_rr = t.price - args.stop !== 0 ? Math.abs((args.target - t.price) / (t.price - args.stop)) : args.graded.rr;
    const { data: trade, error: insErr } = await svc
      .from("trades")
      .insert({
        user_id: args.config.user_id,
        symbol: args.symbol,
        direction: args.direction,
        timeframe: STYLE_TF[args.style],
        entry: t.price,
        stop: args.stop,
        target: args.target,
        account_size: args.accountSize,
        allowed_loss_pct: args.config.risk_pct,
        position_quantity: t.quantity,
        market_checks: args.marketChecks,
        psych_checks: {},
        context_flags: { leverage: args.leverage, bot: true, limitOrder: true, ladder: isLadder, autoStyle: args.style, strategy: args.strategyHint },
        pre_grade: args.graded.grade,
        pre_score: args.graded.score,
        pre_score_breakdown: args.graded.reasons ?? [],
        pre_actions: [],
        pre_rr,
        simulation_meta: null,
        entry_actual: null,
        entry_slippage_pct: 0,
        fees_pct: PAPER_FEES_PCT,
        paper_margin: posMargin,
        is_paper: true,
        order_type: "limit",
        limit_price: t.price,
        order_status: "pending",
        market_type: "futures",
        entry_group_id: groupId,
        entry_tier: t.tier,
        entry_weight: t.weight,
      })
      .select("id")
      .single();
    if (insErr || !trade) {
      await rollback();
      return { ok: false, error: `insert failed: ${insErr?.message ?? "?"}` };
    }
    const { error: ploErr } = await svc.from("pending_limit_orders").insert({
      user_id: args.config.user_id,
      trade_id: trade.id,
      symbol: args.symbol,
      direction: args.direction,
      limit_price: t.price,
      quantity: t.quantity,
      leverage: args.leverage,
      stop: args.stop,
      target: args.target,
      order_kind: "limit",
      expires_at: args.expiresAt,
      entry_group_id: groupId,
      entry_tier: t.tier,
    });
    if (ploErr) {
      await rollback();
      return { ok: false, error: `order failed: ${ploErr.message}` };
    }
  }
  return { ok: true };
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

  // 봉투 모델 — 봇은 "맡긴 돈"(bot_alloc_amount)만 굴린다. 전체 자금 중 봇 몫.
  // select("*") — bot_alloc_amount 컬럼이 아직 없어도(마이그 0048 전) 깨지지 않게.
  const { data: profile } = await svc
    .from("profiles")
    .select("*")
    .eq("id", config.user_id)
    .maybeSingle();
  const total = Number(profile?.default_account_size) || 10_000;
  const accountSize = Math.min(Math.max(0, Number(profile?.bot_alloc_amount) || 0), total);
  // 봇에 배정된 자금이 없으면 발주하지 않는다(수동이 전체를 씀).
  if (accountSize <= 0) return { ...result, note: "no bot allocation" };

  const money = await getMoneyContext(accountSize, { client: svc, userId: config.user_id });
  // 위험 예산을 "봇 몫" 기준으로 재계산 — money.usedRiskPct 는 계좌 전체(봇+수동) 위험이라
  // 봇 자금 대비로는 과대집계된다. 봇 포지션만 세어 봇 자금 대비로 덮어쓴다(수동과 분리).
  const botRisk = await computeBotUsedRisk(svc, config.user_id);
  money.usedRiskPct = accountSize > 0 ? (botRisk / accountSize) * 100 : 0;
  money.remainingRiskPct = Math.max(0, TOTAL_RISK_BUDGET_PCT - money.usedRiskPct);

  // 게이트 0: 일일 손실 한도 도달 → 그날 봇 정지.
  if (money.todayCumulativeR <= config.daily_loss_limit_r) {
    return { ...result, note: `daily loss limit hit (${money.todayCumulativeR.toFixed(2)}R)` };
  }

  // 게이트 0.5: 미실현손실 브레이크 — 진행 중 포지션 평가손실이 계좌의 -4% 이하면 신규 진입 중단.
  const unrealizedPct = await computeUnrealizedPct(svc, config.user_id, accountSize);
  if (unrealizedPct <= UNREALIZED_HALT_PCT) {
    return { ...result, note: `unrealized loss halt (${unrealizedPct.toFixed(1)}%)` };
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

  // 신호 소스 — 코인마다 어울리는 스타일을 함께 정한다.
  // 레이더: 각 후보의 bestStyle(코인별 자동 판정)을 그대로 사용 → 사용자는 스타일 신경 안 씀.
  // 고정 심볼: 판정 근거가 없어 데이(임펄스) 기본.
  let targets: { symbol: string; style: "day" | "swing" }[];
  if (config.symbol_source === "fixed") {
    targets = config.fixed_symbols.slice(0, MAX_SCAN).map((s) => ({ symbol: s, style: "day" as const }));
  } else {
    // ⚠️ service role(svc)을 주입 — 크론엔 로그인 세션이 없어 기본 경로면 RLS에 막혀
    // 레이더가 빈 배열로 온다(봇이 조용히 "후보 없음"으로 멈추던 원인). cf. radar-persist.ts
    const radar = await loadLatestRadar(svc).catch(
      () => ({ candidates: [] as { symbol: string; bestStyle: TradingStyle }[] }),
    );
    targets = radar.candidates
      .slice(0, MAX_SCAN)
      .map((c) => ({ symbol: c.symbol, style: normalizeStyle(c.bestStyle) }));
  }
  if (targets.length === 0) return { ...result, note: "no signal symbols" };

  const openSymbols = new Set(money.openPositions.map((p) => p.symbol));
  const now = Date.now();

  // 위험·마진을 실행 내내 누적 차감한다 — money 는 실행 시작 시점 스냅샷이라,
  // 한 번의 실행에서 여러 건 넣을 때 예산·마진을 실시간으로 깎지 않으면 상한을 넘긴다.
  let usedRiskPct = money.usedRiskPct ?? 0;
  let usedMargin = await computeUsedMargin(svc, config.user_id);
  const marginCap = accountSize * (MAX_GROSS_MARGIN_PCT / 100);

  for (const { symbol, style } of targets) {
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

    const { strategy: codeStrat, report } = buildCodeReport(snapshot);
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
      timeframe: STYLE_TF[style],
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

    // 거래당 리스크·레버리지 — 등급 기반 동적(최대 1% × 등급배수: A1.0/B0.5/C0.25) +
    // 청산 안전 레버리지. 수동(거래 평가)과 동일한 recommendTradeParams 로 통일.
    // 강도 프리셋의 risk_pct 는 상한으로만 쓰인다(1% 하드캡). 위험 예산은 아래 게이트가 처리.
    const stopPct = entry > 0 ? (Math.abs(entry - stop) / entry) * 100 : 0;
    const rec = recommendTradeParams({
      style,
      grade: graded.grade as "A" | "B" | "C" | "D",
      confidence: codeStrat.confidence ?? 0.5,
      stopPct,
      userPreferredRiskPct: config.risk_pct,
    });
    // 리스크만 등급 기반 동적으로. 레버리지는 강도 프리셋 설정을 유지(Victor 저레버리지 선호).
    const leverage = config.leverage;

    // 사이징 (위험·마진 게이트가 수량을 필요로 해서 먼저 계산).
    const sizing = sizePosition({ accountSize, allowedLossPct: rec.riskPct, entry, stop });
    if (sizing.quantity <= 0) {
      decisions.push({ symbol, direction, grade: graded.grade, entry, stop, target, placed: false, skipped: "quantity 0" });
      continue;
    }

    const posNotional = sizing.quantity * entry;
    const posMargin = leverage > 0 ? posNotional / leverage : posNotional;
    const posRiskPct = accountSize > 0 ? (Math.abs(entry - stop) * sizing.quantity) / accountSize * 100 : 0;

    // 게이트 3: 위험 예산 — 실행 내 차감분까지 반영해 6%를 넘기지 않는다.
    if (usedRiskPct + posRiskPct > TOTAL_RISK_BUDGET_PCT + 1e-9) {
      decisions.push({ symbol, direction, grade: graded.grade, entry, stop, target, placed: false, skipped: "risk budget exhausted" });
      continue;
    }
    // 게이트 4: 합계 마진 상한 — 가진 자금 이상으로 마진 못 씀(가상이라도 실거래처럼).
    if (usedMargin + posMargin > marginCap + 1e-9) {
      decisions.push({ symbol, direction, grade: graded.grade, entry, stop, target, placed: false, skipped: "margin cap" });
      continue;
    }

    // 이 건은 넣기로 확정 → 위험·마진을 즉시 예약(다음 후보 게이트에 반영).
    usedRiskPct += posRiskPct;
    usedMargin += posMargin;

    if (dryRun) {
      decisions.push({ symbol, direction, grade: graded.grade, entry, stop, target, placed: false, skipped: "dry-run" });
      slots--;
      openSymbols.add(symbol);
      continue;
    }

    // ── 발주: 라더(분할) 또는 단일. 티어 수 = 추세강도(강3/중2/약1). ──
    // 시나리오가 구조 레벨로 만든 tiers를 강도로 상한 clamp. 약하면 단일.
    const strength = snapshot.trendMetrics?.strength ?? "weak";
    const maxTiers = strength === "strong" ? 3 : strength === "moderate" ? 2 : 1;
    const scEntries = sc.entries;
    const tiers: LadderTierInput[] =
      scEntries && scEntries.length >= 2
        ? scEntries.slice(0, maxTiers).map((e) => ({ tier: e.tier, price: e.price, weight: e.weight }))
        : [{ tier: 1, price: entry, weight: 100 }];

    const expiresAt = new Date(now + STYLE_EXPIRY_MS[style]).toISOString();
    const placedRes = await placeBotLadder(svc, {
      config,
      symbol,
      direction,
      style,
      tiers,
      stop,
      target,
      currentPrice: price,
      leverage,
      graded: { grade: graded.grade, score: graded.score, reasons: graded.reasons, rr: graded.rr },
      riskPct: rec.riskPct,
      accountSize,
      expiresAt,
      marketChecks: sc.marketAssessment,
      strategyHint: sc.strategyHint ?? "trend_pullback",
    });
    if (!placedRes.ok) {
      decisions.push({ symbol, direction, grade: graded.grade, entry, stop, target, placed: false, skipped: placedRes.error ?? "발주 실패" });
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

interface PendingBotOrder {
  id: string;
  user_id: string;
  symbol: string;
  direction: "long" | "short";
  entry_group_id: string | null;
  context_flags: { autoStyle?: string } | null;
}

/**
 * 추세 무효화 시 봇 예약 자동 취소.
 * 봇이 넣은 미체결 예약(order_status=pending)의 심볼별 현재 추세를 재판정해서,
 * 주문 방향과 현재 추세가 '반대'(롱↔하락 / 숏↔상승)면 그 예약의 미체결 티어를 취소한다.
 *  - range/mixed는 노이즈라 유지(가짜 전환에 과민반응 방지).
 *  - 이미 체결된 티어는 손절 관리로 그대로 둔다(정책 확정: 미체결만 취소).
 */
async function cancelInvalidatedBotOrders(
  svc: ReturnType<typeof getSupabaseService>,
): Promise<{ checked: number; canceled: number }> {
  const { data: pend } = await svc
    .from("trades")
    .select("id, user_id, symbol, direction, entry_group_id, context_flags")
    .eq("is_paper", true)
    .eq("order_status", "pending")
    .is("closed_at", null)
    .filter("context_flags->>bot", "eq", "true")
    .limit(200);
  const rows = (pend ?? []) as PendingBotOrder[];
  if (rows.length === 0) return { checked: 0, canceled: 0 };

  // 심볼별 스타일(첫 주문 기준) → 현재 추세 1회 재판정.
  const styleBySymbol = new Map<string, "day" | "swing">();
  for (const t of rows) {
    if (!styleBySymbol.has(t.symbol)) {
      styleBySymbol.set(t.symbol, (t.context_flags?.autoStyle as "day" | "swing") ?? "day");
    }
  }
  const trendBySymbol = new Map<string, string | undefined>();
  for (const [sym, st] of styleBySymbol) {
    try {
      const snap = await buildSnapshot(sym, st);
      trendBySymbol.set(sym, snap.trendMetrics?.classification);
    } catch {
      // 조회 실패 → 불확실 → 취소하지 않음(안전).
    }
  }

  let canceled = 0;
  const doneGroups = new Set<string>();
  for (const t of rows) {
    const cls = trendBySymbol.get(t.symbol);
    if (!cls) continue;
    const invalid =
      (t.direction === "long" && cls === "down") || (t.direction === "short" && cls === "up");
    if (!invalid) continue;
    const gid = t.entry_group_id ?? t.id;
    if (doneGroups.has(gid)) continue;
    doneGroups.add(gid);
    canceled += await cancelPendingBotGroup(svc, t);
  }
  return { checked: styleBySymbol.size, canceled };
}

/** 미체결 티어만 취소(status=open만) — 체결분은 포지션으로 유지. + 알림. 그룹 없으면 단건. */
async function cancelPendingBotGroup(
  svc: ReturnType<typeof getSupabaseService>,
  t: PendingBotOrder,
): Promise<number> {
  const nowIso = new Date().toISOString();
  let n = 0;
  if (t.entry_group_id) {
    const { data } = await svc
      .from("pending_limit_orders")
      .update({ status: "canceled", resolved_at: nowIso, resolve_reason: "trend_invalidated" })
      .eq("entry_group_id", t.entry_group_id)
      .eq("status", "open")
      .select("trade_id");
    await svc
      .from("trades")
      .update({ order_status: "canceled" })
      .eq("entry_group_id", t.entry_group_id)
      .eq("order_status", "pending");
    n = data?.length ?? 0;
  } else {
    const { data } = await svc
      .from("pending_limit_orders")
      .update({ status: "canceled", resolved_at: nowIso, resolve_reason: "trend_invalidated" })
      .eq("trade_id", t.id)
      .eq("status", "open")
      .select("trade_id");
    await svc
      .from("trades")
      .update({ order_status: "canceled" })
      .eq("id", t.id)
      .eq("order_status", "pending");
    n = (data?.length ?? 0) > 0 ? 1 : 0;
  }
  if (n > 0) {
    await dispatch(t.user_id, "ai_coach_done", {
      title: "⏹ 예약 자동 취소 (추세 전환)",
      body: `${t.symbol} ${t.direction === "long" ? "롱" : "숏"} · 추세가 반대로 바뀌어 미체결 예약을 취소했습니다.`,
    }).catch(() => {});
  }
  return n;
}

/** 모든 enabled 봇 규칙을 순회 실행 (크론에서 호출). */
export async function runAllAutoTrades(): Promise<{ users: number; placed: number; canceled: number }> {
  const svc = getSupabaseService();

  // 발주 전에: 추세가 뒤집힌 미체결 예약을 먼저 취소한다.
  let canceled = 0;
  try {
    canceled = (await cancelInvalidatedBotOrders(svc)).canceled;
  } catch (e) {
    console.error("[auto-trade] 무효화 취소 오류:", e instanceof Error ? e.message : e);
  }

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
  return { users: configs?.length ?? 0, placed, canceled };
}
