import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";
import { fetchTicker24h } from "@/lib/analysis/binance";
import { lockMargin } from "@/lib/paper-wallet";
import { dispatch } from "@/lib/notify-dispatch";

/** 지정가 1차 경고: 만료 D-4h (모든 지정가 공통 24h 유효이라 짧음) */
const LIMIT_WARN_FIRST_MS = 4 * 60 * 60_000;
/** 지정가 2차(마지막) 경고: 만료 D-1h (공통) */
const LIMIT_WARN_FINAL_MS = 60 * 60_000;

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

  // 1. 만료된 주문 처리 — 사후 알림까지 보내고 expired 마킹
  const nowIso = new Date().toISOString();
  const { data: expiringOrders } = await supabase
    .from("pending_limit_orders")
    .select("id, user_id, symbol, direction, limit_price, trade_id")
    .eq("status", "open")
    .lt("expires_at", nowIso);
  if (expiringOrders && expiringOrders.length > 0) {
    for (const o of expiringOrders) {
      await supabase
        .from("pending_limit_orders")
        .update({ status: "expired" })
        .eq("id", o.id);
      // trades order_status 도 갱신
      await supabase
        .from("trades")
        .update({ order_status: "expired" })
        .eq("id", o.trade_id as string);
      try {
        await dispatch(o.user_id as string, "ai_coach_done", {
          title: "⏰ 지정가 주문 자동 취소 (응답 없음)",
          body: `${o.symbol} ${o.direction === "long" ? "롱" : "숏"} @ ${o.limit_price} · 24시간 동안 도달 안 함 → 자동 취소`,
          tradeId: o.trade_id as string,
        });
      } catch {
        // ignore
      }
    }
  }

  // 2. 남은 미체결 주문 조회 (경고 + 체결 둘 다 처리)
  const { data: orders } = await supabase
    .from("pending_limit_orders")
    .select(
      "*, expires_at, expiry_warned_first_at, expiry_warned_final_at",
    )
    .eq("status", "open");

  if (!orders || orders.length === 0) return 0;

  // 만료 경고 처리 (체결 시도와 별개)
  const now = Date.now();
  for (const o of orders) {
    const expiryMs = new Date(o.expires_at as string).getTime();
    const msToExpiry = expiryMs - now;
    if (msToExpiry <= 0) continue; // 1단계에서 처리됐어야 함

    // 2차 (D-1h)
    if (msToExpiry <= LIMIT_WARN_FINAL_MS && !o.expiry_warned_final_at) {
      const mins = Math.max(1, Math.round(msToExpiry / 60_000));
      await supabase
        .from("pending_limit_orders")
        .update({ expiry_warned_final_at: new Date().toISOString() })
        .eq("id", o.id);
      try {
        await dispatch(o.user_id as string, "ai_coach_done", {
          title: "⏰ 마지막 알림 — 1시간 후 지정가 만료",
          body: `${o.symbol} ${o.direction === "long" ? "롱" : "숏"} @ ${o.limit_price} · 약 ${mins}분 후 자동 취소됩니다.`,
          tradeId: o.trade_id as string,
        });
      } catch {
        // ignore
      }
    } else if (
      msToExpiry <= LIMIT_WARN_FIRST_MS &&
      !o.expiry_warned_first_at
    ) {
      const hours = Math.max(1, Math.round(msToExpiry / 3_600_000));
      await supabase
        .from("pending_limit_orders")
        .update({ expiry_warned_first_at: new Date().toISOString() })
        .eq("id", o.id);
      try {
        await dispatch(o.user_id as string, "ai_coach_done", {
          title: "⏰ 지정가 만료 임박",
          body: `${o.symbol} ${o.direction === "long" ? "롱" : "숏"} @ ${o.limit_price} · 약 ${hours}시간 후 자동 취소됩니다.\n사이트에서 [지금 취소 / 12h 연장 / 그냥 두기] 중 선택하세요.`,
          tradeId: o.trade_id as string,
        });
      } catch {
        // ignore
      }
    }
  }

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
    const kind = (order.order_kind as "limit" | "stop" | null) ?? "limit";

    // 체결 조건 판단
    //  LIMIT (되돌림 대기): 롱 = 현재가 ≤ 트리거, 숏 = 현재가 ≥ 트리거
    //  STOP  (돌파 추격):   롱 = 현재가 ≥ 트리거, 숏 = 현재가 ≤ 트리거
    const shouldFill =
      kind === "stop"
        ? direction === "long"
          ? currentPrice >= limitPrice
          : currentPrice <= limitPrice
        : direction === "long"
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
        order_type: kind,
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
