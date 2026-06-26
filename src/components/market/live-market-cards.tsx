import { ChevronDown } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { fetchFng, type FngPoint } from "@/lib/market-widgets/fng";
import { fetchDominance } from "@/lib/market-widgets/dominance";
import { fetchAltSeasonIndex } from "@/lib/market-widgets/alt-season";
import { fetchKimchiPremium } from "@/lib/market-widgets/kimchi";
import { fetchStablecoinMcap } from "@/lib/market-widgets/stablecap";
import {
  fetchLongShortRatio,
  type LongShortPoint,
} from "@/lib/market-widgets/long-short";
import { cn } from "@/lib/utils";

// ─── shared shell ───────────────────────────────────────────────

function Card({
  label,
  via,
  alert,
  children,
}: {
  label: string;
  via?: string;
  alert?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "flex h-full flex-col gap-3 rounded-2xl border bg-card/40 p-5",
        alert ? "border-grade-d/40" : "border-border/60",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
        {label}
      </p>
      {children}
      {via ? (
        <p className="mt-auto pt-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
          {via}
        </p>
      ) : null}
    </article>
  );
}

/** Native collapsible insight section using <details>. No client JS needed.
 *  Title is the short verdict; body is the multi-line interpretation. */
async function Insight({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const t = await getT();
  return (
    <details className="group border-t border-border/40 pt-2">
      <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs font-medium text-foreground hover:text-primary [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{t("market.cards.insight.prefix")}</span>
          <span>{title}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  );
}

function fmtBn(n: number) {
  if (!n) return "—";
  const bn = n / 1_000_000_000;
  if (bn >= 100) return `$${bn.toFixed(0)}B`;
  if (bn >= 1) return `$${bn.toFixed(1)}B`;
  return `$${(n / 1_000_000).toFixed(0)}M`;
}

function fmtPct(v: number, digits = 2) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

// ─── 1. Fear & Greed ─────────────────────────────────────────────

function fngTone(v: number) {
  if (v < 25) return "text-grade-d";
  if (v < 45) return "text-amber-400";
  if (v < 55) return "text-muted-foreground";
  if (v < 75) return "text-grade-a";
  return "text-grade-d";
}

function fngLabelKo(label: string, t: (k: string) => string) {
  const map: Record<string, string> = {
    "Extreme Fear": t("market.cards.fng.label.extremeFear"),
    Fear: t("market.cards.fng.label.fear"),
    Neutral: t("market.cards.fng.label.neutral"),
    Greed: t("market.cards.fng.label.greed"),
    "Extreme Greed": t("market.cards.fng.label.extremeGreed"),
  };
  return map[label] ?? label;
}

function fngInsight(
  v: number,
  t: (k: string) => string,
): { title: string; body: React.ReactNode } {
  if (v <= 25)
    return {
      title: t("market.cards.fng.insight.bottom.title"),
      body: (
        <>
          <p>{t("market.cards.fng.insight.bottom.l1")}</p>
          <p>{t("market.cards.fng.insight.bottom.l2")}</p>
          <p>{t("market.cards.fng.insight.bottom.l3")}</p>
        </>
      ),
    };
  if (v < 45)
    return {
      title: t("market.cards.fng.insight.weak.title"),
      body: (
        <>
          <p>{t("market.cards.fng.insight.weak.l1")}</p>
          <p>{t("market.cards.fng.insight.weak.l2")}</p>
          <p>{t("market.cards.fng.insight.weak.l3")}</p>
        </>
      ),
    };
  if (v <= 55)
    return {
      title: t("market.cards.fng.insight.neutral.title"),
      body: (
        <>
          <p>{t("market.cards.fng.insight.neutral.l1")}</p>
          <p>{t("market.cards.fng.insight.neutral.l2")}</p>
          <p>{t("market.cards.fng.insight.neutral.l3")}</p>
        </>
      ),
    };
  if (v < 75)
    return {
      title: t("market.cards.fng.insight.chase.title"),
      body: (
        <>
          <p>{t("market.cards.fng.insight.chase.l1")}</p>
          <p>{t("market.cards.fng.insight.chase.l2")}</p>
          <p>{t("market.cards.fng.insight.chase.l3")}</p>
        </>
      ),
    };
  return {
    title: t("market.cards.fng.insight.correction.title"),
    body: (
      <>
        <p>{t("market.cards.fng.insight.correction.l1")}</p>
        <p>{t("market.cards.fng.insight.correction.l2")}</p>
        <p>{t("market.cards.fng.insight.correction.l3")}</p>
      </>
    ),
  };
}

function FngSparkline({
  history,
  color,
}: {
  history: FngPoint[];
  color: string;
}) {
  if (history.length < 2) return null;
  const W = 200;
  const H = 36;
  const PAD = 3;
  const xs = history.map(
    (_, i) => PAD + (i * (W - PAD * 2)) / (history.length - 1),
  );
  const min = Math.min(...history.map((p) => p.value));
  const max = Math.max(...history.map((p) => p.value));
  const range = Math.max(1, max - min);
  const ys = history.map(
    (p) => H - PAD - ((p.value - min) / range) * (H - PAD * 2),
  );
  const d = xs
    .map(
      (x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${ys[i].toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={color}
      />
      <circle
        cx={xs[xs.length - 1]}
        cy={ys[ys.length - 1]}
        r="2.5"
        className={color}
        fill="currentColor"
      />
    </svg>
  );
}

async function FngScale({ value }: { value: number }) {
  const t = await getT();
  const segs = [
    { to: 25, cls: "bg-grade-d/60", label: t("market.cards.fng.scale.extremeFear") },
    { to: 45, cls: "bg-amber-400/60", label: t("market.cards.fng.scale.fear") },
    { to: 55, cls: "bg-muted-foreground/30", label: t("market.cards.fng.scale.neutral") },
    { to: 75, cls: "bg-grade-a/60", label: t("market.cards.fng.scale.greed") },
    { to: 100, cls: "bg-grade-d/60", label: t("market.cards.fng.scale.extremeGreed") },
  ];
  return (
    <div>
      <div className="relative flex h-1.5 w-full overflow-hidden rounded-full">
        {segs.map((s, i) => (
          <div
            key={i}
            className={s.cls}
            style={{ width: `${s.to - (segs[i - 1]?.to ?? 0)}%` }}
          />
        ))}
        <div
          className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${value}%` }}
        >
          <div className="h-2.5 w-0.5 rounded-full bg-foreground" />
        </div>
      </div>
      <div className="mt-1 grid grid-cols-5 text-[9px] uppercase tracking-wider text-muted-foreground">
        {segs.map((s) => (
          <span key={s.label} className="text-center">
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export async function FearGreedCard() {
  const t = await getT();
  const fng = await fetchFng();
  const alert = fng.value >= 75 || fng.value <= 25;
  const angle = (fng.value / 100) * 180;
  const weekDelta = fng.value - fng.weekAgo;
  const ins = fngInsight(fng.value, t);
  return (
    <Card label="Fear & Greed" via="via alternative.me" alert={alert}>
      <div className="flex items-end gap-3">
        <svg viewBox="0 0 120 70" className="h-12 w-20 shrink-0" aria-hidden>
          <path
            d="M10 60 A 50 50 0 0 1 110 60"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.15"
            strokeWidth="7"
            className="text-muted-foreground"
          />
          <path
            d={`M10 60 A 50 50 0 0 1 ${10 + 50 * (1 - Math.cos((angle * Math.PI) / 180))} ${60 - 50 * Math.sin((angle * Math.PI) / 180)}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            className={fngTone(fng.value)}
          />
        </svg>
        <div>
          <p
            className={cn(
              "font-mono text-[30px] font-bold leading-none tabular-nums",
              fngTone(fng.value),
            )}
          >
            {fng.value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {fngLabelKo(fng.label, t)} · {t("market.cards.fng.yesterday")}{" "}
            {fng.change > 0 ? "+" : ""}
            {fng.change}
          </p>
        </div>
      </div>

      <FngScale value={fng.value} />

      <div>
        <p className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
          {t("market.cards.fng.last7d")}
        </p>
        <FngSparkline history={fng.history} color={fngTone(fng.value)} />
        <div className="mt-0.5 flex items-baseline justify-between text-[11px] text-muted-foreground">
          <span>{t("market.cards.fng.weekAgo")} {fng.weekAgo}</span>
          <span
            className={cn(
              "font-mono tabular-nums",
              weekDelta > 0
                ? "text-grade-a"
                : weekDelta < 0
                  ? "text-grade-d"
                  : "",
            )}
          >
            {weekDelta > 0 ? "+" : ""}
            {weekDelta}
          </span>
        </div>
      </div>

      <Insight title={ins.title}>{ins.body}</Insight>
    </Card>
  );
}

// ─── 2. BTC Dominance ────────────────────────────────────────────

function dominanceInsight(
  btc: number,
  t: (k: string) => string,
): { title: string; body: React.ReactNode } {
  if (btc >= 60)
    return {
      title: t("market.cards.dominance.insight.btcStrong.title"),
      body: (
        <>
          <p>{t("market.cards.dominance.insight.btcStrong.l1")}</p>
          <p>{t("market.cards.dominance.insight.btcStrong.l2")}</p>
          <p>{t("market.cards.dominance.insight.btcStrong.l3")}</p>
        </>
      ),
    };
  if (btc >= 55)
    return {
      title: t("market.cards.dominance.insight.btcLead.title"),
      body: (
        <>
          <p>{t("market.cards.dominance.insight.btcLead.l1")}</p>
          <p>{t("market.cards.dominance.insight.btcLead.l2")}</p>
        </>
      ),
    };
  if (btc >= 50)
    return {
      title: t("market.cards.dominance.insight.balance.title"),
      body: (
        <>
          <p>{t("market.cards.dominance.insight.balance.l1")}</p>
          <p>{t("market.cards.dominance.insight.balance.l2")}</p>
        </>
      ),
    };
  return {
    title: t("market.cards.dominance.insight.altLead.title"),
    body: (
      <>
        <p>{t("market.cards.dominance.insight.altLead.l1")}</p>
        <p>{t("market.cards.dominance.insight.altLead.l2")}</p>
        <p>{t("market.cards.dominance.insight.altLead.l3")}</p>
      </>
    ),
  };
}

export async function DominanceCard() {
  const t = await getT();
  const d = await fetchDominance();
  const ins = dominanceInsight(d.btc, t);
  return (
    <Card label="BTC Dominance" via="via CoinGecko">
      <div>
        <p className="font-mono text-[32px] font-bold leading-none tabular-nums">
          {d.btc.toFixed(1)}
          <span className="text-lg text-muted-foreground">%</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("market.cards.dominance.subtitle")}</p>
      </div>

      <div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/30">
          <div className="bg-amber-400/80" style={{ width: `${d.btc}%` }} />
          <div className="bg-sky-400/80" style={{ width: `${d.eth}%` }} />
          <div className="bg-grade-a/70" style={{ width: `${d.stables}%` }} />
          <div
            className="bg-muted-foreground/40"
            style={{ width: `${d.others}%` }}
          />
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums">
          {[
            { k: "BTC", v: d.btc, c: "bg-amber-400/80" },
            { k: "ETH", v: d.eth, c: "bg-sky-400/80" },
            { k: "Stables", v: d.stables, c: "bg-grade-a/70" },
            { k: t("market.cards.dominance.others"), v: d.others, c: "bg-muted-foreground/40" },
          ].map((row) => (
            <li key={row.k} className="flex items-center gap-1.5">
              <span className={cn("inline-block h-2 w-2 rounded-sm", row.c)} />
              <span className="text-muted-foreground">{row.k}</span>
              <span className="ml-auto font-mono">{row.v.toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>

      <Insight title={ins.title}>{ins.body}</Insight>
    </Card>
  );
}

// ─── 3. Alt Season Index ─────────────────────────────────────────

function altTone(v: number) {
  if (v >= 75) return "text-grade-a";
  if (v >= 50) return "text-grade-a/80";
  if (v >= 25) return "text-muted-foreground";
  return "text-amber-400";
}

function altInsight(
  v: number,
  t: (k: string) => string,
): { title: string; body: React.ReactNode } {
  if (v >= 75)
    return {
      title: t("market.cards.alt.insight.altSeason.title"),
      body: (
        <>
          <p>{t("market.cards.alt.insight.altSeason.l1")}</p>
          <p>{t("market.cards.alt.insight.altSeason.l2")}</p>
          <p>{t("market.cards.alt.insight.altSeason.l3")}</p>
        </>
      ),
    };
  if (v >= 50)
    return {
      title: t("market.cards.alt.insight.altLead.title"),
      body: (
        <>
          <p>{t("market.cards.alt.insight.altLead.l1")}</p>
          <p>{t("market.cards.alt.insight.altLead.l2")}</p>
        </>
      ),
    };
  if (v >= 25)
    return {
      title: t("market.cards.alt.insight.neutral.title"),
      body: (
        <>
          <p>{t("market.cards.alt.insight.neutral.l1")}</p>
          <p>{t("market.cards.alt.insight.neutral.l2")}</p>
        </>
      ),
    };
  return {
    title: t("market.cards.alt.insight.btcSeason.title"),
    body: (
      <>
        <p>{t("market.cards.alt.insight.btcSeason.l1")}</p>
        <p>{t("market.cards.alt.insight.btcSeason.l2")}</p>
      </>
    ),
  };
}

export async function AltSeasonCard() {
  const t = await getT();
  const r = await fetchAltSeasonIndex();
  const ins = altInsight(r.index, t);
  return (
    <Card label="Alt Season Index" via={t("market.cards.alt.via")}>
      <div>
        <p
          className={cn(
            "font-mono text-[32px] font-bold leading-none tabular-nums",
            altTone(r.index),
          )}
        >
          {r.index}
          <span className="text-lg text-muted-foreground">/100</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{r.label}</p>
      </div>

      <div>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
          <div
            className="h-full bg-primary"
            style={{ width: `${Math.max(0, Math.min(100, r.index))}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[9px] uppercase tracking-wider text-muted-foreground">
          <span>{t("market.cards.alt.btcSeason")}</span>
          <span>{t("market.cards.alt.neutral")}</span>
          <span>{t("market.cards.alt.altSeason")}</span>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {t("market.cards.alt.outperform")}{" "}
        <span className="font-mono font-medium text-foreground">
          {r.outperformers}/{r.totalCompared}
        </span>
        {" · "}{t("market.cards.alt.btc90d")}{" "}
        <span
          className={cn(
            "font-mono tabular-nums",
            r.btcChange90d >= 0 ? "text-grade-a" : "text-grade-d",
          )}
        >
          {r.btcChange90d >= 0 ? "+" : ""}
          {r.btcChange90d.toFixed(1)}%
        </span>
      </p>

      <Insight title={ins.title}>{ins.body}</Insight>
    </Card>
  );
}

// ─── 4. Kimchi Premium ───────────────────────────────────────────

function kimchiTone(v: number) {
  if (v >= 4) return "text-grade-d";
  if (v >= 2) return "text-amber-400";
  if (v <= -2) return "text-sky-400";
  return "text-grade-a";
}

function kimchiInsight(
  v: number,
  t: (k: string) => string,
): { title: string; body: React.ReactNode } {
  if (v >= 4)
    return {
      title: t("market.cards.kimchi.insight.overheat.title"),
      body: (
        <>
          <p>{t("market.cards.kimchi.insight.overheat.l1")}</p>
          <p>{t("market.cards.kimchi.insight.overheat.l2")}</p>
          <p>{t("market.cards.kimchi.insight.overheat.l3")}</p>
        </>
      ),
    };
  if (v >= 2)
    return {
      title: t("market.cards.kimchi.insight.fomo.title"),
      body: (
        <>
          <p>{t("market.cards.kimchi.insight.fomo.l1")}</p>
          <p>{t("market.cards.kimchi.insight.fomo.l2")}</p>
        </>
      ),
    };
  if (v <= -2)
    return {
      title: t("market.cards.kimchi.insight.reverse.title"),
      body: (
        <>
          <p>{t("market.cards.kimchi.insight.reverse.l1")}</p>
          <p>{t("market.cards.kimchi.insight.reverse.l2")}</p>
          <p>{t("market.cards.kimchi.insight.reverse.l3")}</p>
        </>
      ),
    };
  return {
    title: t("market.cards.kimchi.insight.normal.title"),
    body: (
      <>
        <p>{t("market.cards.kimchi.insight.normal.l1")}</p>
        <p>{t("market.cards.kimchi.insight.normal.l2")}</p>
      </>
    ),
  };
}

export async function KimchiCard() {
  const t = await getT();
  const rows = await fetchKimchiPremium();
  if (rows.length === 0) {
    return (
      <Card label={t("market.cards.kimchi.title")} via="via Upbit · Binance">
        <p className="text-xs text-muted-foreground">{t("market.cards.noData")}</p>
      </Card>
    );
  }
  const btc = rows.find((r) => r.symbol === "BTC") ?? rows[0];
  const alert = btc.premiumPct >= 4 || btc.premiumPct <= -2;
  const ins = kimchiInsight(btc.premiumPct, t);

  return (
    <Card
      label={t("market.cards.kimchi.title")}
      via="via Upbit · Binance · USDT/KRW"
      alert={alert}
    >
      <div>
        <p
          className={cn(
            "font-mono text-[30px] font-bold leading-none tabular-nums",
            kimchiTone(btc.premiumPct),
          )}
        >
          {btc.premiumPct >= 0 ? "+" : ""}
          {btc.premiumPct.toFixed(2)}%
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          USDT/KRW ₩{btc.usdKrwRate.toFixed(0)}
        </p>
      </div>

      <div>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-[9px] uppercase tracking-wider text-muted-foreground">
              <th className="pb-1 font-medium" />
              <th className="pb-1 text-right font-medium">Upbit (KRW)</th>
              <th className="pb-1 text-right font-medium">Binance (USD)</th>
              <th className="pb-1 text-right font-medium">{t("market.cards.kimchi.premium")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 5).map((r) => (
              <tr key={r.symbol} className="border-t border-border/40">
                <td className="py-1.5 font-mono font-bold">{r.symbol}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">
                  ₩{Math.round(r.upbitKrw).toLocaleString("ko-KR")}
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                  ${r.binanceUsd.toLocaleString("en-US", {
                    maximumFractionDigits: r.binanceUsd < 10 ? 4 : 2,
                  })}
                </td>
                <td
                  className={cn(
                    "py-1.5 text-right font-mono font-semibold tabular-nums",
                    kimchiTone(r.premiumPct),
                  )}
                >
                  {r.premiumPct >= 0 ? "+" : ""}
                  {r.premiumPct.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Insight title={ins.title}>{ins.body}</Insight>
    </Card>
  );
}

// ─── 5. Stablecoin Mcap ──────────────────────────────────────────

function stablecapInsight(
  v: number,
  t: (k: string) => string,
): { title: string; body: React.ReactNode } {
  if (v >= 1)
    return {
      title: t("market.cards.stablecap.insight.riskOn.title"),
      body: (
        <>
          <p>{t("market.cards.stablecap.insight.riskOn.l1")}</p>
          <p>{t("market.cards.stablecap.insight.riskOn.l2")}</p>
          <p>{t("market.cards.stablecap.insight.riskOn.l3")}</p>
        </>
      ),
    };
  if (v <= -1)
    return {
      title: t("market.cards.stablecap.insight.drain.title"),
      body: (
        <>
          <p>{t("market.cards.stablecap.insight.drain.l1")}</p>
          <p>{t("market.cards.stablecap.insight.drain.l2")}</p>
          <p>{t("market.cards.stablecap.insight.drain.l3")}</p>
        </>
      ),
    };
  return {
    title: t("market.cards.stablecap.insight.stable.title"),
    body: (
      <>
        <p>{t("market.cards.stablecap.insight.stable.l1")}</p>
        <p>{t("market.cards.stablecap.insight.stable.l2")}</p>
      </>
    ),
  };
}

export async function StablecapCard() {
  const t = await getT();
  const r = await fetchStablecoinMcap();
  const ins = stablecapInsight(r.total7dDeltaPct, t);
  return (
    <Card label="Stablecoin Mcap" via={t("market.cards.stablecap.via")}>
      <div>
        <p className="font-mono text-[30px] font-bold leading-none tabular-nums">
          {fmtBn(r.total)}
        </p>
        <p
          className={cn(
            "mt-1 text-xs tabular-nums",
            r.total7dDeltaPct >= 0 ? "text-grade-a" : "text-grade-d",
          )}
        >
          {t("market.cards.stablecap.days7")} {fmtPct(r.total7dDeltaPct)}
        </p>
      </div>

      <ul className="space-y-1.5">
        {r.coins.map((c) => (
          <li
            key={c.symbol}
            className="flex items-baseline justify-between border-b border-border/40 pb-1.5 text-xs last:border-b-0 last:pb-0"
          >
            <span className="font-mono font-bold">{c.symbol}</span>
            <div className="flex items-baseline gap-3 tabular-nums">
              <span className="text-muted-foreground">{fmtBn(c.marketCap)}</span>
              <span
                className={cn(
                  "font-mono font-semibold",
                  c.change7dPct >= 0 ? "text-grade-a" : "text-grade-d",
                )}
              >
                {fmtPct(c.change7dPct)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <Insight title={ins.title}>{ins.body}</Insight>
    </Card>
  );
}

// ─── 6. Long/Short Ratio ─────────────────────────────────────────

function lsInsight(
  longPct: number,
  t: (k: string) => string,
): { title: string; body: React.ReactNode } {
  if (longPct >= 65)
    return {
      title: t("market.cards.ls.insight.longOverheat.title"),
      body: (
        <>
          <p>{t("market.cards.ls.insight.longOverheat.l1")}</p>
          <p>{t("market.cards.ls.insight.longOverheat.l2")}</p>
          <p>{t("market.cards.ls.insight.longOverheat.l3")}</p>
        </>
      ),
    };
  if (longPct >= 58)
    return {
      title: t("market.cards.ls.insight.longLead.title"),
      body: (
        <>
          <p>{t("market.cards.ls.insight.longLead.l1")}</p>
          <p>{t("market.cards.ls.insight.longLead.l2")}</p>
        </>
      ),
    };
  if (longPct <= 35)
    return {
      title: t("market.cards.ls.insight.shortOverheat.title"),
      body: (
        <>
          <p>{t("market.cards.ls.insight.shortOverheat.l1")}</p>
          <p>{t("market.cards.ls.insight.shortOverheat.l2")}</p>
          <p>{t("market.cards.ls.insight.shortOverheat.l3")}</p>
        </>
      ),
    };
  if (longPct <= 42)
    return {
      title: t("market.cards.ls.insight.shortLead.title"),
      body: (
        <>
          <p>{t("market.cards.ls.insight.shortLead.l1")}</p>
          <p>{t("market.cards.ls.insight.shortLead.l2")}</p>
        </>
      ),
    };
  return {
    title: t("market.cards.ls.insight.balance.title"),
    body: (
      <>
        <p>{t("market.cards.ls.insight.balance.l1")}</p>
        <p>{t("market.cards.ls.insight.balance.l2")}</p>
      </>
    ),
  };
}

function LsSparkline({ series }: { series: LongShortPoint[] }) {
  if (series.length < 2) return null;
  const W = 200;
  const H = 28;
  const PAD = 2;
  const xs = series.map(
    (_, i) => PAD + (i * (W - PAD * 2)) / (series.length - 1),
  );
  const vals = series.map((p) => p.longPct * 100);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = Math.max(1, max - min);
  const ys = vals.map((v) => H - PAD - ((v - min) / range) * (H - PAD * 2));
  const d = xs
    .map(
      (x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${ys[i].toFixed(1)}`,
    )
    .join(" ");
  const last = series[series.length - 1];
  const tone =
    last.longPct >= 0.58
      ? "text-grade-a"
      : last.longPct <= 0.42
        ? "text-grade-d"
        : "text-muted-foreground";
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={tone}
      />
      <circle
        cx={xs[xs.length - 1]}
        cy={ys[ys.length - 1]}
        r="2.5"
        className={tone}
        fill="currentColor"
      />
    </svg>
  );
}

export async function LongShortCard() {
  const t = await getT();
  const r = await fetchLongShortRatio("BTCUSDT");
  if (!r.latest) {
    return (
      <Card label="Long/Short · BTC" via="via Binance">
        <p className="text-xs text-muted-foreground">{t("market.cards.noData")}</p>
      </Card>
    );
  }
  const longPct = r.latest.longPct * 100;
  const shortPct = r.latest.shortPct * 100;
  const ratio = r.latest.ratio;
  const alert = longPct >= 65 || shortPct >= 65;
  const ins = lsInsight(longPct, t);

  return (
    <Card
      label="Long/Short · BTC"
      via="via Binance · global account ratio"
      alert={alert}
    >
      <div>
        <p className="font-mono text-[32px] font-bold leading-none tabular-nums">
          {ratio.toFixed(2)}
          <span className="ml-1 text-lg text-muted-foreground">×</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("market.cards.ls.ratioLabel")}</p>
      </div>

      <div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/30">
          <div className="bg-grade-a/80" style={{ width: `${longPct}%` }} />
          <div className="bg-grade-d/80" style={{ width: `${shortPct}%` }} />
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-x-3 text-[11px] tabular-nums">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-grade-a/80" />
            <span className="text-muted-foreground">Long</span>
            <span className="ml-auto font-mono">{longPct.toFixed(1)}%</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-grade-d/80" />
            <span className="text-muted-foreground">Short</span>
            <span className="ml-auto font-mono">{shortPct.toFixed(1)}%</span>
          </li>
        </ul>
      </div>

      <div>
        <p className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
          {t("market.cards.ls.longShare24h")}
        </p>
        <LsSparkline series={r.series} />
        <p
          className={cn(
            "mt-0.5 text-[11px] tabular-nums",
            r.deltaLongPct > 0
              ? "text-grade-a"
              : r.deltaLongPct < 0
                ? "text-grade-d"
                : "text-muted-foreground",
          )}
        >
          {t("market.cards.ls.h24")}{" "}
          {Math.abs(r.deltaLongPct) < 0.05
            ? t("market.cards.ls.noChange")
            : `${r.deltaLongPct >= 0 ? "+" : ""}${r.deltaLongPct.toFixed(1)}pp`}
        </p>
      </div>

      <Insight title={ins.title}>{ins.body}</Insight>
    </Card>
  );
}
