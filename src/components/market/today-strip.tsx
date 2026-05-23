import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { fetchFng } from "@/lib/market-widgets/fng";
import { getUpcomingMacroEvents } from "@/lib/market-widgets/calendar";
import { cn } from "@/lib/utils";

type BtcQuote = { last: number; change24h: number; funding: number | null };

async function fetchBtcQuote(): Promise<BtcQuote | null> {
  try {
    const [tickerRes, fundingRes] = await Promise.all([
      fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT", {
        next: { revalidate: 60 },
      }),
      fetch("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT", {
        next: { revalidate: 300 },
      }),
    ]);
    if (!tickerRes.ok) return null;
    const t = (await tickerRes.json()) as {
      lastPrice: string;
      priceChangePercent: string;
    };
    let funding: number | null = null;
    if (fundingRes.ok) {
      const f = (await fundingRes.json()) as { lastFundingRate?: string };
      const r = Number(f.lastFundingRate);
      if (Number.isFinite(r)) funding = r * 100;
    }
    return {
      last: Number(t.lastPrice),
      change24h: Number(t.priceChangePercent),
      funding,
    };
  } catch {
    return null;
  }
}

function fmtPrice(n: number) {
  if (n >= 1000) return `$${Math.round(n).toLocaleString("en-US")}`;
  return `$${n.toFixed(2)}`;
}

/** Rule-based verdict: "평소" vs "변동성↑" vs "매크로 직전" */
function verdict({
  btc,
  fngValue,
  hoursToNextHighMacro,
}: {
  btc: BtcQuote | null;
  fngValue: number;
  hoursToNextHighMacro: number | null;
}): { label: string; tone: "ok" | "warn" | "danger" } {
  if (hoursToNextHighMacro !== null && hoursToNextHighMacro <= 24) {
    return { label: "매크로 발표 직전", tone: "danger" };
  }
  if (btc && Math.abs(btc.change24h) >= 5) {
    return { label: "변동성 큼", tone: "warn" };
  }
  if (fngValue >= 75 || fngValue <= 25) {
    return { label: "심리 극단", tone: "warn" };
  }
  if (btc && btc.funding !== null && Math.abs(btc.funding) >= 0.05) {
    return { label: "포지셔닝 쏠림", tone: "warn" };
  }
  return { label: "평소", tone: "ok" };
}

export async function TodayMarketStrip() {
  const [btc, fng] = await Promise.all([fetchBtcQuote(), fetchFng()]);
  const events = getUpcomingMacroEvents(3);
  const nextHighMacro = events.find((e) => e.impact === "high");
  let hoursToNext: number | null = null;
  if (nextHighMacro) {
    const ms = new Date(nextHighMacro.startsAt).getTime() - Date.now();
    if (ms > 0) hoursToNext = ms / 3_600_000;
  }
  const v = verdict({
    btc,
    fngValue: fng.value,
    hoursToNextHighMacro: hoursToNext,
  });

  const toneStyles = {
    ok: { dot: "bg-grade-a", text: "text-grade-a" },
    warn: { dot: "bg-amber-400", text: "text-amber-400" },
    danger: { dot: "bg-grade-d", text: "text-grade-d" },
  } as const;
  const t = toneStyles[v.tone];

  return (
    <Link
      href="/app/market"
      className="group flex items-center justify-between gap-6 rounded-2xl border border-border/60 bg-card/40 px-6 py-4 transition-all hover:border-primary/40 hover:bg-card/60"
    >
      <div className="flex min-w-0 items-center gap-6">
        {/* Verdict */}
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              t.dot,
              v.tone === "ok" && "animate-pulse",
            )}
          />
          <span className="text-base font-semibold">
            오늘 시장은 <span className={t.text}>{v.label}</span>
          </span>
        </div>

        {/* Metrics — divided */}
        <div className="hidden min-w-0 items-center gap-4 text-sm md:flex">
          {btc ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              BTC
              <span className="font-mono font-medium tabular-nums text-foreground">
                {fmtPrice(btc.last)}
              </span>
              <span
                className={cn(
                  "font-mono tabular-nums",
                  btc.change24h >= 0 ? "text-grade-a" : "text-grade-d",
                )}
              >
                {btc.change24h >= 0 ? "+" : ""}
                {btc.change24h.toFixed(2)}%
              </span>
            </span>
          ) : null}

          <span className="hidden h-4 w-px bg-border/60 lg:inline-block" />

          <span className="hidden items-center gap-1.5 text-muted-foreground lg:inline-flex">
            F&G
            <span className="font-mono font-medium tabular-nums text-foreground">
              {fng.value}
            </span>
            <span className="text-xs text-muted-foreground">· {fng.label}</span>
          </span>

          {btc?.funding != null ? (
            <>
              <span className="hidden h-4 w-px bg-border/60 lg:inline-block" />
              <span className="hidden items-center gap-1.5 text-muted-foreground lg:inline-flex">
                펀딩
                <span
                  className={cn(
                    "font-mono font-medium tabular-nums",
                    btc.funding >= 0 ? "text-foreground" : "text-foreground",
                  )}
                >
                  {btc.funding >= 0 ? "+" : ""}
                  {btc.funding.toFixed(3)}%
                </span>
              </span>
            </>
          ) : null}

          {nextHighMacro ? (
            <>
              <span className="hidden h-4 w-px bg-border/60 lg:inline-block" />
              <span className="hidden items-center gap-1.5 text-muted-foreground lg:inline-flex">
                다음
                <span className="font-medium text-foreground">
                  {nextHighMacro.kind}
                </span>
                <span className="text-xs text-muted-foreground">
                  · D-{Math.max(0, nextHighMacro.daysUntil)}
                </span>
              </span>
            </>
          ) : null}
        </div>
      </div>

      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors group-hover:text-primary">
        시장 보기
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
