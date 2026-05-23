import { fetchFng } from "@/lib/market-widgets/fng";
import { fetchDominance } from "@/lib/market-widgets/dominance";
import { fetchAltSeasonIndex } from "@/lib/market-widgets/alt-season";
import { fetchKimchiPremium } from "@/lib/market-widgets/kimchi";
import { fetchStablecoinMcap } from "@/lib/market-widgets/stablecap";
import { fetchLongShortRatio } from "@/lib/market-widgets/long-short";
import { cn } from "@/lib/utils";

// ─── shared card shell ──────────────────────────────────────────
// Apple-tone: one big metric, one line of context. No inline warning
// banners — alert state communicated via subtle border tint only.

function Card({
  label,
  hint,
  alert,
  children,
}: {
  label: string;
  hint?: string;
  alert?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-card/40 px-6 py-5",
        alert ? "border-grade-d/40" : "border-border/60",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {children}
    </article>
  );
}

function fmtBig(n: number): string {
  if (n >= 1_000_000_000_000) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1_000_000_000) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// ─── 1. Fear & Greed ─────────────────────────────────────────────

export async function FearGreedCard() {
  const d = await fetchFng();
  const alert = d.value >= 75 || d.value <= 25;
  const verbal =
    d.value <= 25
      ? "극공포 · 역발상 매수 관점"
      : d.value <= 45
        ? "공포 · 관망 기본"
        : d.value <= 55
          ? "중립"
          : d.value <= 75
            ? "탐욕 · 익절 고려"
            : "극탐욕 · 추격 금지";

  return (
    <Card label="Fear & Greed" hint="0–100" alert={alert}>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[44px] font-bold leading-none tabular-nums">
          {d.value}
        </span>
        <span className="text-base text-muted-foreground">{d.label}</span>
      </div>
      <p className="text-sm text-muted-foreground">{verbal}</p>
    </Card>
  );
}

// ─── 2. BTC Dominance ────────────────────────────────────────────

export async function DominanceCard() {
  const d = await fetchDominance();
  return (
    <Card label="BTC Dominance" hint="시총 비중">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[44px] font-bold leading-none tabular-nums">
          {d.btc.toFixed(1)}
        </span>
        <span className="text-base text-muted-foreground">%</span>
      </div>
      <p className="text-sm text-muted-foreground">
        ETH {d.eth.toFixed(1)}% · 알트 {(100 - d.btc - d.eth - d.stables).toFixed(1)}%
      </p>
    </Card>
  );
}

// ─── 3. Alt Season Index ─────────────────────────────────────────

export async function AltSeasonCard() {
  const d = await fetchAltSeasonIndex();
  return (
    <Card label="Alt Season" hint="Top 50 vs BTC · 90d">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[44px] font-bold leading-none tabular-nums">
          {d.index}
        </span>
        <span className="text-base text-muted-foreground">{d.label}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Top 50 중 {d.outperformers}개가 BTC 초과
      </p>
    </Card>
  );
}

// ─── 4. Kimchi Premium ───────────────────────────────────────────

export async function KimchiCard() {
  const rows = await fetchKimchiPremium();
  const avg =
    rows.length > 0 ? rows.reduce((s, r) => s + r.premiumPct, 0) / rows.length : 0;
  const alert = avg >= 4 || avg <= -2;
  const rate = rows[0]?.usdKrwRate ?? 0;
  const verbal =
    avg >= 4
      ? "한국 과열 · 차익 매물 압력"
      : avg <= -2
        ? "한국 매도 쏠림"
        : rate > 0
          ? `USDT/KRW ₩${Math.round(rate)}`
          : "데이터 없음";
  return (
    <Card label="김치 프리미엄" hint="평균 3코인" alert={alert}>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-[44px] font-bold leading-none tabular-nums",
            alert && "text-grade-d",
          )}
        >
          {avg >= 0 ? "+" : ""}
          {avg.toFixed(2)}
        </span>
        <span className="text-base text-muted-foreground">%</span>
      </div>
      <p className="text-sm text-muted-foreground">{verbal}</p>
    </Card>
  );
}

// ─── 5. Stablecoin Mcap ──────────────────────────────────────────

export async function StablecapCard() {
  const d = await fetchStablecoinMcap();
  const verbal =
    d.total7dDeltaPct > 0.5
      ? "매수 탄약 누적"
      : d.total7dDeltaPct < -0.5
        ? "유동성 회수"
        : "보합";
  return (
    <Card label="Stablecoin Mcap" hint="USDT·USDC·DAI·FDUSD">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[44px] font-bold leading-none tabular-nums">
          {fmtBig(d.total)}
        </span>
        <span
          className={cn(
            "font-mono text-sm tabular-nums",
            d.total7dDeltaPct > 0
              ? "text-grade-a"
              : d.total7dDeltaPct < 0
                ? "text-grade-d"
                : "text-muted-foreground",
          )}
        >
          {d.total7dDeltaPct >= 0 ? "+" : ""}
          {d.total7dDeltaPct.toFixed(2)}%
        </span>
      </div>
      <p className="text-sm text-muted-foreground">7일 변화 · {verbal}</p>
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
  const alert = longPct >= 65 || shortPct >= 65;
  const verbal =
    longPct >= 65
      ? "롱 과열 · 청산 캐스케이드 후보"
      : shortPct >= 65
        ? "숏 과열 · 숏 스퀴즈 가능"
        : `롱 ${longPct.toFixed(0)}% · 숏 ${shortPct.toFixed(0)}%`;
  return (
    <Card label="Long/Short · BTC" hint="Binance · 24h" alert={alert}>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-[44px] font-bold leading-none tabular-nums",
            alert && "text-grade-d",
          )}
        >
          {ratio.toFixed(2)}
        </span>
        <span className="text-base text-muted-foreground">×</span>
      </div>
      <p className="text-sm text-muted-foreground">{verbal}</p>
    </Card>
  );
}
