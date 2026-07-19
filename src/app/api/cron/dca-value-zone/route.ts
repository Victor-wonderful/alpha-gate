import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseService } from "@/lib/supabase/service";
import { dispatch } from "@/lib/notify-dispatch";
import { fetchSpotKlines } from "@/lib/analysis/binance";
import { classifyValueZone } from "@/lib/dca/value-zone";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 밸류 존 알림 — 적립 플랜 자산이 "싼 구간"에 들어가면 한 번 알린다.
 *
 * 정기 매수(매주, 금액만 기울임)는 그대로 두고, "지금 진짜 싸다" 싶을 때 추가로 담을지는
 * 사용자가 정한다. 그 판단 시점을 알려주는 게 이 알림의 전부다.
 *
 * 매일 같은 문구를 보내면 소음이 되므로 **판정이 바뀔 때만** 보낸다
 * (직전 판정을 dca_plans.last_zone_verdict 에 남겨 비교).
 * 하루 1회면 충분하다 — 적립은 분 단위로 반응할 일이 없다.
 *
 * cf. docs/DCA-모드-설계.md §5
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const svc = getSupabaseService();
  const { data: plans, error } = await svc
    .from("dca_plans")
    .select("id, user_id, symbol, last_zone_verdict")
    .eq("status", "active");

  if (error) {
    console.error(`[dca-value-zone] 플랜 조회 실패: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!plans?.length) return NextResponse.json({ checked: 0, sent: 0 });

  // 같은 자산을 여러 플랜이 쓰면 시세는 한 번만 조회한다.
  const symbols = [...new Set(plans.map((p) => p.symbol as string))];
  const verdicts = new Map<string, { verdict: string; price: number; reasons: string }>();
  for (const symbol of symbols) {
    try {
      const candles = await fetchSpotKlines(symbol, "1d", 1000);
      const vz = classifyValueZone(
        candles.map((c) => ({ high: c.high, low: c.low, close: c.close, volume: c.volume })),
      );
      if (vz.ok)
        verdicts.set(symbol, {
          verdict: vz.verdict,
          price: vz.price,
          reasons: vz.signals
            .filter((s) => s.verdict === "cheap")
            .map((s) => s.label)
            .join(", "),
        });
    } catch (e) {
      console.error(`[dca-value-zone] ${symbol} 시세 조회 실패: ${e instanceof Error ? e.message : e}`);
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  let sent = 0;

  for (const plan of plans) {
    const v = verdicts.get(plan.symbol as string);
    if (!v) continue;

    const changed = v.verdict !== plan.last_zone_verdict;
    // 판정이 바뀐 것만 기록. 알림은 "싼 구간으로 들어왔을 때"만.
    if (changed) {
      await svc
        .from("dca_plans")
        .update({
          last_zone_verdict: v.verdict,
          ...(v.verdict === "cheap" ? { zone_notified_at: new Date().toISOString() } : {}),
        })
        .eq("id", plan.id);
    }

    if (!changed || v.verdict !== "cheap") continue;

    const base = (plan.symbol as string).replace("USDT", "");
    try {
      await dispatch(plan.user_id as string, "dca_value_zone", {
        title: `📉 ${base} 싼 구간 진입`,
        body:
          `${base} ${v.price} — ${v.reasons || "지표 다수결"} 기준으로 싼 구간입니다.\n` +
          `이번 회차는 2배로 들어갑니다. 더 담을지는 직접 정하세요.` +
          (appUrl ? `\n${appUrl}/app/dca` : ""),
      });
      sent++;
    } catch (e) {
      console.error(`[dca-value-zone] 알림 실패 plan=${plan.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  return NextResponse.json({ checked: plans.length, symbols: symbols.length, sent });
}
