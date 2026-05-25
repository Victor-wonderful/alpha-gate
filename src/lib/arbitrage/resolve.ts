import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";
import { settleMargin } from "@/lib/paper-wallet";
import { fetchKimchiPremium } from "@/lib/market-widgets/kimchi";

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

export interface ResolveResult {
  checked: number;
  cycles: number;
  closed: number;
  errors: number;
  results: Array<{
    id: string;
    symbol: string;
    action: string;
    profit?: number;
  }>;
}

/**
 * 김프 차익거래 리밸런싱 사이클 실행.
 * cron 라우트와 수동 트리거 액션이 공통으로 호출.
 */
export async function runArbitrageResolve(): Promise<ResolveResult> {
  const svc = getSupabaseService();
  const { data: positions, error } = await svc
    .from("arbitrage_positions")
    .select(
      "id, user_id, symbol, notional_usd, inventory_btc_upbit, inventory_btc_binance, inventory_usdt_upbit, inventory_usdt_binance, target_threshold_pct, cycles_count, accrued_cycle_pnl, expires_at",
    )
    .eq("kind", "kimchi")
    .eq("status", "open")
    .limit(500);

  if (error) throw new Error(error.message);
  if (!positions || positions.length === 0)
    return { checked: 0, cycles: 0, closed: 0, errors: 0, results: [] };

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
  const results: ResolveResult["results"] = [];

  for (const raw of positions) {
    const p = raw as OpenKimchiPosition;
    const snap = snapshots.get(p.symbol);
    const expiresAt = new Date(p.expires_at).getTime();
    const expired = now >= expiresAt;

    if (expired) {
      if (!snap) {
        const finalUsd =
          Number(p.inventory_usdt_upbit) +
          Number(p.inventory_usdt_binance) +
          Number(p.notional_usd);
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
      results.push({
        id: p.id,
        symbol: p.symbol,
        action: "expired",
        profit: realizedPnl,
      });
      continue;
    }

    if (!snap) continue;

    const threshold = Number(p.target_threshold_pct);
    const premium = snap.premiumPct;
    const upbitUsd = snap.upbitKrw / snap.usdKrwRate;
    const binanceUsd = snap.binanceUsd;

    let direction: "positive" | "negative" | null = null;
    if (premium >= threshold) direction = "positive";
    else if (premium <= -threshold) direction = "negative";

    if (!direction) continue;

    const FRACTION = 0.25;
    let cycleResult;
    try {
      cycleResult = runRebalanceCycle({
        position: p,
        direction,
        upbitUsd,
        binanceUsd,
        fraction: FRACTION,
      });
    } catch (e) {
      console.error(`[resolve-arbitrage] cycle calc failed ${p.id}`, e);
      errors++;
      continue;
    }

    if (cycleResult.btcMoved <= 0) continue;

    const { error: upErr } = await svc
      .from("arbitrage_positions")
      .update({
        inventory_btc_upbit: cycleResult.newInventory.btcUpbit,
        inventory_btc_binance: cycleResult.newInventory.btcBinance,
        inventory_usdt_upbit: cycleResult.newInventory.usdtUpbit,
        inventory_usdt_binance: cycleResult.newInventory.usdtBinance,
        cycles_count: Number(p.cycles_count) + 1,
        accrued_cycle_pnl:
          Number(p.accrued_cycle_pnl) + cycleResult.profitUsdt,
      })
      .eq("id", p.id);

    if (upErr) {
      errors++;
      console.error(
        `[resolve-arbitrage] position update failed ${p.id}`,
        upErr.message,
      );
      continue;
    }

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
      console.error(
        `[resolve-arbitrage] cycle log failed ${p.id}`,
        logErr.message,
      );

    cycles++;
    results.push({
      id: p.id,
      symbol: p.symbol,
      action: `cycle_${direction}`,
      profit: cycleResult.profitUsdt,
    });
  }

  return { checked: positions.length, cycles, closed, errors, results };
}

function runRebalanceCycle(args: {
  position: OpenKimchiPosition;
  direction: "positive" | "negative";
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

    const gross = btcMoved * (upbitUsd - binanceUsd);
    const tradeNotional = btcMoved * (upbitUsd + binanceUsd);
    const fees = tradeNotional * 0.0004;
    const slippage = tradeNotional * 0.0002;
    profitUsdt = gross - fees - slippage;
  } else {
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
