"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";

/** Cancel a pending limit order linked to a trade row.
 *  Used from the journal page where users see the trade, not the underlying
 *  pending_limit_orders row. */
export async function cancelPendingLimitByTradeAction(
  tradeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: order, error: fetchErr } = await supabase
    .from("pending_limit_orders")
    .select("id, status")
    .eq("trade_id", tradeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchErr || !order) return { ok: false, error: "대기 중 주문을 찾을 수 없습니다." };
  if (order.status !== "open") return { ok: false, error: "이미 처리된 주문입니다." };

  const { error: cancelErr } = await supabase
    .from("pending_limit_orders")
    .update({ status: "canceled" })
    .eq("id", order.id);
  if (cancelErr) return { ok: false, error: `주문 취소 실패: ${cancelErr.message}` };

  await supabase.from("trades").update({ order_status: "canceled" }).eq("id", tradeId);

  revalidatePath("/app/journal");
  return { ok: true };
}
