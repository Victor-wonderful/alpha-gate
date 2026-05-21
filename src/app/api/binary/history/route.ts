import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 진행 중 게임 (모든 미정산)
  const { data: active } = await supabase
    .from("binary_games")
    .select("id, symbol, direction, bet_points, entry_price, candle_close_time, timeframe, created_at")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("candle_close_time", { ascending: true });

  // 최근 종료 (정산된 것 중 최신 20개)
  const { data: closed } = await supabase
    .from("binary_games")
    .select("id, symbol, direction, bet_points, entry_price, exit_price, won, pnl_points, timeframe, created_at")
    .eq("user_id", user.id)
    .eq("status", "settled")
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    active: active ?? [],
    closed: closed ?? [],
  });
}
