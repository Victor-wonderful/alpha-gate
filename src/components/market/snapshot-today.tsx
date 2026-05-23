import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  fetchTechnicalsSnapshot,
  type TechnicalRow,
} from "@/lib/market-widgets/technicals";
import { cn } from "@/lib/utils";

function fmtPriceUsd(n: number) {
  if (!n) return "—";
  if (n < 1) return `$${n.toFixed(4)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtPriceKrw(n: number) {
  if (!n) return "";
  return `₩${Math.round(n).toLocaleString("ko-KR")}`;
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
  if (v >= 70) return "text-grade-d";
  if (v >= 55) return "text-grade-a";
  if (v >= 45) return "text-foreground";
  if (v >= 30) return "text-amber-400";
  return "text-grade-d";
}

function ma200Tone(p: TechnicalRow["ma200Position"]) {
  if (p === "above") return "text-grade-a";
  if (p === "below") return "text-grade-d";
  return "text-muted-foreground";
}

function ma200Label(p: TechnicalRow["ma200Position"]) {
  if (p === "above") return "위";
  if (p === "below") return "아래";
  return "—";
}

function fundingTone(v: number | null) {
  if (v == null) return "text-muted-foreground";
  if (v > 0.05) return "text-grade-d"; // 롱 과열 → 비용 ↑
  if (v < -0.05) return "text-sky-400"; // 숏 과열
  return "text-muted-foreground";
}

function fmtFunding(v: number | null) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(3)}%`;
}

export async function SnapshotToday() {
  const rows = await fetchTechnicalsSnapshot();

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Snapshot · Today</h2>
        <span className="text-xs text-muted-foreground">
          via Binance · 1D close · EMA 21 / RSI 14 / SMA 200 · 펀딩비 USDT-perp
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">코인</th>
                <th className="px-5 py-3 font-medium">현재가</th>
                <th className="px-5 py-3 font-medium">추세 1D</th>
                <th className="px-5 py-3 font-medium">RSI 14</th>
                <th className="hidden px-5 py-3 font-medium md:table-cell">
                  200DMA
                </th>
                <th className="hidden px-5 py-3 font-medium lg:table-cell">
                  펀딩비
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((r) => (
                <tr key={r.symbol} className="group hover:bg-muted/30">
                  <td className="px-5 py-3">
                    <Link
                      href={`/app/analyze?symbol=${r.pair}`}
                      className="font-mono text-base font-bold transition-colors group-hover:text-primary"
                    >
                      {r.symbol}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-mono text-sm font-medium tabular-nums">
                      {fmtPriceUsd(r.close)}
                    </div>
                    <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {fmtPriceKrw(r.closeKrw)}
                    </div>
                  </td>
                  <td
                    className={cn(
                      "px-5 py-3 font-mono text-sm font-medium",
                      trendTone(r.trend),
                    )}
                  >
                    {trendLabel(r.trend)}
                  </td>
                  <td
                    className={cn(
                      "px-5 py-3 font-mono tabular-nums",
                      rsiTone(r.rsi14),
                    )}
                  >
                    {r.rsi14 == null ? "—" : r.rsi14.toFixed(0)}
                    <span className="ml-1.5 text-[10px] text-muted-foreground">
                      {r.rsiLabel}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "hidden px-5 py-3 font-mono text-sm font-medium md:table-cell",
                      ma200Tone(r.ma200Position),
                    )}
                  >
                    {ma200Label(r.ma200Position)}
                  </td>
                  <td
                    className={cn(
                      "hidden px-5 py-3 font-mono tabular-nums lg:table-cell",
                      fundingTone(r.fundingPct),
                    )}
                  >
                    {fmtFunding(r.fundingPct)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/app/analyze?symbol=${r.pair}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-2.5 py-1 text-xs font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                    >
                      AI 분석
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Per-symbol takeaway list */}
        <div className="border-t border-border/40 px-5 py-4">
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={`tk-${r.symbol}`} className="flex gap-3 text-sm">
                <span className="w-12 shrink-0 font-mono font-semibold">
                  {r.symbol}
                </span>
                <span className="text-muted-foreground">{r.takeaway}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
