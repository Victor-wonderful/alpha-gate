import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseService } from "@/lib/supabase/service";
import { decryptSecret } from "@/lib/crypto";
import { getAdapter } from "@/lib/exchanges";
import type { ExchangeCredentials } from "@/lib/exchanges";
import { dispatch } from "@/lib/notify-dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sync exchange orders with the actual venue (Binance / Bybit).
 *
 * For every trade that is is_paper=false and exchange_status='open':
 *  1. Decrypt the user's API key
 *  2. Resolve the venue adapter from trade.exchange
 *  3. For each stop/take_profit order: fetch latest state
 *  4. Update exchange_orders row
 *  5. If stop_loss FILLED or take_profit FILLED → cancel the other side,
 *     close the trade with the actual fill price + R, fire notification.
 *
 * Runs every minute (configured in vercel.json).
 */

interface TradeRow {
  id: string;
  user_id: string;
  symbol: string;
  direction: "long" | "short";
  entry: number;
  stop: number;
  target: number;
  exchange: string | null;
  exchange_api_key_id: string | null;
}

interface OrderRow {
  id: string;
  kind: "entry" | "stop_loss" | "take_profit";
  status: string;
  exchange_order_id: string | null;
  filled_qty: number | null;
  avg_fill_price: number | null;
}

interface KeyRow {
  id: string;
  api_key_encrypted: string;
  api_secret_encrypted: string;
  testnet: boolean | null;
}

export async function GET(req: NextRequest) {
  // Auth: Vercel cron sends Authorization: Bearer $CRON_SECRET
  const auth = req.headers.get("authorization");
  if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseService();
  let processed = 0;
  let closed = 0;
  let errors = 0;
  const log: string[] = [];

  // 1) All open live trades
  const { data: trades, error } = await supabase
    .from("trades")
    .select(
      "id, user_id, symbol, direction, entry, stop, target, exchange, exchange_api_key_id",
    )
    .eq("is_paper", false)
    .eq("exchange_status", "open")
    .is("closed_at", null)
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!trades || trades.length === 0) {
    return NextResponse.json({ processed: 0, message: "no open live trades" });
  }

  // Cache key decryption per api_key_id to avoid redundant decrypt work.
  const keyCache = new Map<string, ExchangeCredentials | null>();

  async function loadCreds(keyId: string) {
    if (keyCache.has(keyId)) return keyCache.get(keyId);
    const { data: k } = await supabase
      .from("exchange_api_keys")
      .select("id, api_key_encrypted, api_secret_encrypted, testnet")
      .eq("id", keyId)
      .maybeSingle<KeyRow>();
    if (!k) {
      keyCache.set(keyId, null);
      return null;
    }
    try {
      const creds: ExchangeCredentials = {
        apiKey: decryptSecret(k.api_key_encrypted),
        apiSecret: decryptSecret(k.api_secret_encrypted),
        testnet: Boolean(k.testnet),
      };
      keyCache.set(keyId, creds);
      return creds;
    } catch (e) {
      log.push(`키 복호화 실패 ${keyId}: ${e instanceof Error ? e.message : String(e)}`);
      keyCache.set(keyId, null);
      return null;
    }
  }

  for (const trade of trades as TradeRow[]) {
    processed++;
    try {
      if (!trade.exchange_api_key_id) {
        log.push(`${trade.id} exchange_api_key_id 없음 (스킵)`);
        continue;
      }

      let adapter;
      try {
        adapter = getAdapter(trade.exchange ?? "");
      } catch {
        log.push(`${trade.id} 미지원 거래소 ${trade.exchange} (스킵)`);
        continue;
      }

      const creds = await loadCreds(trade.exchange_api_key_id);
      if (!creds) {
        errors++;
        log.push(`${trade.id} 키 로드 실패`);
        continue;
      }

      // 2) Pull this trade's orders
      const { data: orders } = await supabase
        .from("exchange_orders")
        .select("id, kind, status, exchange_order_id, filled_qty, avg_fill_price")
        .eq("trade_id", trade.id);

      if (!orders || orders.length === 0) {
        log.push(`${trade.id} exchange_orders 없음`);
        continue;
      }

      // Map by kind for easy access
      const byKind: Record<string, OrderRow> = {};
      for (const o of orders as OrderRow[]) {
        byKind[o.kind] = o;
      }

      // 3) Refresh stop_loss + take_profit status
      let stopFilled = false;
      let tpFilled = false;
      let exitPrice = 0;
      let exitReason: "target" | "stop" | null = null;
      let exitFillAvg = 0;

      for (const kind of ["stop_loss", "take_profit"] as const) {
        const order = byKind[kind];
        if (!order || !order.exchange_order_id) continue;
        // Skip orders already in terminal state
        if (["filled", "canceled", "rejected", "expired"].includes(order.status)) {
          continue;
        }
        try {
          const remote = await adapter.getOrder(creds, trade.symbol, order.exchange_order_id);
          const newStatus = remote.status;
          const avgPrice = remote.avgPrice ?? null;
          await supabase
            .from("exchange_orders")
            .update({
              status: newStatus,
              filled_qty: remote.executedQty,
              avg_fill_price: avgPrice,
              raw_response: (remote.raw as object) ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.id);
          if (newStatus === "filled") {
            if (kind === "stop_loss") {
              stopFilled = true;
              exitPrice = avgPrice ?? trade.stop;
              exitReason = "stop";
              exitFillAvg = avgPrice ?? trade.stop;
            }
            if (kind === "take_profit") {
              tpFilled = true;
              exitPrice = avgPrice ?? trade.target;
              exitReason = "target";
              exitFillAvg = avgPrice ?? trade.target;
            }
          }
        } catch (e) {
          log.push(`${trade.id}/${kind} fetch 실패: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // 4) If one side filled, cancel the other + close the trade
      if (stopFilled || tpFilled) {
        const otherKind = stopFilled ? "take_profit" : "stop_loss";
        const otherOrder = byKind[otherKind];
        if (
          otherOrder?.exchange_order_id &&
          !["filled", "canceled", "rejected", "expired"].includes(otherOrder.status)
        ) {
          try {
            await adapter.cancelOrder(creds, trade.symbol, otherOrder.exchange_order_id);
            await supabase
              .from("exchange_orders")
              .update({ status: "canceled", updated_at: new Date().toISOString() })
              .eq("id", otherOrder.id);
          } catch (e) {
            log.push(`${trade.id} ${otherKind} 취소 실패: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        // Compute realized R using actual fill price
        const risk = Math.abs(trade.entry - trade.stop);
        const direction = trade.direction;
        const realizedDelta =
          direction === "long" ? exitFillAvg - trade.entry : trade.entry - exitFillAvg;
        const resultR = risk > 0 ? realizedDelta / risk : 0;

        await supabase
          .from("trades")
          .update({
            exit_price: exitPrice,
            result_r: resultR,
            exit_reason: exitReason,
            closed_at: new Date().toISOString(),
            exchange_status: "filled",
          })
          .eq("id", trade.id);
        closed++;

        // Notify
        const wonOrLost = resultR > 0 ? "익절" : "손절";
        await dispatch(trade.user_id, "ai_coach_done", {
          title: `실거래 ${wonOrLost} 체결 — ${trade.symbol}`,
          body: `${trade.direction === "long" ? "롱" : "숏"} · 결과 ${resultR >= 0 ? "+" : ""}${resultR.toFixed(2)}R · 청산가 ${exitPrice.toFixed(4)}`,
          tradeId: trade.id,
        });
      }
    } catch (e) {
      errors++;
      log.push(`${trade.id} 처리 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    processed,
    closed,
    errors,
    log: log.slice(0, 50),
  });
}
