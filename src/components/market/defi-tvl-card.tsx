import { Network } from "lucide-react";
import { fetchDefiTvl } from "@/lib/market-widgets/defi-tvl";
import { cn } from "@/lib/utils";

function fmtBig(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}

function deltaTone(v: number) {
  if (v > 0) return "text-grade-a";
  if (v < 0) return "text-grade-d";
  return "text-muted-foreground";
}

function fmtDelta(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function Sparkline({ data }: { data: { date: number; tvl: number }[] }) {
  if (data.length < 2) return null;
  const values = data.map((d) => d.tvl);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const w = 200;
  const h = 40;
  const step = w / (data.length - 1);
  const points = data
    .map((d, i) => {
      const x = i * step;
      const y = h - ((d.tvl - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = data[data.length - 1].tvl;
  const first = data[0].tvl;
  const isUp = last >= first;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-10 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={isUp ? "rgb(34 197 94 / 0.9)" : "rgb(239 68 68 / 0.9)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export async function DefiTvlCard() {
  const d = await fetchDefiTvl();
  const totalShare = d.topChains.reduce((s, c) => s + c.tvl, 0);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Network className="h-4 w-4 text-muted-foreground" />
          On-chain · DeFi TVL
        </h3>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          via DeFiLlama
        </span>
      </div>

      <article className="grid gap-5 rounded-xl border border-border/60 bg-card/30 px-5 py-4 lg:grid-cols-[1fr_1fr]">
        {/* 좌: TVL 메인 */}
        <div className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Total Value Locked
          </p>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[34px] font-bold leading-none tabular-nums">
              {fmtBig(d.total)}
            </span>
          </div>
          <div className="flex gap-4 text-[11px]">
            <span>
              <span className="text-muted-foreground">24h </span>
              <span
                className={cn(
                  "font-mono font-semibold tabular-nums",
                  deltaTone(d.delta24hPct),
                )}
              >
                {fmtDelta(d.delta24hPct)}
              </span>
            </span>
            <span>
              <span className="text-muted-foreground">7d </span>
              <span
                className={cn(
                  "font-mono font-semibold tabular-nums",
                  deltaTone(d.delta7dPct),
                )}
              >
                {fmtDelta(d.delta7dPct)}
              </span>
            </span>
          </div>
          <Sparkline data={d.series} />
          <p className="text-[10px] text-muted-foreground">
            최근 30일 추이 · 증가 = risk-on, 감소 = risk-off
          </p>
        </div>

        {/* 우: 체인별 TOP 5 */}
        <div className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            체인별 TOP 5
          </p>
          <ul className="space-y-2">
            {d.topChains.map((c) => {
              const pct = totalShare > 0 ? (c.tvl / d.total) * 100 : 0;
              return (
                <li key={c.name} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {fmtBig(c.tvl)}
                      <span className="ml-1.5 text-[10px]">
                        ({pct.toFixed(1)}%)
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted/30">
                    <div
                      className="h-full bg-primary/60"
                      style={{ width: `${Math.min(100, pct * 1.6)}%` }}
                    />
                  </div>
                </li>
              );
            })}
            {d.topChains.length === 0 ? (
              <li className="text-xs text-muted-foreground">데이터 없음</li>
            ) : null}
          </ul>
        </div>
      </article>
    </section>
  );
}
