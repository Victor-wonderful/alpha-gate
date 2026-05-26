import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";

interface ScenarioRow {
  id: string;
  symbol: string;
  direction: "long" | "short";
  entry_price: number;
  stop_price: number;
  target_price: number;
  status: "pending" | "triggered" | "target" | "stop" | "expired";
  triggered_at: string | null;
  expires_at: string;
}

interface BinancePriceRow {
  symbol: string;
  price: string;
}

/**
 * 시나리오 결과 추적 cron.
 *
 * 동작:
 * - pending: entry 가격 터치 (long: 현재가 <= entry, short: 현재가 >= entry) → triggered
 * - triggered: target 또는 stop 가격 도달 → target / stop
 * - 모두: expires_at 지나면 expired
 *
 * 한계: 5분 단위 스냅샷이라 intra-candle 움직임 놓칠 수 있음.
 *   정확한 시점보다 누적 적중률에 관심 있는 통계 용도.
 */
export async function runTrackScenarios(): Promise<{
  checked: number;
  triggered: number;
  resolved: number;
  expired: number;
  errors: number;
}> {
  const supabase = getSupabaseService();
  const nowIso = new Date().toISOString();

  // 1) pending + triggered 시나리오 가져오기
  const { data: rows, error } = await supabase
    .from("scenario_outcomes")
    .select(
      "id, symbol, direction, entry_price, stop_price, target_price, status, triggered_at, expires_at",
    )
    .in("status", ["pending", "triggered"])
    .limit(2000);

  if (error || !rows || rows.length === 0)
    return { checked: 0, triggered: 0, resolved: 0, expired: 0, errors: 0 };

  // 2) 고유 심볼 추출 + Binance 현재가 일괄 조회
  const symbols = Array.from(new Set(rows.map((r) => r.symbol)));
  const binanceSymbols = symbols
    .map((s) => (s.endsWith("USDT") ? s : `${s}USDT`))
    .filter((v, i, a) => a.indexOf(v) === i);
  const priceMap = new Map<string, number>();
  try {
    const url = `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(binanceSymbols))}`;
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (res.ok) {
      const json = (await res.json()) as BinancePriceRow[];
      for (const p of json) priceMap.set(p.symbol, Number(p.price) || 0);
    }
  } catch (e) {
    console.error("[track-scenarios] price fetch failed", e);
    return { checked: rows.length, triggered: 0, resolved: 0, expired: 0, errors: 1 };
  }

  let triggered = 0;
  let resolved = 0;
  let expired = 0;
  let errors = 0;

  for (const r of rows as ScenarioRow[]) {
    const binanceSymbol = r.symbol.endsWith("USDT") ? r.symbol : `${r.symbol}USDT`;
    const currentPrice = priceMap.get(binanceSymbol);
    const expiredFlag = new Date(r.expires_at).getTime() <= Date.now();

    // 만료 처리 우선
    if (expiredFlag) {
      const { error: e } = await supabase
        .from("scenario_outcomes")
        .update({
          status: "expired",
          resolved_at: nowIso,
          outcome_price: currentPrice ?? null,
        })
        .eq("id", r.id);
      if (e) errors++;
      else expired++;
      continue;
    }

    if (!currentPrice || currentPrice <= 0) continue;

    if (r.status === "pending") {
      // entry 가격 터치 확인
      const touched =
        r.direction === "long"
          ? currentPrice <= r.entry_price
          : currentPrice >= r.entry_price;
      if (touched) {
        const { error: e } = await supabase
          .from("scenario_outcomes")
          .update({ status: "triggered", triggered_at: nowIso })
          .eq("id", r.id);
        if (e) errors++;
        else triggered++;
      }
      continue;
    }

    if (r.status === "triggered") {
      // target / stop 확인
      let outcome: "target" | "stop" | null = null;
      if (r.direction === "long") {
        if (currentPrice >= r.target_price) outcome = "target";
        else if (currentPrice <= r.stop_price) outcome = "stop";
      } else {
        if (currentPrice <= r.target_price) outcome = "target";
        else if (currentPrice >= r.stop_price) outcome = "stop";
      }
      if (outcome) {
        const triggeredPrice = r.entry_price; // 단순화 — 실제 trigger 시점 가격은 추적 안 함
        const risk = Math.abs(triggeredPrice - r.stop_price);
        const reward = currentPrice - triggeredPrice;
        const resultR =
          risk > 0
            ? (r.direction === "long" ? reward : -reward) / risk
            : 0;
        const { error: e } = await supabase
          .from("scenario_outcomes")
          .update({
            status: outcome,
            resolved_at: nowIso,
            outcome_price: currentPrice,
            result_r: resultR,
          })
          .eq("id", r.id);
        if (e) errors++;
        else resolved++;
      }
    }
  }

  return { checked: rows.length, triggered, resolved, expired, errors };
}
