import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface FundingRow {
  symbol: string;
  fundingTime: number;
  fundingRate: string;
}

interface OpenFundingPosition {
  id: string;
  user_id: string;
  symbol: string;
  notional_usd: number;
  long_exchange: string;
  short_exchange: string;
  accrued_funding: number | null;
  last_funding_at: string | null;
  created_at: string;
}

/**
 * 5분마다 실행. 모든 open funding arbitrage 포지션 순회.
 * Binance 펀딩 history API 로 last_funding_at 이후 정산된 펀딩들을 모두 합산해
 * accrued_funding 에 누적. last_funding_at 을 최신 fundingTime 으로 갱신.
 *
 * 부호 규칙:
 * - 펀딩 > 0 (롱→숏 지급) AND 우리 short_exchange === 'binance_perp' (퍼프 숏)
 *   → 우리가 받는 쪽 (+) → accrued += notional × rate
 * - 펀딩 > 0 AND short_exchange === 'binance_spot' (퍼프 롱) → 우리가 내는 쪽 (-)
 * - 펀딩 < 0 (숏→롱) AND short_exchange === 'binance_perp' → 우리가 내는 쪽 (-)
 * - 펀딩 < 0 AND short_exchange === 'binance_spot' (퍼프 롱) → 우리가 받는 쪽 (+)
 *
 * 즉, perp 쪽이 long 인지 short 인지에 따라 부호가 정해진다.
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
      "id, user_id, symbol, notional_usd, long_exchange, short_exchange, accrued_funding, last_funding_at, created_at",
    )
    .eq("kind", "funding")
    .eq("status", "open")
    .limit(200);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!positions || positions.length === 0)
    return NextResponse.json({ checked: 0, updated: 0 });

  const results: Array<{
    id: string;
    settlements: number;
    accrued: number;
  }> = [];
  let updated = 0;
  let errors = 0;

  for (const raw of positions) {
    const p = raw as OpenFundingPosition;
    const sincePoint = p.last_funding_at ?? p.created_at;
    const sinceMs = new Date(sincePoint).getTime();

    // perp leg 이 short 이면 부호 +1 (양수 펀딩 시 받음), 반대면 -1.
    const perpIsShort = p.short_exchange === "binance_perp";
    const sign = perpIsShort ? 1 : -1;

    try {
      // Binance 펀딩 history. 결과는 fundingTime 오름차순.
      const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${p.symbol}USDT&startTime=${sinceMs}&limit=100`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        errors++;
        results.push({
          id: p.id,
          settlements: 0,
          accrued: 0,
        });
        continue;
      }
      const rows = (await res.json()) as FundingRow[];

      let sumDelta = 0;
      let latestTime = sinceMs;
      let count = 0;
      for (const r of rows) {
        if (r.fundingTime <= sinceMs) continue;
        const rate = Number(r.fundingRate);
        if (!Number.isFinite(rate)) continue;
        // delta = notional × rate × sign
        sumDelta += Number(p.notional_usd) * rate * sign;
        latestTime = Math.max(latestTime, r.fundingTime);
        count++;
      }

      if (count === 0) {
        results.push({ id: p.id, settlements: 0, accrued: 0 });
        continue;
      }

      const newAccrued = Number(p.accrued_funding ?? 0) + sumDelta;
      const { error: upErr } = await svc
        .from("arbitrage_positions")
        .update({
          accrued_funding: newAccrued,
          last_funding_at: new Date(latestTime).toISOString(),
        })
        .eq("id", p.id);

      if (upErr) {
        errors++;
        results.push({ id: p.id, settlements: count, accrued: 0 });
        continue;
      }

      updated++;
      results.push({ id: p.id, settlements: count, accrued: sumDelta });
    } catch (e) {
      errors++;
      results.push({ id: p.id, settlements: 0, accrued: 0 });
      console.error(`[accrue-arbitrage-funding] ${p.id}`, e);
    }
  }

  return NextResponse.json({
    checked: positions.length,
    updated,
    errors,
    results,
  });
}
