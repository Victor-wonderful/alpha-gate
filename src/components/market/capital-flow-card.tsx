import { ArrowDown, ArrowUp, ChevronDown, Pause } from "lucide-react";
import {
  fetchCapitalFlow,
  type ActionSignal,
  type Regime,
} from "@/lib/market-widgets/capital-flow";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

function fmtBig(n: number) {
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

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function buildRegimeMeta(
  t: Translate,
): Record<Regime, { dot: string; title: string; body: React.ReactNode }> {
  return {
    alt_season_entry: {
      dot: "bg-grade-a",
      title: t("market.flow.regime.alt_season_entry.title"),
      body: (
        <>
          <p>{t("market.flow.regime.alt_season_entry.body1")}</p>
          <p>{t("market.flow.regime.alt_season_entry.body2")}</p>
          <p>{t("market.flow.regime.alt_season_entry.body3")}</p>
          <p>{t("market.flow.regime.alt_season_entry.body4")}</p>
        </>
      ),
    },
    btc_led_rally: {
      dot: "bg-grade-a/80",
      title: t("market.flow.regime.btc_led_rally.title"),
      body: (
        <>
          <p>{t("market.flow.regime.btc_led_rally.body1")}</p>
          <p>{t("market.flow.regime.btc_led_rally.body2")}</p>
          <p>{t("market.flow.regime.btc_led_rally.body3")}</p>
        </>
      ),
    },
    stables_deploying: {
      dot: "bg-grade-a",
      title: t("market.flow.regime.stables_deploying.title"),
      body: (
        <>
          <p>{t("market.flow.regime.stables_deploying.body1")}</p>
          <p>{t("market.flow.regime.stables_deploying.body2")}</p>
          <p>{t("market.flow.regime.stables_deploying.body3")}</p>
        </>
      ),
    },
    rotation_alts_to_btc: {
      dot: "bg-amber-400",
      title: t("market.flow.regime.rotation_alts_to_btc.title"),
      body: (
        <>
          <p>{t("market.flow.regime.rotation_alts_to_btc.body1")}</p>
          <p>{t("market.flow.regime.rotation_alts_to_btc.body2")}</p>
          <p>{t("market.flow.regime.rotation_alts_to_btc.body3")}</p>
        </>
      ),
    },
    liquidity_tightening: {
      dot: "bg-amber-400",
      title: t("market.flow.regime.liquidity_tightening.title"),
      body: (
        <>
          <p>{t("market.flow.regime.liquidity_tightening.body1")}</p>
          <p>{t("market.flow.regime.liquidity_tightening.body2")}</p>
          <p>{t("market.flow.regime.liquidity_tightening.body3")}</p>
        </>
      ),
    },
    deleveraging: {
      dot: "bg-grade-d",
      title: t("market.flow.regime.deleveraging.title"),
      body: (
        <>
          <p>{t("market.flow.regime.deleveraging.body1")}</p>
          <p>{t("market.flow.regime.deleveraging.body2")}</p>
          <p>{t("market.flow.regime.deleveraging.body3")}</p>
        </>
      ),
    },
    neutral: {
      dot: "bg-muted-foreground/50",
      title: t("market.flow.regime.neutral.title"),
      body: (
        <>
          <p>{t("market.flow.regime.neutral.body1")}</p>
          <p>{t("market.flow.regime.neutral.body2")}</p>
          <p>{t("market.flow.regime.neutral.body3")}</p>
        </>
      ),
    },
  };
}

export async function CapitalFlowCard() {
  const t = await getT();
  const d = await fetchCapitalFlow();
  if (!d) {
    return (
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Capital Flow · 7d</h2>
        </div>
        <article className="rounded-2xl border border-border/60 bg-card shadow-card px-6 py-8 text-center text-sm text-muted-foreground">
          {t("market.flow.noData")}
        </article>
      </section>
    );
  }

  const r = buildRegimeMeta(t)[d.regime];

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Capital Flow · 7d</h2>
        <span className="text-xs text-muted-foreground">via CoinGecko</span>
      </div>

      <article className="flex h-full flex-col gap-3 rounded-2xl border border-border/60 bg-card shadow-card p-5">
        {/* Verdict */}
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full animate-pulse", r.dot)} />
          <span className="text-base font-semibold">{r.title}</span>
        </div>

        {/* Action signals — BTC + Alt */}
        <div className="grid grid-cols-2 gap-2">
          <ActionChip asset="BTC" signal={d.btcAction} t={t} />
          <ActionChip asset="ALT" signal={d.altAction} t={t} />
        </div>

        {/* Total mcap + 24h */}
        <div>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[30px] font-bold leading-none tabular-nums">
              {fmtBig(d.totalMcap)}
            </span>
            <span
              className={cn(
                "font-mono text-xs tabular-nums",
                deltaTone(d.total24hPct),
              )}
            >
              {fmtDelta(d.total24hPct)} (24h)
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("market.flow.totalMcap")}</p>
        </div>

        {/* 7d changes — 4 cells */}
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <FlowRow
            label="BTC"
            mcap={d.btcMcap}
            pct={d.btc7dPct}
            color="bg-amber-400/80"
          />
          <FlowRow
            label="ETH"
            mcap={d.ethMcap}
            pct={d.eth7dPct}
            color="bg-sky-400/80"
          />
          <FlowRow
            label="Stable"
            mcap={d.stableMcap}
            pct={d.stable7dPct}
            color="bg-grade-a/70"
          />
          <FlowRow
            label={t("market.flow.altLabel")}
            mcap={d.altMcap}
            pct={d.alt7dPct}
            color="bg-muted-foreground/40"
          />
        </ul>

        {/* Dominance stacked bar */}
        <div>
          <p className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
            {t("market.flow.currentDominance")}
          </p>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/30">
            <div className="bg-amber-400/80" style={{ width: `${d.btcDominance}%` }} />
            <div className="bg-sky-400/80" style={{ width: `${d.ethDominance}%` }} />
            <div className="bg-grade-a/70" style={{ width: `${d.stableDominance}%` }} />
            <div className="bg-muted-foreground/40" style={{ width: `${d.altDominance}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
            <span>BTC {d.btcDominance.toFixed(1)}%</span>
            <span>ETH {d.ethDominance.toFixed(1)}%</span>
            <span>St {d.stableDominance.toFixed(1)}%</span>
            <span>Alt {d.altDominance.toFixed(1)}%</span>
          </div>
        </div>

        {/* Insight */}
        <details className="group border-t border-border/40 pt-2">
          <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs font-medium text-foreground hover:text-primary [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t("market.flow.interpretation")}</span>
              <span>{r.title}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
            {r.body}
          </div>
        </details>

        <p className="mt-auto pt-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
          {t("market.flow.footnote")}
        </p>
      </article>
    </section>
  );
}

const ACTION_META = {
  long: {
    labelKey: "market.flow.action.long",
    Icon: ArrowUp,
    border: "border-grade-a/40",
    bg: "bg-grade-a/10",
    text: "text-grade-a",
    iconBg: "bg-grade-a/20",
  },
  short: {
    labelKey: "market.flow.action.short",
    Icon: ArrowDown,
    border: "border-grade-d/40",
    bg: "bg-grade-d/10",
    text: "text-grade-d",
    iconBg: "bg-grade-d/20",
  },
  wait: {
    labelKey: "market.flow.action.wait",
    Icon: Pause,
    border: "border-border/60",
    bg: "bg-muted/20",
    text: "text-muted-foreground",
    iconBg: "bg-muted/40",
  },
} as const;

function ActionChip({
  asset,
  signal,
  t,
}: {
  asset: string;
  signal: ActionSignal;
  t: Translate;
}) {
  const m = ACTION_META[signal.direction];
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2",
        m.border,
        m.bg,
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          m.iconBg,
        )}
      >
        <m.Icon className={cn("h-3.5 w-3.5", m.text)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-xs font-bold">{asset}</span>
          <span className={cn("text-sm font-semibold", m.text)}>{t(m.labelKey)}</span>
          {signal.strength === "strong" ? (
            <span
              className={cn(
                "rounded px-1 text-[9px] font-bold uppercase tracking-wider",
                m.bg,
                m.text,
              )}
            >
              {t("market.flow.strong")}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {signal.reason}
        </p>
      </div>
    </div>
  );
}

function FlowRow({
  label,
  mcap,
  pct,
  color,
}: {
  label: string;
  mcap: number;
  pct: number;
  color: string;
}) {
  return (
    <li className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5 last:border-b-0 last:pb-0">
      <div className="flex items-center gap-1.5">
        <span className={cn("inline-block h-2 w-2 rounded-sm", color)} />
        <span className="text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-2 tabular-nums">
        <span className="font-mono text-muted-foreground">{fmtBig(mcap)}</span>
        <span className={cn("w-14 text-right font-mono font-semibold", deltaTone(pct))}>
          {fmtDelta(pct, 1)}
        </span>
      </div>
    </li>
  );
}
