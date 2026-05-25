import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseService } from "@/lib/supabase/service";
import { settleMargin } from "@/lib/paper-wallet";
import { fetchKimchiPremium } from "@/lib/market-widgets/kimchi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface OpenKimchiPosition {
  id: string;
  user_id: string;
  symbol: string;
  notional_usd: number;
  inventory_btc_upbit: number;
  inventory_btc_binance: number;
  inventory_usdt_upbit: number;
  inventory_usdt_binance: number;
  target_threshold_pct: number;
  cycles_count: number;
  accrued_cycle_pnl: number;
  expires_at: string;
}

interface KimchiSnapshot {
  symbol: string;
  upbitKrw: number;
  binanceUsd: number;
  usdKrwRate: number;
  premiumPct: number;
}

/**
 * 5분마다 실행. 리밸런싱 인벤토리 모델.
 *
 * 각 open kimchi 포지션 순회:
 *  - 현재 김프 ≥ +threshold → "positive" 사이클 (Upbit 매도 + Binance 매수)
 *  - 현재 김프 ≤ -threshold → "negative" 사이클 (Upbit 매수 + Binance 매도)
 *  - 만료 시 강제 청산 (인벤토리 USDT 환산 + 사이클 수익 합산)
 *
 * 사이클 거래 규모:
 *  - 한 번에 인벤토리의 25% 만큼만 이동 (점진적 리밸런싱, 김프 재발 시 추가 사이클)
 *  - 양쪽 거래소에 BTC/USDT 가 충분히 있는지 확인 후 실행
 *
 * 사이클 수익:
 *  - 캡처 = |김프| × 이동량 (USDT)
 *  - 수수료 차감 (0.08% × 양다리 거래액)
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const svc = getSupabaseService();
  const { data: positions, error } = await svc
    .from("arbitrage_positions")
    .select(
      "id, user_id, symbol, notional_usd, inventory_btc_upbit, inventory_btc_binance, inventory_usdt_upbit, inventory_usdt_binance, target_threshold_pct, cycles_count, accrued_cycle_pnl, expires_at",
    )
    .eq("kind", "kimchi")
    .eq("status", "open")
    .limit(500);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!positions || positions.length === 0)
    return NextResponse.json({ checked: 0, cycles: 0, closed: 0 });

  // 김프 + 가격 스냅샷 한 번에 fetch
  const points = await fetchKimchiPremium();
  const snapshots = new Map<string, KimchiSnapshot>();
  for (const p of points) {
    snapshots.set(p.symbol, {
      symbol: p.symbol,
      upbitKrw: p.upbitKrw,
      binanceUsd: p.binanceUsd,
      usdKrwRate: p.usdKrwRate,
      premiumPct: p.premiumPct,
    });
  }

  const now = Date.now();
  let cycles = 0;
  let closed = 0;
  let errors = 0;
  const results: Array<{
    id: string;
    symbol: string;
    action: string;
    profit?: number;
  }> = [];

  for (const raw of positions) {
    const p = raw as OpenKimchiPosition;
    const snap = snapshots.get(p.symbol);
    const expiresAt = new Date(p.expires_at).getTime();
    const expired = now >= expiresAt;

    // 만료 시 강제 청산
    if (expired) {
      if (!snap) {
        // 스냅 없으면 entry 가격으로 정산 (안전망)
        const finalUsd =
          Number(p.inventory_usdt_upbit) +
          Number(p.inventory_usdt_binance) +
          Number(p.notional_usd); // BTC 자산 = 시작 절반 가치로 가정
        const realizedPnl = finalUsd - 2 * Number(p.notional_usd);
        await closePosition(svc, p, 0, 0, realizedPnl, "expired");
        closed++;
        results.push({ id: p.id, symbol: p.symbol, action: "expired" });
        continue;
      }
      const upbitUsd = snap.upbitKrw / snap.usdKrwRate;
      const binanceUsd = snap.binanceUsd;
      const finalUsd =
        Number(p.inventory_btc_upbit) * upbitUsd +
        Number(p.inventory_btc_binance) * binanceUsd +
        Number(p.inventory_usdt_upbit) +
        Number(p.inventory_usdt_binance);
      const fees = 2 * Number(p.notional_usd) * 0.0008;
      const realizedPnl = finalUsd - 2 * Number(p.notional_usd) - fees;
      await closePosition(svc, p, upbitUsd, binanceUsd, realizedPnl, "expired");
      closed++;
      results.push({ id: p.id, symbol: p.symbol, action: "expired", profit: realizedPnl });
      continue;
    }

    if (!snap) continue;

    const threshold = Number(p.target_threshold_pct);
    const premium = snap.premiumPct;
    const upbitUsd = snap.upbitKrw / snap.usdKrwRate;
    const binanceUsd = snap.binanceUsd;

    // 사이클 발동 판정
    let direction: "positive" | "negative" | null = null;
    if (premium >= threshold) direction = "positive";
    else if (premium <= -threshold) direction = "negative";

    if (!direction) continue;

    // 한 사이클당 인벤토리의 25% 만큼 이동 (점진적)
    const FRACTION = 0.25;

    let cycleResult;
    try {
      cycleResult = runRebalanceCycle({
        position: p,
        direction,
        premium,
        threshold,
        upbitUsd,
        binanceUsd,
        fraction: FRACTION,
      });
    } catch (e) {
      console.error(`[resolve-arbitrage] cycle calc failed ${p.id}`, e);
      errors++;
      continue;
    }

    if (cycleResult.btcMoved <= 0) continue; // 인벤토리 부족

    // 포지션 업데이트
    const { error: upErr } = await svc
      .from("arbitrage_positions")
      .update({
        inventory_btc_upbit: cycleResult.newInventory.btcUpbit,
        inventory_btc_binance: cycleResult.newInventory.btcBinance,
        inventory_usdt_upbit: cycleResult.newInventory.usdtUpbit,
        inventory_usdt_binance: cycleResult.newInventory.usdtBinance,
        cycles_count: Number(p.cycles_count) + 1,
        accrued_cycle_pnl: Number(p.accrued_cycle_pnl) + cycleResult.profitUsdt,
      })
      .eq("id", p.id);

    if (upErr) {
      errors++;
      console.error(`[resolve-arbitrage] position update failed ${p.id}`, upErr.message);
      continue;
    }

    // 사이클 로그
    const { error: logErr } = await svc.from("arbitrage_cycles").insert({
      position_id: p.id,
      direction,
      premium_at_cycle: premium,
      threshold_pct: threshold,
      btc_moved: cycleResult.btcMoved,
      profit_usdt: cycleResult.profitUsdt,
      upbit_btc_after: cycleResult.newInventory.btcUpbit,
      upbit_usdt_after: cycleResult.newInventory.usdtUpbit,
      binance_btc_after: cycleResult.newInventory.btcBinance,
      binance_usdt_after: cycleResult.newInventory.usdtBinance,
    });
    if (logErr)
      console.error(`[resolve-arbitrage] cycle log failed ${p.id}`, logErr.message);

    cycles++;
    results.push({
      id: p.id,
      symbol: p.symbol,
      action: `cycle_${direction}`,
      profit: cycleResult.profitUsdt,
    });
  }

  return NextResponse.json({
    checked: positions.length,
    cycles,
    closed,
    errors,
    results,
  });
}

/**
 * 사이클 1회 실행 계산.
 *
 * positive (김프 +): Upbit BTC 매도 (비싸게) + Binance BTC 매수 (싸게)
 *   - btcMoved = min(upbitBtc, binanceUsdt / binanceUsd) × fraction
 *   - Upbit: BTC -= moved, USDT += moved × upbitUsd
 *   - Binance: BTC += moved, USDT -= moved × binanceUsd
 *   - profit = moved × (upbitUsd - binanceUsd) - 수수료
 *
 * negative (김프 -): Upbit BTC 매수 (싸게) + Binance BTC 매도 (비싸게)
 *   - 반대 방향
 *   - profit = moved × (binanceUsd - upbitUsd) - 수수료
 */
function runRebalanceCycle(args: {
  position: OpenKimchiPosition;
  direction: "positive" | "negative";
  premium: number;
  threshold: number;
  upbitUsd: number;
  binanceUsd: number;
  fraction: number;
}): {
  btcMoved: number;
  profitUsdt: number;
  newInventory: {
    btcUpbit: number;
    btcBinance: number;
    usdtUpbit: number;
    usdtBinance: number;
  };
} {
  const { position: p, direction, upbitUsd, binanceUsd, fraction } = args;

  let btcUpbit = Number(p.inventory_btc_upbit);
  let btcBinance = Number(p.inventory_btc_binance);
  let usdtUpbit = Number(p.inventory_usdt_upbit);
  let usdtBinance = Number(p.inventory_usdt_binance);

  let btcMoved = 0;
  let profitUsdt = 0;

  if (direction === "positive") {
    // Upbit 매도 가능량 = upbit BTC, Binance 매수 가능량 = binance USDT / binance 가격
    const maxFromUpbit = btcUpbit;
    const maxFromBinance = binanceUsd > 0 ? usdtBinance / binanceUsd : 0;
    btcMoved = Math.min(maxFromUpbit, maxFromBinance) * fraction;
    if (btcMoved <= 0)
      return {
        btcMoved: 0,
        profitUsdt: 0,
        newInventory: { btcUpbit, btcBinance, usdtUpbit, usdtBinance },
      };

    btcUpbit -= btcMoved;
    usdtUpbit += btcMoved * upbitUsd;
    btcBinance += btcMoved;
    usdtBinance -= btcMoved * binanceUsd;

    // 캡처 = 가격 차이 × 이동량. 수수료: 양쪽 거래 합 × 0.04%.
    const gross = btcMoved * (upbitUsd - binanceUsd);
    const tradeNotional = btcMoved * (upbitUsd + binanceUsd);
    const fees = tradeNotional * 0.0004;
    // 슬리피지 가정 ~0.02% × 양쪽 거래액 (BTC 메이저는 ~0.005%, 알트는 더 큼)
    const slippage = tradeNotional * 0.0002;
    profitUsdt = gross - fees - slippage;
  } else {
    // negative: Upbit 매수 + Binance 매도
    const maxToUpbit = upbitUsd > 0 ? usdtUpbit / upbitUsd : 0;
    const maxFromBinance = btcBinance;
    btcMoved = Math.min(maxToUpbit, maxFromBinance) * fraction;
    if (btcMoved <= 0)
      return {
        btcMoved: 0,
        profitUsdt: 0,
        newInventory: { btcUpbit, btcBinance, usdtUpbit, usdtBinance },
      };

    btcUpbit += btcMoved;
    usdtUpbit -= btcMoved * upbitUsd;
    btcBinance -= btcMoved;
    usdtBinance += btcMoved * binanceUsd;

    const gross = btcMoved * (binanceUsd - upbitUsd);
    const tradeNotional = btcMoved * (upbitUsd + binanceUsd);
    const fees = tradeNotional * 0.0004;
    const slippage = tradeNotional * 0.0002;
    profitUsdt = gross - fees - slippage;
  }

  return {
    btcMoved,
    profitUsdt,
    newInventory: { btcUpbit, btcBinance, usdtUpbit, usdtBinance },
  };
}

/** 포지션 강제 종료 + 마진 정산. */
async function closePosition(
  svc: ReturnType<typeof getSupabaseService>,
  p: OpenKimchiPosition,
  upbitExitUsd: number,
  binanceExitUsd: number,
  realizedPnl: number,
  reason: string,
) {
  const { error: upErr } = await svc
    .from("arbitrage_positions")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      long_exit_price: upbitExitUsd,
      short_exit_price: binanceExitUsd,
      realized_pnl: realizedPnl,
      close_reason: reason,
    })
    .eq("id", p.id);
  if (upErr) {
    console.error(`[resolve-arbitrage] close update failed ${p.id}`, upErr.message);
    return;
  }
  try {
    await settleMargin({
      userId: p.user_id,
      margin: 2 * Number(p.notional_usd),
      realizedPnl,
      tradeId: p.id,
    });
  } catch (e) {
    console.error(`[resolve-arbitrage] settleMargin failed ${p.id}`, e);
  }
}
