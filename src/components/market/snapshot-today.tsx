import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  fetchTechnicalsSnapshot,
  type TechnicalRow,
} from "@/lib/market-widgets/technicals";
import { cn } from "@/lib/utils";

function fmtPrice(n: number) {
  if (!n) return "—";
  if (n < 1) return `$${n.toFixed(4)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function trendTone(t: TechnicalRow["trend"]) {
  if (t === "up") return "text-grade-a";
  if (t === "down") return "text-grade-d";
  return "text-muted-foreground";
}

function trendLabel(t: TechnicalRow["trend"]) {
  if (t === "up") return "▲ 상승";
  if (t === "down") return "▼ 하락";
  return "→ 횡보";
}

function rsiTone(v: number | null) {
  if (v == null) return "text-muted-foreground";
  if (v >= 70 || v <= 30) return "text-grade-d";
  return "text-foreground";
}

export async function SnapshotToday() {
  const rows = await fetchTechnicalsSnapshot();

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Snapshot · Today</h2>
        <span className="text-xs text-muted-foreground">via Binance</span>
      </div>

      <ul className="divide-y divide-border/40 rounded-2xl border border-border/60 bg-card/40">
        {rows.map((r) => (
          <li key={r.symbol}>
            <Link
              href={`/app/analyze?symbol=${r.pair}`}
              className="group flex items-center justify-between gap-6 px-6 py-4 transition-colors hover:bg-muted/30"
            >
              {/* 좌: 심볼 + 가격 */}
              <div className="flex min-w-0 items-center gap-4">
                <span className="w-12 font-mono text-base font-bold">
                  {r.symbol}
                </span>
                <span className="font-mono text-base font-medium tabular-nums">
                  {fmtPrice(r.close)}
                </span>
              </div>

              {/* 중: 한 줄 verdict */}
              <p className="hidden flex-1 truncate text-sm text-muted-foreground sm:block">
                {r.takeaway}
              </p>

              {/* 우: 추세 + RSI + 화살표 */}
              <div className="flex shrink-0 items-center gap-5 text-sm">
                <span className={cn("font-mono font-medium", trendTone(r.trend))}>
                  {trendLabel(r.trend)}
                </span>
                <span
                  className={cn(
                    "hidden font-mono font-medium tabular-nums md:inline",
                    rsiTone(r.rsi14),
                  )}
                >
                  RSI {r.rsi14 == null ? "—" : r.rsi14.toFixed(0)}
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
