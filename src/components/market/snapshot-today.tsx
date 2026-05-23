import Link from "next/link";
import { Activity, ArrowRight } from "lucide-react";
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

function fmtKrw(n: number) {
  if (!n) return "—";
  return `₩${Math.round(n).toLocaleString("ko-KR")}`;
}

function trendTone(t: TechnicalRow["trend"]) {
  if (t === "up") return "text-grade-a";
  if (t === "down") return "text-grade-d";
  return "text-muted-foreground";
}

function trendIcon(t: TechnicalRow["trend"]) {
  if (t === "up") return "▲";
  if (t === "down") return "▼";
  return "→";
}

function rsiTone(v: number | null) {
  if (v == null) return "text-muted-foreground";
  if (v >= 70) return "text-grade-d";
  if (v >= 55) return "text-grade-a";
  if (v >= 45) return "text-muted-foreground";
  if (v >= 30) return "text-amber-400";
  return "text-sky-400";
}

function ma200Tone(p: TechnicalRow["ma200Position"]) {
  if (p === "above") return "text-grade-a";
  if (p === "below") return "text-grade-d";
  return "text-muted-foreground";
}

function fundingTone(v: number | null) {
  if (v == null) return "text-muted-foreground";
  if (v > 0.05) return "text-grade-d";
  if (v < -0.05) return "text-sky-400";
  return "text-muted-foreground";
}

export async function SnapshotToday() {
  const rows = await fetchTechnicalsSnapshot();

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Snapshot · Today
          <span className="text-[11px] font-normal text-muted-foreground">
            · 6코인 1D
          </span>
        </h3>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          via Binance
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card/30">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">코인</th>
                <th className="px-4 py-2 font-medium">현재가</th>
                <th className="px-4 py-2 font-medium">추세 1D</th>
                <th className="px-4 py-2 font-medium">RSI 14</th>
                <th className="px-4 py-2 font-medium">200DMA</th>
                <th className="px-4 py-2 font-medium">펀딩비</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((r) => (
                <tr key={r.symbol} className="group">
                  <td className="px-4 py-3 font-mono text-sm font-semibold">
                    {r.symbol}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums">
                    <div>{fmtPrice(r.close)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {fmtKrw(r.closeKrw)}
                    </div>
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 font-mono text-xs font-semibold",
                      trendTone(r.trend),
                    )}
                  >
                    {trendIcon(r.trend)}{" "}
                    {r.trend === "up"
                      ? "상승"
                      : r.trend === "down"
                        ? "하락"
                        : "횡보"}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 font-mono tabular-nums",
                      rsiTone(r.rsi14),
                    )}
                  >
                    {r.rsi14 == null ? "—" : r.rsi14.toFixed(0)}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {r.rsiLabel}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-xs font-semibold",
                      ma200Tone(r.ma200Position),
                    )}
                  >
                    {r.ma200Position === "above"
                      ? "위"
                      : r.ma200Position === "below"
                        ? "아래"
                        : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 font-mono tabular-nums",
                      fundingTone(r.fundingPct),
                    )}
                  >
                    {r.fundingPct == null
                      ? "—"
                      : `${r.fundingPct >= 0 ? "+" : ""}${r.fundingPct.toFixed(3)}%`}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/analyze?symbol=${r.pair}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-2.5 py-1 text-[11px] font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                    >
                      AI 분석
                      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-border/60 px-4 py-3">
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={`tk-${r.symbol}`} className="flex gap-3 text-xs">
                <span className="w-10 shrink-0 font-mono font-semibold">
                  {r.symbol}
                </span>
                <span className="text-muted-foreground">{r.takeaway}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        Binance 1D close · EMA 21 / RSI 14 / SMA 200 · 펀딩비 USDT-perp
      </p>
    </section>
  );
}
