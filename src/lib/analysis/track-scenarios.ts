import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";
import { dispatch } from "@/lib/notify-dispatch";

interface ScenarioRow {
  id: string;
  user_id: string;
  symbol: string;
  direction: "long" | "short";
  entry_price: number;
  stop_price: number;
  target_price: number;
  status: "pending" | "triggered" | "target" | "stop" | "expired";
  triggered_at: string | null;
  expires_at: string;
  watch: boolean;
  last_notified_status: string | null;
  strategy_primary: string;
}

interface BinancePriceRow {
  symbol: string;
  price: string;
}

const STATUS_LABEL: Record<string, string> = {
  triggered: "진입 가격 도달 🔔",
  target: "목표가 도달 ✅",
  stop: "손절가 도달 ❌",
  expired: "시나리오 만료 ⏱️",
};

const STRATEGY_LABEL: Record<string, string> = {
  trend_pullback: "추세 눌림",
  breakout: "돌파",
  range_fade: "박스권 매매",
  reversal: "반전",
  wait: "대기",
};

async function maybeNotify(
  supabase: ReturnType<typeof getSupabaseService>,
  r: ScenarioRow,
  newStatus: "triggered" | "target" | "stop" | "expired",
  currentPrice: number | null,
) {
  if (!r.watch) return;
  if (r.last_notified_status === newStatus) return;
  // expired 는 entry 도달 전이면 알림 안 보냄 (사용자에게 정보 가치 없음)
  if (newStatus === "expired" && r.status === "pending") {
    await supabase
      .from("scenario_outcomes")
      .update({ last_notified_status: newStatus })
      .eq("id", r.id);
    return;
  }

  const dirLabel = r.direction === "long" ? "롱" : "숏";
  const strategyLabel = STRATEGY_LABEL[r.strategy_primary] ?? r.strategy_primary;
  const title = `${r.symbol} · ${strategyLabel} ${dirLabel} — ${STATUS_LABEL[newStatus]}`;
  const priceTxt = currentPrice != null ? `현재가: $${currentPrice.toLocaleString("en-US", { maximumFractionDigits: 6 })}` : "";
  const refTxt =
    newStatus === "triggered"
      ? `진입 ${r.entry_price} · 손절 ${r.stop_price} · 목표 ${r.target_price}`
      : newStatus === "target"
        ? `목표 ${r.target_price} 도달 — 진입 ${r.entry_price}`
        : newStatus === "stop"
          ? `손절 ${r.stop_price} 도달 — 진입 ${r.entry_price}`
          : `만료됨 — 진입 ${r.entry_price} · 손절 ${r.stop_price} · 목표 ${r.target_price}`;
  const body = `${priceTxt}\n${refTxt}`;

  try {
    await dispatch(r.user_id, "scenario_alert", { title, body });
    await supabase
      .from("scenario_outcomes")
      .update({ last_notified_status: newStatus })
      .eq("id", r.id);
  } catch (e) {
    console.error("[track-scenarios] notify failed", r.id, e);
  }
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
      "id, user_id, symbol, direction, entry_price, stop_price, target_price, status, triggered_at, expires_at, watch, last_notified_status, strategy_primary",
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
      else {
        expired++;
        await maybeNotify(supabase, r, "expired", currentPrice ?? null);
      }
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
        else {
          triggered++;
          await maybeNotify(supabase, r, "triggered", currentPrice);
        }
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
        const triggeredPrice = r.entry_price; // 단순화
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
        else {
          resolved++;
          await maybeNotify(supabase, r, outcome, currentPrice);
        }
      }
    }
  }

  return { checked: rows.length, triggered, resolved, expired, errors };
}
