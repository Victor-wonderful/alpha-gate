import { fetchFng } from "@/lib/market-widgets/fng";
import { fetchDominance } from "@/lib/market-widgets/dominance";
import { fetchAltSeasonIndex } from "@/lib/market-widgets/alt-season";
import { fetchKimchiPremium } from "@/lib/market-widgets/kimchi";
import { fetchStablecoinMcap } from "@/lib/market-widgets/stablecap";
import { fetchLongShortRatio } from "@/lib/market-widgets/long-short";
import { cn } from "@/lib/utils";

// ─── shared card shell ──────────────────────────────────────────

function Card({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/30 px-5 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {hint ? (
          <p className="text-[10px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {children}
    </article>
  );
}

function deltaTone(v: number) {
  if (v > 0) return "text-grade-a";
  if (v < 0) return "text-grade-d";
  return "text-muted-foreground";
}

function fmtDelta(v: number, digits = 1) {
  if (v === 0) return "0";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;
}

function fmtBig(n: number): string {
  if (n >= 1_000_000_000_000) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1_000_000_000) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// ─── 1. Fear & Greed ─────────────────────────────────────────────

function fngTone(v: number) {
  if (v <= 25) return "text-sky-400";
  if (v < 45) return "text-amber-400";
  if (v <= 55) return "text-muted-foreground";
  if (v < 75) return "text-amber-400";
  return "text-grade-d";
}

export async function FearGreedCard() {
  const d = await fetchFng();
  const max = 100;
  const min = Math.min(...d.history.map((h) => h.value));
  const maxH = Math.max(...d.history.map((h) => h.value));
  const range = Math.max(1, maxH - min);

  return (
    <Card label="Fear & Greed" hint="0–100 · 7d">
      <div className="flex items-baseline gap-3">
        <span
          className={cn(
            "font-mono text-[34px] font-bold leading-none tabular-nums",
            fngTone(d.value),
          )}
        >
          {d.value}
        </span>
        <span className="text-sm text-foreground">{d.label}</span>
        <span
          className={cn(
            "ml-auto font-mono text-[11px] tabular-nums",
            deltaTone(d.change),
          )}
        >
          {fmtDelta(d.change, 0)} (1d)
        </span>
      </div>
      <div className="mt-1 flex h-6 items-end gap-0.5">
        {d.history.map((h, i) => {
          const ratio = (h.value - min) / range;
          return (
            <span
              key={i}
              className={cn(
                "w-1.5 rounded-sm",
                i === d.history.length - 1 ? "bg-primary" : "bg-muted-foreground/30",
              )}
              style={{ height: `${Math.max(8, ratio * 100)}%` }}
            />
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        7일 전 {d.weekAgo} → 오늘 {d.value} (참고용)
      </p>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted/30">
        <div
          className={cn(
            "h-full",
            d.value <= 25
              ? "bg-sky-400"
              : d.value < 45
                ? "bg-amber-400"
                : d.value <= 55
                  ? "bg-muted-foreground"
                  : d.value < 75
                    ? "bg-amber-400"
                    : "bg-grade-d",
          )}
          style={{ width: `${(d.value / max) * 100}%` }}
        />
      </div>
    </Card>
  );
}

// ─── 2. BTC Dominance ────────────────────────────────────────────

export async function DominanceCard() {
  const d = await fetchDominance();
  const segs = [
    { k: "BTC", v: d.btc, c: "bg-amber-400/80" },
    { k: "ETH", v: d.eth, c: "bg-sky-400/80" },
    { k: "Stables", v: d.stables, c: "bg-emerald-400/70" },
    { k: "Others", v: d.others, c: "bg-muted-foreground/40" },
  ];
  return (
    <Card label="BTC Dominance" hint="시총 비중">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[34px] font-bold leading-none tabular-nums text-foreground">
          {d.btc.toFixed(1)}
          <span className="text-base text-muted-foreground">%</span>
        </span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
        {segs.map((s) => (
          <span
            key={s.k}
            className={s.c}
            style={{ width: `${s.v}%` }}
            title={`${s.k} ${s.v.toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 text-[10px] text-muted-foreground">
        {segs.map((s) => (
          <div key={s.k}>
            <span
              className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", s.c)}
            />
            {s.k}
            <div className="font-mono font-semibold tabular-nums text-foreground">
              {s.v.toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── 3. Alt Season Index ─────────────────────────────────────────

export async function AltSeasonCard() {
  const d = await fetchAltSeasonIndex();
  const tone =
    d.index >= 75
      ? "text-emerald-400"
      : d.index <= 25
        ? "text-amber-400"
        : "text-muted-foreground";
  return (
    <Card label="Alt Season Index" hint="Top 50 vs BTC · 90d">
      <div className="flex items-baseline gap-3">
        <span
          className={cn(
            "font-mono text-[34px] font-bold leading-none tabular-nums",
            tone,
          )}
        >
          {d.index}
        </span>
        <span className="text-sm text-foreground">{d.label}</span>
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-muted/30">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: `${d.index}%` }}
        />
        <span className="absolute -top-0.5 h-2.5 w-px bg-muted-foreground/60" style={{ left: "25%" }} />
        <span className="absolute -top-0.5 h-2.5 w-px bg-muted-foreground/60" style={{ left: "75%" }} />
      </div>
      <p className="text-[10px] text-muted-foreground">
        Top 50 중 <span className="font-mono">{d.outperformers}</span>개가 BTC 초과 (BTC 90d{" "}
        <span className={deltaTone(d.btcChange90d)}>
          {fmtDelta(d.btcChange90d, 1)}%
        </span>
        )
      </p>
    </Card>
  );
}

// ─── 4. Kimchi Premium ───────────────────────────────────────────

export async function KimchiCard() {
  const rows = await fetchKimchiPremium();
  const btc = rows.find((r) => r.symbol === "BTC");
  const avg =
    rows.length > 0 ? rows.reduce((s, r) => s + r.premiumPct, 0) / rows.length : 0;
  const rate = btc?.usdKrwRate ?? 0;
  return (
    <Card label="김치 프리미엄" hint={`USDT/KRW ₩${Math.round(rate)}`}>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-[34px] font-bold leading-none tabular-nums",
            deltaTone(avg),
          )}
        >
          {avg >= 0 ? "+" : ""}
          {avg.toFixed(2)}
          <span className="text-base text-muted-foreground">%</span>
        </span>
        <span className="text-[11px] text-muted-foreground">(평균)</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        {rows.length === 0 ? (
          <span className="col-span-3 text-muted-foreground">데이터 없음</span>
        ) : (
          rows.map((r) => (
            <div key={r.symbol}>
              <span className="text-muted-foreground">{r.symbol}</span>
              <div
                className={cn(
                  "font-mono font-semibold tabular-nums",
                  deltaTone(r.premiumPct),
                )}
              >
                {r.premiumPct >= 0 ? "+" : ""}
                {r.premiumPct.toFixed(2)}%
              </div>
            </div>
          ))
        )}
      </div>
      {avg >= 4 ? (
        <p className="rounded bg-grade-d/10 px-2 py-1 text-[10px] text-grade-d">
          ⚠ 한국 과열 — 차익 매물 압력
        </p>
      ) : avg <= -2 ? (
        <p className="rounded bg-sky-400/10 px-2 py-1 text-[10px] text-sky-400">
          한국 매도 쏠림 / 글로벌 매수 우위
        </p>
      ) : null}
    </Card>
  );
}

// ─── 5. Stablecoin Mcap ──────────────────────────────────────────

export async function StablecapCard() {
  const d = await fetchStablecoinMcap();
  return (
    <Card label="Stablecoin Mcap" hint="USDT·USDC·DAI·FDUSD">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[34px] font-bold leading-none tabular-nums">
          {fmtBig(d.total)}
        </span>
        <span
          className={cn(
            "font-mono text-[11px] tabular-nums",
            deltaTone(d.total7dDeltaPct),
          )}
        >
          {fmtDelta(d.total7dDeltaPct, 2)}% (7d)
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        {d.coins.length === 0 ? (
          <span className="col-span-2 text-muted-foreground">데이터 없음</span>
        ) : (
          d.coins.slice(0, 4).map((c) => (
            <div
              key={c.symbol}
              className="flex items-center justify-between gap-2"
            >
              <span className="text-muted-foreground">{c.symbol}</span>
              <span
                className={cn(
                  "font-mono tabular-nums",
                  deltaTone(c.change7dPct),
                )}
              >
                {fmtDelta(c.change7dPct, 2)}%
              </span>
            </div>
          ))
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        증가 = 매수 탄약 누적 · 감소 = 유동성 회수
      </p>
    </Card>
  );
}

// ─── 6. Long/Short Ratio ─────────────────────────────────────────

export async function LongShortCard() {
  const d = await fetchLongShortRatio("BTCUSDT");
  if (!d.latest) {
    return (
      <Card label="Long/Short · BTC">
        <p className="text-sm text-muted-foreground">데이터 없음</p>
      </Card>
    );
  }
  const longPct = d.latest.longPct * 100;
  const shortPct = d.latest.shortPct * 100;
  const ratio = d.latest.ratio;
  return (
    <Card label="Long/Short · BTC" hint="Binance · 24h">
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-[34px] font-bold leading-none tabular-nums",
            longPct > shortPct ? "text-grade-a" : "text-grade-d",
          )}
        >
          {ratio.toFixed(2)}
          <span className="text-base text-muted-foreground">×</span>
        </span>
        <span
          className={cn(
            "ml-auto font-mono text-[11px] tabular-nums",
            deltaTone(d.deltaLongPct),
          )}
        >
          {fmtDelta(d.deltaLongPct, 1)}pp (24h)
        </span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
        <span
          className="bg-grade-a/80"
          style={{ width: `${longPct}%` }}
        />
        <span
          className="bg-grade-d/80"
          style={{ width: `${shortPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-grade-a">롱 {longPct.toFixed(1)}%</span>
        <span className="text-grade-d">숏 {shortPct.toFixed(1)}%</span>
      </div>
      {longPct >= 65 ? (
        <p className="rounded bg-grade-d/10 px-2 py-1 text-[10px] text-grade-d">
          ⚠ 롱 과열 — 청산 캐스케이드 후보
        </p>
      ) : shortPct >= 65 ? (
        <p className="rounded bg-sky-400/10 px-2 py-1 text-[10px] text-sky-400">
          숏 과열 — 숏 스퀴즈 가능
        </p>
      ) : null}
    </Card>
  );
}
