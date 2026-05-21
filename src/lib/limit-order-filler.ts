import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";
import { fetchTicker24h } from "@/lib/analysis/binance";
import { lockMargin } from "@/lib/paper-wallet";

/**
 * 미체결 지정가 주문을 순회하며 체결 조건을 확인하고 자동 체결합니다.
 * Vercel Cron (/api/cron/fill-limit-orders) 에서 주기적으로 호출됩니다.
 *
 * 체결 조건:
 *  - 롱 (매수): 현재가 <= 지정가 (가격이 내려와서 지정가에 도달)
 *  - 숏 (매도): 현재가 >= 지정가 (가격이 올라와서 지정가에 도달)
 *
 * 반환: 이번 실행에서 체결된 주문 수
 */
export async function checkAndFillLimitOrders(): Promise<number> {
  const supabase = getSupabaseService();

  // 1. 만료된 주문 일괄 처리
  await supabase
    .from("pending_limit_orders")
    .update({ status: "expired" })
    .eq("status", "open")
    .lt("expires_at", new Date().toISOString());

  // 2. 남은 미체결 주문 조회
  const { data: orders } = await supabase
    .from("pending_limit_orders")
    .select("*")
    .eq("status", "open");

  if (!orders || orders.length === 0) return 0;

  // 3. 중복 시세 조회 방지 — 유니크 심볼별 현재가 한 번만 조회
  const symbols = [...new Set(orders.map((o) => o.symbol as string))];
  const prices: Record<string, number> = {};
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const ticker = await fetchTicker24h(sym);
        prices[sym] = Number(ticker.lastPrice);
      } catch {
        // 심볼별 시세 조회 실패는 무시하고 해당 심볼 주문은 이번 사이클 건너뜀
      }
    }),
  );

  let filled = 0;

  for (const order of orders) {
    const currentPrice = prices[order.symbol as string];
    if (!currentPrice) continue;

    const limitPrice = Number(order.limit_price);
    const direction = order.direction as "long" | "short";

    // 체결 조건 판단
    const shouldFill =
      direction === "long"
        ? currentPrice <= limitPrice
        : currentPrice >= limitPrice;

    if (!shouldFill) continue;

    // 체결 시점의 마진 계산 (지정가 기준)
    const margin = (limitPrice * Number(order.quantity)) / Number(order.leverage);

    // 마진 lock (잔액 부족이면 주문 취소 처리)
    const lockResult = await lockMargin({
      userId: order.user_id as string,
      margin,
      tradeId: order.trade_id as string,
      note: `지정가 주문 체결 (${direction === "long" ? "롱" : "숏"} ${order.symbol} @ ${limitPrice})`,
    });

    if (!lockResult.ok) {
      // 잔액 부족 등으로 lock 실패 → 주문 취소
      await supabase
        .from("pending_limit_orders")
        .update({ status: "canceled" })
        .eq("id", order.id);
      await supabase
        .from("trades")
        .update({ order_status: "canceled" })
        .eq("id", order.trade_id);
      continue;
    }

    // trades 체결 처리
    await supabase
      .from("trades")
      .update({
        entry_actual: currentPrice,
        order_status: "filled",
        order_type: "limit",
      })
      .eq("id", order.trade_id);

    // pending_limit_orders 상태 변경
    await supabase
      .from("pending_limit_orders")
      .update({ status: "filled" })
      .eq("id", order.id);

    filled++;
  }

  return filled;
}
