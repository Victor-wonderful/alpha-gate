import { NextResponse, type NextRequest } from "next/server";
import { fetchKimchiPremium } from "@/lib/market-widgets/kimchi";
import { getSupabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * 5분마다 실행. 김프 스냅샷을 kimchi_history 에 적재.
 * 일주일 누적 시 코인별 변동성(stdev/range) 계산 가능.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const rows = await fetchKimchiPremium();
    if (rows.length === 0)
      return NextResponse.json({ ok: true, recorded: 0, note: "empty fetch" });

    const supabase = getSupabaseService();
    const payload = rows.map((r) => ({
      symbol: r.symbol,
      premium_pct: r.premiumPct,
      upbit_krw: r.upbitKrw,
      binance_usd: r.binanceUsd,
      usd_krw_rate: r.usdKrwRate,
    }));
    const { error } = await supabase.from("kimchi_history").insert(payload);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, recorded: payload.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
