"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { canAffordMargin, lockMargin, settleMargin } from "@/lib/paper-wallet";
import { runArbitrageResolve } from "@/lib/arbitrage/resolve";

/**
 * 수동 cron 트리거 — 로컬 dev 테스트 또는 즉시 사이클 확인용.
 * resolve 로직을 직접 호출 (HTTP round-trip 없음).
 */
export async function runArbitrageCronAction(): Promise<{
  ok: boolean;
  error?: string;
  checked?: number;
  cycles?: number;
  closed?: number;
}> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  try {
    const result = await runArbitrageResolve();
    revalidatePath("/app/arbitrage");
    return {
      ok: true,
      checked: result.checked,
      cycles: result.cycles,
      closed: result.closed,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "사이클 실행 실패",
    };
  }
}

/**
 * 리밸런싱 인벤토리 모델 — 진입 입력.
 *
 * 사용자는 한쪽 다리 노출(USD) + 리밸런싱 임계값(%)을 지정.
 * 시스템은 양쪽 거래소에 BTC 절반씩 + 나머지 USDT 절반씩 보유한 상태로 시작.
 * 김프가 ±threshold 도달 시 cron이 자동 리밸런싱하여 사이클당 수익 누적.
 */
export interface EnterArbitrageInput {
  symbol: string;
  /** 한쪽 다리 노출 (USD). 총 마진 = 2 × notional. */
  notionalUsd: number;
  /** 진입 시점 Upbit BTC 가격 (USD 환산) — UI에서 시세 prefill */
  upbitPriceUsd: number;
  /** 진입 시점 Binance BTC 가격 (USD) */
  binancePriceUsd: number;
  /** 진입 시점 김프 % (참고 기록용) */
  entryPremiumPct?: number;
  /** 리밸런싱 발동 임계값 |김프| % (기본 1.0). */
  thresholdPct?: number;
}

export async function enterArbitrageAction(
  p: EnterArbitrageInput,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  if (!Number.isFinite(p.notionalUsd) || p.notionalUsd < 100)
    return { ok: false, error: "노출 금액은 $100 이상이어야 합니다." };
  if (p.notionalUsd > 100_000)
    return { ok: false, error: "노출 금액은 $100,000 이하" };
  if (
    !Number.isFinite(p.upbitPriceUsd) ||
    !Number.isFinite(p.binancePriceUsd) ||
    p.upbitPriceUsd <= 0 ||
    p.binancePriceUsd <= 0
  )
    return { ok: false, error: "가격 정보가 유효하지 않습니다." };

  const threshold = p.thresholdPct ?? 1.0;
  if (!Number.isFinite(threshold) || threshold < 0.2 || threshold > 10)
    return {
      ok: false,
      error:
        "리밸런싱 임계값은 0.2~10% 사이여야 합니다 (0.12% 미만은 수수료+슬리피지로 손실).",
    };

  // 양쪽 다리 노출 = 2 × notional. 양쪽 모두 1× (마진 = 노출 전액).
  const totalMargin = p.notionalUsd * 2;

  const afford = await canAffordMargin(user.id, totalMargin);
  if (!afford.ok) return { ok: false, error: afford.reason };

  // 인벤토리 초기 분배:
  //  - 양쪽 각각 notional USD 가치의 BTC 보유 (= USDT의 절반은 BTC로 환전 효과)
  //  - 리밸런싱 여유분으로 양쪽에 USDT 도 일부 보유 (절반은 BTC, 절반은 USDT)
  const halfUsd = p.notionalUsd / 2;
  const btcUpbit = halfUsd / p.upbitPriceUsd;
  const btcBinance = halfUsd / p.binancePriceUsd;
  const usdtUpbit = halfUsd;
  const usdtBinance = halfUsd;

  // 평균 진입 BTC 가격 (수익률 계산 베이스)
  const avgBtcPriceUsd = (p.upbitPriceUsd + p.binancePriceUsd) / 2;

  const { data, error } = await supabase
    .from("arbitrage_positions")
    .insert({
      user_id: user.id,
      kind: "kimchi",
      symbol: p.symbol,
      notional_usd: p.notionalUsd,
      // 기존 헤지 모델 필드는 진입 가격만 기록 (호환성)
      long_exchange: "upbit",
      long_entry_price: p.upbitPriceUsd,
      long_qty: btcUpbit,
      short_exchange: "binance",
      short_entry_price: p.binancePriceUsd,
      short_qty: btcBinance,
      entry_premium_pct: p.entryPremiumPct ?? null,
      // 인벤토리 모델 신규 필드
      inventory_btc_upbit: btcUpbit,
      inventory_btc_binance: btcBinance,
      inventory_usdt_upbit: usdtUpbit,
      inventory_usdt_binance: usdtBinance,
      target_threshold_pct: threshold,
      cycles_count: 0,
      accrued_cycle_pnl: 0,
      btc_price_at_entry_usd: avgBtcPriceUsd,
      // 인벤토리 모델은 cron이 사이클로 청산하므로 target_premium_pct는 미사용 (null)
      target_premium_pct: null,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "진입 실패" };

  await lockMargin({
    userId: user.id,
    margin: totalMargin,
    tradeId: data.id,
    note: `김프 리밸런싱 (${p.symbol}, ±${threshold.toFixed(1)}%)`,
  });

  revalidatePath("/app/arbitrage");
  return { ok: true, id: data.id };
}

/**
 * 리밸런싱 인벤토리 청산 — 양쪽 BTC 를 청산 시점 가격으로 USDT 환산 + 누적 사이클 수익 + BTC 가격 노출 손익 합산.
 */
export async function closeArbitrageAction(
  id: string,
  upbitPriceUsdNow: number,
  binancePriceUsdNow: number,
): Promise<{ ok: boolean; error?: string; pnl?: number }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: pos, error } = await supabase
    .from("arbitrage_positions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !pos) return { ok: false, error: "포지션을 찾을 수 없습니다." };
  if (pos.status !== "open")
    return { ok: false, error: "이미 종료된 포지션입니다." };
  if (!Number.isFinite(upbitPriceUsdNow) || !Number.isFinite(binancePriceUsdNow))
    return { ok: false, error: "청산 가격이 유효하지 않습니다." };

  const btcUpbit = Number(pos.inventory_btc_upbit ?? 0);
  const btcBinance = Number(pos.inventory_btc_binance ?? 0);
  const usdtUpbit = Number(pos.inventory_usdt_upbit ?? 0);
  const usdtBinance = Number(pos.inventory_usdt_binance ?? 0);
  const accrued = Number(pos.accrued_cycle_pnl ?? 0);
  const notional = Number(pos.notional_usd);

  // 청산 시 보유 BTC를 USDT로 환산 (양쪽 거래소 가격 적용)
  const upbitBtcValueUsd = btcUpbit * upbitPriceUsdNow;
  const binanceBtcValueUsd = btcBinance * binancePriceUsdNow;

  const finalTotalUsd =
    upbitBtcValueUsd + usdtUpbit + binanceBtcValueUsd + usdtBinance;

  // 시작 자본 = 2 × notional
  // realizedPnl = (현재 가치 - 시작 자본) — 누적 사이클 수익은 이미 finalTotalUsd 에 반영됨
  // 단순화: realizedPnl = finalTotalUsd - 2*notional (사이클 수익 + BTC 가격 변동 포함)
  const grossPnl = finalTotalUsd - 2 * notional;

  // 수수료: 진입 시 2회 매수 + 청산 시 2회 매도 = 4회 fills × notional × 0.04% = 0.16% × notional
  // 사이클별 수수료는 별도로 누적 (사이클 처리 시 차감했다고 가정)
  const fees = 2 * notional * 0.0008;
  const realizedPnl = grossPnl - fees;

  const { error: upErr } = await supabase
    .from("arbitrage_positions")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      long_exit_price: upbitPriceUsdNow,
      short_exit_price: binancePriceUsdNow,
      realized_pnl: realizedPnl,
      close_reason: "manual",
    })
    .eq("id", id);

  if (upErr) return { ok: false, error: upErr.message };

  await settleMargin({
    userId: user.id,
    margin: 2 * notional,
    realizedPnl,
    tradeId: id,
  });

  revalidatePath("/app/arbitrage");
  return { ok: true, pnl: realizedPnl };
}
