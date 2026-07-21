import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";
import { fetchTicker24h } from "@/lib/analysis/binance";
import { settleMargin } from "@/lib/paper-wallet";

/**
 * 한 사용자의 "만료됐는데 아직 정리 안 된" 주문·포지션을 즉시 청산한다.
 *
 * 배경: 만료 처리는 크론(fill-limit-orders 5분·resolve-trades 5분)에 의존한다.
 * 크론 사이 간격(최대 5분)이나 Vercel 일시정지 동안, 사용자는 "만료 0분"인
 * 주문·포지션이 화면에 그대로 남아 있는 걸 본다("만료됐는데 안 사라진다").
 *
 * 이 헬퍼를 거래 화면·홈이 렌더 직전에 호출하면, 그 사용자의 만료분은
 * 크론을 기다리지 않고 즉시 정리돼 새로고침만으로 화면이 항상 최신이 된다.
 * 크론은 다른 사용자·백스톱으로 계속 돈다(중복 실행은 closed_at/status 가드로 안전).
 *
 * revalidatePath 는 호출하지 않는다(렌더 중 호출 금지). 서버 컴포넌트에서 fetch 전에 await.
 */

type TF = "15m" | "1h" | "4h" | "1D";

// resolve-trades/route.ts 의 TIMEOUT_MS 와 반드시 동일.
const TIMEOUT_MS: Record<TF, number> = {
  "15m": 24 * 60 * 60_000,
  "1h": 24 * 60 * 60_000,
  "4h": 5 * 24 * 60 * 60_000,
  "1D": 60 * 24 * 60 * 60_000,
};

interface SweepResult {
  expiredOrders: number;
  closedPositions: number;
}

/**
 * 만료된 미체결 주문 + 만료된 선물 포지션을 정리. best-effort — 어떤 실패도
 * 예외로 전파하지 않는다(페이지 렌더가 시세 오류 등으로 깨지면 안 됨).
 */
export async function sweepUserExpiries(userId: string): Promise<SweepResult> {
  const out: SweepResult = { expiredOrders: 0, closedPositions: 0 };
  if (!userId) return out;
  const svc = getSupabaseService();
  const nowIso = new Date().toISOString();
  const now = Date.now();

  // ── 1) 만료된 미체결 주문 → expired (fill-limit-orders 크론 1단계와 동일 로직) ──
  try {
    const { data: expiring } = await svc
      .from("pending_limit_orders")
      .select("id, trade_id")
      .eq("user_id", userId)
      .eq("status", "open")
      .lt("expires_at", nowIso);
    for (const o of expiring ?? []) {
      await svc
        .from("pending_limit_orders")
        .update({ status: "expired", resolved_at: nowIso, resolve_reason: "expired_self_heal" })
        .eq("id", o.id)
        .eq("status", "open");
      await svc
        .from("trades")
        .update({ order_status: "expired" })
        .eq("id", o.trade_id as string)
        .eq("order_status", "pending");
      out.expiredOrders++;
    }
  } catch {
    // best-effort
  }

  // ── 2) 만료된 선물 포지션 → 시장가 청산 (resolve-trades 만료 분기와 동일 수식) ──
  try {
    const { data: openTrades } = await svc
      .from("trades")
      .select(
        "id, user_id, symbol, direction, timeframe, entry, entry_actual, stop, fees_pct, position_quantity, paper_margin, is_paper, created_at, extended_until, market_type, context_flags",
      )
      .eq("user_id", userId)
      .is("closed_at", null)
      .neq("mode", "backtest")
      .eq("order_status", "filled")
      .limit(50);

    for (const t of openTrades ?? []) {
      const tf = t.timeframe as TF;
      if (!TIMEOUT_MS[tf]) continue; // 알 수 없는 TF 는 만료 스킵(크론과 동일하게 방치하지 않도록 로그)
      // 적립(DCA)·현물은 만료 개념이 없다.
      const ctx = (t.context_flags ?? {}) as { dcaPlanId?: string };
      if (ctx.dcaPlanId) continue;
      if (t.market_type === "spot") continue;

      const createdMs = new Date(t.created_at as string).getTime();
      const expiryMs = t.extended_until
        ? new Date(t.extended_until as string).getTime()
        : createdMs + TIMEOUT_MS[tf];
      if (expiryMs - now > 0) continue; // 아직 안 지남

      try {
        const ticker = await fetchTicker24h(t.symbol as string);
        const exitActual = ticker.lastPrice;
        const entryActual = Number(t.entry_actual ?? t.entry);
        const stopDist = Math.abs(entryActual - Number(t.stop));
        const feesPct = Number(t.fees_pct ?? 0.12);
        const feesR = stopDist > 0 ? (entryActual * (feesPct / 100)) / stopDist : 0;
        const movement =
          t.direction === "long" ? exitActual - entryActual : entryActual - exitActual;
        const grossR = stopDist > 0 ? movement / stopDist : 0;
        const resultR = grossR - feesR;
        const qty = Number(t.position_quantity ?? 0);
        const realizedPnl = movement * qty - entryActual * (feesPct / 100) * qty;

        const { data: updated, error: upErr } = await svc
          .from("trades")
          .update({
            exit_price: exitActual,
            exit_actual: exitActual,
            result_r: resultR,
            exit_reason: "timeout",
            closed_at: nowIso,
            paper_realized_pnl: t.is_paper ? realizedPnl : null,
            note: `자동 청산 (만료) — 응답 없음 (${resultR.toFixed(2)}R)`,
          })
          .eq("id", t.id as string)
          .is("closed_at", null)
          .select("id");

        if (upErr) {
          console.error(`[expiry-sweep] 만료 청산 실패 trade=${t.id} ${t.symbol}: ${upErr.message}`);
          continue;
        }
        // 이미 다른 경로(크론)가 닫았으면 갱신된 행 0 → 지갑 이중 정산 방지.
        if (!updated || updated.length === 0) continue;

        if (t.is_paper && t.paper_margin != null) {
          await settleMargin({
            userId: t.user_id as string,
            margin: Number(t.paper_margin),
            realizedPnl,
            tradeId: t.id as string,
          });
        }
        out.closedPositions++;
      } catch (e) {
        console.error(
          `[expiry-sweep] 만료 청산 오류 trade=${t.id} ${t.symbol}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  } catch {
    // best-effort
  }

  return out;
}
