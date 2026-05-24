import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ExpiryActions } from "./expiry-banner-actions";

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "곧 만료";
  const totalMins = Math.round(ms / 60_000);
  if (totalMins < 60) return `${totalMins}분`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours < 24)
    return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}일 ${remHours}시간` : `${days}일`;
}

const TIMEOUT_MS: Record<string, number> = {
  "15m": 2 * 24 * 60 * 60_000,
  "1h": 7 * 24 * 60 * 60_000,
  "4h": 14 * 24 * 60 * 60_000,
  "1D": 30 * 24 * 60 * 60_000,
};

interface TradeExpiry {
  kind: "trade";
  id: string;
  symbol: string;
  direction: string;
  timeframe: string;
  msLeft: number;
  isFinal: boolean;
  canExtend: boolean;
}

interface LimitExpiry {
  kind: "limit";
  id: string;
  symbol: string;
  direction: string;
  limitPrice: number;
  msLeft: number;
  isFinal: boolean;
  canExtend: boolean;
}

type Expiry = TradeExpiry | LimitExpiry;

/** 사용자의 만료 임박 거래 + 지정가 주문을 모두 조회해 배너에 노출. */
export async function ExpiryBanner() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const now = Date.now();
  const items: Expiry[] = [];

  // 진행 중 포지션 — 경고 1차 도달했고 아직 청산 안 된 것
  const { data: trades } = await supabase
    .from("trades")
    .select(
      "id, symbol, direction, timeframe, created_at, extended_until, extension_count, expiry_warned_first_at, expiry_warned_final_at, closed_at",
    )
    .eq("user_id", user.id)
    .is("closed_at", null)
    .neq("mode", "backtest")
    .not("expiry_warned_first_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(10);

  for (const t of trades ?? []) {
    const createdMs = new Date(t.created_at as string).getTime();
    const expiryMs = t.extended_until
      ? new Date(t.extended_until as string).getTime()
      : createdMs + (TIMEOUT_MS[t.timeframe as string] ?? 0);
    const msLeft = expiryMs - now;
    if (msLeft <= 0) continue; // cron이 곧 청산
    items.push({
      kind: "trade",
      id: t.id as string,
      symbol: t.symbol as string,
      direction: t.direction as string,
      timeframe: t.timeframe as string,
      msLeft,
      isFinal: !!t.expiry_warned_final_at,
      canExtend: (t.extension_count ?? 0) < 1,
    });
  }

  // 미체결 지정가 주문 — 경고 1차 도달
  const { data: limits } = await supabase
    .from("pending_limit_orders")
    .select(
      "id, symbol, direction, limit_price, expires_at, expiry_warned_first_at, expiry_warned_final_at, extension_count, status",
    )
    .eq("user_id", user.id)
    .eq("status", "open")
    .not("expiry_warned_first_at", "is", null)
    .limit(10);

  for (const o of limits ?? []) {
    const msLeft = new Date(o.expires_at as string).getTime() - now;
    if (msLeft <= 0) continue;
    items.push({
      kind: "limit",
      id: o.id as string,
      symbol: o.symbol as string,
      direction: o.direction as string,
      limitPrice: Number(o.limit_price),
      msLeft,
      isFinal: !!o.expiry_warned_final_at,
      canExtend: (o.extension_count ?? 0) < 1,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isFinal = item.isFinal;
        return (
          <div
            key={`${item.kind}-${item.id}`}
            className={
              isFinal
                ? "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-grade-d/60 bg-grade-d/10 px-5 py-3"
                : "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 px-5 py-3"
            }
          >
            <div className="flex items-center gap-3 min-w-0">
              <AlertTriangle
                className={
                  isFinal
                    ? "h-5 w-5 shrink-0 text-grade-d"
                    : "h-5 w-5 shrink-0 text-amber-400"
                }
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  {item.kind === "trade" ? (
                    <>
                      <Link
                        href={`/app/journal/${item.id}`}
                        className="font-mono hover:text-primary"
                      >
                        {item.symbol}
                      </Link>{" "}
                      {item.direction === "long" ? "롱" : "숏"} ·{" "}
                      {item.timeframe}
                    </>
                  ) : (
                    <>
                      <span className="font-mono">{item.symbol}</span>{" "}
                      {item.direction === "long" ? "롱" : "숏"} 지정가 @{" "}
                      <span className="font-mono">
                        {item.limitPrice.toLocaleString()}
                      </span>
                    </>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {isFinal ? "⏰ 마지막 알림 — " : "곧 만료 — "}
                  {formatTimeLeft(item.msLeft)} 후 자동{" "}
                  {item.kind === "trade" ? "청산" : "취소"}
                </div>
              </div>
            </div>
            <ExpiryActions
              kind={item.kind}
              id={item.id}
              canExtend={item.canExtend}
            />
          </div>
        );
      })}
    </div>
  );
}
