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
  const w = 320;
  const h = 56;
  const step = w / (data.length - 1);
  const points = data
    .map((d, i) => {
      const x = i * step;
      const y = h - ((d.tvl - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const first = data[0].tvl;
  const last = data[data.length - 1].tvl;
  const isUp = last >= first;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-14 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={isUp ? "rgb(34 197 94 / 0.85)" : "rgb(239 68 68 / 0.85)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export async function DefiTvlCard() {
  const d = await fetchDefiTvl();

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">On-chain · DeFi TVL</h2>
        <span className="text-xs text-muted-foreground">via DeFiLlama</span>
      </div>

      <article className="rounded-2xl border border-border/60 bg-card/40 px-6 py-5">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[44px] font-bold leading-none tabular-nums">
                {fmtBig(d.total)}
              </span>
              <span
                className={cn(
                  "font-mono text-sm font-medium tabular-nums",
                  deltaTone(d.delta7dPct),
                )}
              >
                {fmtDelta(d.delta7dPct)}{" "}
                <span className="text-muted-foreground">7d</span>
              </span>
            </div>
            <Sparkline data={d.series} />
            <p className="text-sm text-muted-foreground">
              30일 추이 · 증가 = risk-on · 감소 = risk-off
            </p>
          </div>

          <div className="space-y-2.5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              체인별 TOP 5
            </p>
            <ul className="space-y-2">
              {d.topChains.length === 0 ? (
                <li className="text-sm text-muted-foreground">데이터 없음</li>
              ) : (
                d.topChains.map((c) => {
                  const pct = d.total > 0 ? (c.tvl / d.total) * 100 : 0;
                  return (
                    <li
                      key={c.name}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {pct.toFixed(1)}%
                      </span>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      </article>
    </section>
  );
}
