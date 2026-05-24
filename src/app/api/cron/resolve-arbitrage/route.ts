import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseService } from "@/lib/supabase/service";
import { settleMargin } from "@/lib/paper-wallet";
import { fetchCurrentPremiums } from "@/lib/arbitrage/scan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface OpenKimchiPosition {
  id: string;
  user_id: string;
  symbol: string;
  notional_usd: number;
  long_entry_price: number;
  short_entry_price: number;
  long_qty: number;
  short_qty: number;
  entry_premium_pct: number | null;
  target_premium_pct: number | null;
  expires_at: string;
}

/**
 * 5분마다 실행. 모든 open 김프 차익 포지션 순회.
 * 현재 김프 >= target_premium_pct 도달 시 자동 청산.
 * 만료 시간 도달 시도 자동 청산 (reason='expired').
 *
 * PnL 계산 = (currentPct - entryPct) / 100 × notional - 수수료(0.08%).
 * 청산가는 현재 김프 변화량을 Upbit leg 가격에 반영 (Binance leg 는 진입가 그대로).
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
      "id, user_id, symbol, notional_usd, long_entry_price, short_entry_price, long_qty, short_qty, entry_premium_pct, target_premium_pct, expires_at",
    )
    .eq("kind", "kimchi")
    .eq("status", "open")
    .limit(500);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!positions || positions.length === 0)
    return NextResponse.json({ checked: 0, closed: 0 });

  const currentPremiums = await fetchCurrentPremiums();
  const now = Date.now();

  const results: Array<{
    id: string;
    symbol: string;
    reason: string;
    pnl: number;
  }> = [];
  let closed = 0;
  let errors = 0;

  for (const raw of positions) {
    const p = raw as OpenKimchiPosition;
    const targetPct = p.target_premium_pct != null ? Number(p.target_premium_pct) : 1.0;
    const entryPct = p.entry_premium_pct != null ? Number(p.entry_premium_pct) : null;
    const currentPct = currentPremiums.get(p.symbol);
    const expiresAt = new Date(p.expires_at).getTime();

    const expired = now >= expiresAt;
    const targetReached = currentPct != null && currentPct >= targetPct;

    if (!expired && !targetReached) continue;

    const reason = targetReached ? "target" : "expired";
    // 청산 시 김프: 목표 도달이면 target, 만료면 현재가(모르면 entry).
    const closePct = targetReached ? Math.max(targetPct, currentPct ?? targetPct)
      : currentPct ?? entryPct ?? 0;
    const deltaPct = entryPct != null ? (closePct - entryPct) / 100 : 0;

    const longEntry = Number(p.long_entry_price);
    const shortEntry = Number(p.short_entry_price);
    const longQty = Number(p.long_qty);
    const shortQty = Number(p.short_qty);
    // Upbit leg 가 김프 변화량만큼 가격 변동했다고 가정. Binance leg 는 entry 가격 유지.
    const longExit = longEntry * (1 + deltaPct);
    const shortExit = shortEntry;

    const longPnl = (longExit - longEntry) * longQty;
    const shortPnl = (shortEntry - shortExit) * shortQty;
    const fees = (longEntry * longQty + shortEntry * shortQty) * 0.0008;
    const realizedPnl = longPnl + shortPnl - fees;

    const { error: upErr } = await svc
      .from("arbitrage_positions")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        long_exit_price: longExit,
        short_exit_price: shortExit,
        realized_pnl: realizedPnl,
        close_reason: reason,
      })
      .eq("id", p.id);

    if (upErr) {
      errors++;
      console.error(`[resolve-arbitrage] update failed ${p.id}`, upErr.message);
      continue;
    }

    try {
      await settleMargin({
        userId: p.user_id,
        margin: Number(p.notional_usd) * 2,
        realizedPnl,
        tradeId: p.id,
      });
    } catch (e) {
      console.error(`[resolve-arbitrage] settleMargin failed ${p.id}`, e);
    }

    closed++;
    results.push({ id: p.id, symbol: p.symbol, reason, pnl: realizedPnl });
  }

  return NextResponse.json({
    checked: positions.length,
    closed,
    errors,
    results,
  });
}
