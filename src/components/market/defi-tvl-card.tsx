import { ChevronDown } from "lucide-react";
import { fetchDefiTvl } from "@/lib/market-widgets/defi-tvl";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

type TFunc = (key: string, vars?: Record<string, string | number>) => string;

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

function fmtDelta(v: number, digits = 2) {
  if (v === 0) return "0%";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function tvlInsight(
  delta7d: number,
  t: TFunc,
): { title: string; body: React.ReactNode } {
  if (delta7d >= 5)
    return {
      title: t("market.defi.insight.strongRiskOn.title"),
      body: (
        <>
          <p>{t("market.defi.insight.strongRiskOn.line1")}</p>
          <p>{t("market.defi.insight.strongRiskOn.line2")}</p>
          <p>{t("market.defi.insight.strongRiskOn.line3")}</p>
        </>
      ),
    };
  if (delta7d >= 1)
    return {
      title: t("market.defi.insight.mildInflow.title"),
      body: (
        <>
          <p>{t("market.defi.insight.mildInflow.line1")}</p>
          <p>{t("market.defi.insight.mildInflow.line2")}</p>
        </>
      ),
    };
  if (delta7d > -1)
    return {
      title: t("market.defi.insight.neutral.title"),
      body: (
        <>
          <p>{t("market.defi.insight.neutral.line1")}</p>
          <p>{t("market.defi.insight.neutral.line2")}</p>
        </>
      ),
    };
  if (delta7d > -5)
    return {
      title: t("market.defi.insight.deleveraging.title"),
      body: (
        <>
          <p>{t("market.defi.insight.deleveraging.line1")}</p>
          <p>{t("market.defi.insight.deleveraging.line2")}</p>
          <p>{t("market.defi.insight.deleveraging.line3")}</p>
        </>
      ),
    };
  return {
    title: t("market.defi.insight.strongRiskOff.title"),
    body: (
      <>
        <p>{t("market.defi.insight.strongRiskOff.line1")}</p>
        <p>{t("market.defi.insight.strongRiskOff.line2")}</p>
        <p>{t("market.defi.insight.strongRiskOff.line3")}</p>
      </>
    ),
  };
}

function Sparkline({ data }: { data: { date: number; tvl: number }[] }) {
  if (data.length < 2) return null;
  const values = data.map((d) => d.tvl);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const w = 320;
  const h = 40;
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
      className="h-10 w-full"
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
  const t = await getT();
  const d = await fetchDefiTvl();
  const ins = tvlInsight(d.delta7dPct, t);

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">On-chain · DeFi TVL</h2>
        <span className="text-xs text-muted-foreground">via DeFiLlama</span>
      </div>

      <article className="flex h-full flex-col gap-3 rounded-2xl border border-border/60 bg-card shadow-card p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          Total Value Locked
        </p>

        {/* Big TVL + deltas */}
        <div>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[30px] font-bold leading-none tabular-nums">
              {fmtBig(d.total)}
            </span>
          </div>
          <div className="mt-1.5 flex gap-3 text-xs">
            <span>
              <span className="text-muted-foreground">24h </span>
              <span
                className={cn(
                  "font-mono font-medium tabular-nums",
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
                  "font-mono font-medium tabular-nums",
                  deltaTone(d.delta7dPct),
                )}
              >
                {fmtDelta(d.delta7dPct)}
              </span>
            </span>
          </div>
        </div>

        {/* Sparkline */}
        <div>
          <p className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
            {t("market.defi.last30d")}
          </p>
          <Sparkline data={d.series} />
        </div>

        {/* Top chains */}
        <div>
          <p className="mb-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
            {t("market.defi.topChains")}
          </p>
          <ul className="space-y-1.5">
            {d.topChains.length === 0 ? (
              <li className="text-xs text-muted-foreground">
                {t("market.defi.noData")}
              </li>
            ) : (
              d.topChains.map((c) => {
                const pct = d.total > 0 ? (c.tvl / d.total) * 100 : 0;
                return (
                  <li
                    key={c.name}
                    className="flex items-center justify-between gap-3 border-b border-border/40 pb-1.5 text-xs last:border-b-0 last:pb-0"
                  >
                    <span className="font-medium">{c.name}</span>
                    <div className="flex items-baseline gap-3 tabular-nums">
                      <span className="font-mono text-muted-foreground">
                        {fmtBig(c.tvl)}
                      </span>
                      <span className="w-12 text-right font-mono">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        {/* Insight */}
        <details className="group border-t border-border/40 pt-2">
          <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs font-medium text-foreground hover:text-primary [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground">
                {t("market.defi.interpretation")}
              </span>
              <span>{ins.title}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
            {ins.body}
          </div>
        </details>

        <p className="mt-auto pt-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
          {t("market.defi.footer")}
        </p>
      </article>
    </section>
  );
}
