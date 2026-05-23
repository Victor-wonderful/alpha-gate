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
        "flex h-full flex-col gap-4 rounded-2xl border bg-card/40 p-6",
        alert ? "border-grade-d/40" : "border-border/60",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          {label}
        </p>
      </div>
      {children}
      {via ? (
        <p className="mt-auto pt-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          {via}
        </p>
      ) : null}
    </article>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-t border-border/40 pt-3 text-sm text-muted-foreground">
      {children}
    </p>
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

function fngLabelKo(label: string) {
  const map: Record<string, string> = {
    "Extreme Fear": "극단적 공포",
    Fear: "공포",
    Neutral: "중립",
    Greed: "탐욕",
    "Extreme Greed": "극단적 탐욕",
  };
  return map[label] ?? label;
}

function fngHint(v: number) {
  if (v < 25) return "투매 분위기 — 역발상 매수 관점에서 관심 구간.";
  if (v < 45) return "공포 우세 — 추세 약화, 분할 매수 검토 구간.";
  if (v < 55) return "심리 균형 — 큰 베팅보단 셋업 검증.";
  if (v < 75) return "탐욕 우세 — 추격 매수보단 익절·관망 비중 ↑.";
  return "과열 — 단기 조정 위험 ↑, 리스크 관리 우선.";
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
  const H = 50;
  const PAD = 4;
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
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={color}
      />
      <circle
        cx={xs[xs.length - 1]}
        cy={ys[ys.length - 1]}
        r="3"
        className={color}
        fill="currentColor"
      />
    </svg>
  );
}

function FngScale({ value }: { value: number }) {
  const segs = [
    { to: 25, cls: "bg-grade-d/60", label: "극공포" },
    { to: 45, cls: "bg-amber-400/60", label: "공포" },
    { to: 55, cls: "bg-muted-foreground/30", label: "중립" },
    { to: 75, cls: "bg-grade-a/60", label: "탐욕" },
    { to: 100, cls: "bg-grade-d/60", label: "극탐욕" },
  ];
  return (
    <div>
      <div className="relative flex h-2 w-full overflow-hidden rounded-full">
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
          <div className="h-3 w-1 rounded-full bg-foreground" />
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-5 text-[10px] uppercase tracking-wider text-muted-foreground">
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
  const fng = await fetchFng();
  const alert = fng.value >= 75 || fng.value <= 25;
  const angle = (fng.value / 100) * 180;
  const weekDelta = fng.value - fng.weekAgo;
  return (
    <Card label="Fear & Greed" via="via alternative.me" alert={alert}>
      {/* Top: gauge + big number */}
      <div className="flex items-end gap-4">
        <svg viewBox="0 0 120 70" className="h-16 w-28 shrink-0" aria-hidden>
          <path
            d="M10 60 A 50 50 0 0 1 110 60"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.15"
            strokeWidth="8"
            className="text-muted-foreground"
          />
          <path
            d={`M10 60 A 50 50 0 0 1 ${10 + 50 * (1 - Math.cos((angle * Math.PI) / 180))} ${60 - 50 * Math.sin((angle * Math.PI) / 180)}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            className={fngTone(fng.value)}
          />
        </svg>
        <div>
          <p
            className={cn(
              "font-mono text-[44px] font-bold leading-none tabular-nums",
              fngTone(fng.value),
            )}
          >
            {fng.value}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {fngLabelKo(fng.label)} · 어제 {fng.change > 0 ? "+" : ""}
            {fng.change}
          </p>
        </div>
      </div>

      <FngScale value={fng.value} />

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          최근 7일
        </p>
        <FngSparkline history={fng.history} color={fngTone(fng.value)} />
        <div className="mt-1 flex items-baseline justify-between text-xs text-muted-foreground">
          <span>1주 전 {fng.weekAgo}</span>
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

      <Hint>{fngHint(fng.value)}</Hint>
    </Card>
  );
}

// ─── 2. BTC Dominance ────────────────────────────────────────────

function dominanceHint(btc: number) {
  if (btc >= 60) return "BTC 우위장 — 알트 자금 BTC로 회귀.";
  if (btc >= 55) return "BTC 우위 — 알트는 선별 접근.";
  if (btc >= 50) return "균형 구간 — 섹터 로테이션 가능.";
  return "알트 우위 — 알트 시즌 가능성 모니터링.";
}

export async function DominanceCard() {
  const d = await fetchDominance();
  return (
    <Card label="BTC Dominance" via="via CoinGecko">
      <div>
        <p className="font-mono text-[48px] font-bold leading-none tabular-nums">
          {d.btc.toFixed(1)}
          <span className="text-2xl text-muted-foreground">%</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">전체 시총 중 BTC 비중</p>
      </div>

      <div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/30">
          <div
            className="bg-amber-400/80"
            style={{ width: `${d.btc}%` }}
            title={`BTC ${d.btc.toFixed(1)}%`}
          />
          <div
            className="bg-sky-400/80"
            style={{ width: `${d.eth}%` }}
            title={`ETH ${d.eth.toFixed(1)}%`}
          />
          <div
            className="bg-grade-a/70"
            style={{ width: `${d.stables}%` }}
            title={`Stables ${d.stables.toFixed(1)}%`}
          />
          <div
            className="bg-muted-foreground/40"
            style={{ width: `${d.others}%` }}
            title={`Others ${d.others.toFixed(1)}%`}
          />
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
          {[
            { k: "BTC", v: d.btc, c: "bg-amber-400/80" },
            { k: "ETH", v: d.eth, c: "bg-sky-400/80" },
            { k: "Stables", v: d.stables, c: "bg-grade-a/70" },
            { k: "기타", v: d.others, c: "bg-muted-foreground/40" },
          ].map((row) => (
            <li key={row.k} className="flex items-center gap-2">
              <span className={cn("inline-block h-2 w-2 rounded-sm", row.c)} />
              <span className="text-muted-foreground">{row.k}</span>
              <span className="ml-auto font-mono">{row.v.toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          BTC : ETH 비율
        </p>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-2xl font-bold tabular-nums">
            {d.eth > 0 ? (d.btc / d.eth).toFixed(2) : "—"}
            <span className="ml-1 text-base text-muted-foreground">×</span>
          </span>
          <span className="text-sm text-muted-foreground">
            {d.btc >= d.eth * 4
              ? "BTC 압도"
              : d.btc >= d.eth * 3
                ? "BTC 우위"
                : "균형"}
          </span>
        </div>
      </div>

      <Hint>{dominanceHint(d.btc)}</Hint>
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

function altHint(v: number) {
  if (v >= 75) return "알트 시즌 — 자금이 BTC 밖으로 빠르게 회전 중.";
  if (v >= 50) return "알트 우위 분위기 — 선별 알트 강세.";
  if (v >= 25) return "중립 — 섹터 로테이션 가능 구간.";
  return "비트코인 시즌 — 알트 변동성 ↓, BTC 비중 ↑ 권장.";
}

export async function AltSeasonCard() {
  const r = await fetchAltSeasonIndex();
  return (
    <Card label="Alt Season Index" via="via CoinGecko · 자체 산정 (90d, Top 50)">
      <div>
        <p
          className={cn(
            "font-mono text-[48px] font-bold leading-none tabular-nums",
            altTone(r.index),
          )}
        >
          {r.index}
          <span className="text-2xl text-muted-foreground">/100</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{r.label}</p>
      </div>

      <div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/30">
          <div
            className="h-full bg-primary"
            style={{ width: `${Math.max(0, Math.min(100, r.index))}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>BTC 시즌</span>
          <span>중립</span>
          <span>알트 시즌</span>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Top 50 알트 중 90일 누적으로 BTC를 이긴 코인:{" "}
        <span className="font-mono font-medium text-foreground">
          {r.outperformers}/{r.totalCompared}
        </span>
        <br />
        BTC 90일 변동:{" "}
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

      <Hint>{altHint(r.index)}</Hint>
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

function kimchiHint(v: number) {
  if (v >= 4) return "한국 과열 — 차익거래·역내 차익 매물 유입 가능성.";
  if (v >= 2) return "프리미엄 형성 — FOMO 단계 의심.";
  if (v <= -2) return "역프 — 한국 매물 쏠림 또는 USD 강세 신호.";
  return "정상 범위 — 글로벌 동조.";
}

export async function KimchiCard() {
  const rows = await fetchKimchiPremium();
  if (rows.length === 0) {
    return (
      <Card label="김치 프리미엄" via="via Upbit · Binance">
        <p className="text-sm text-muted-foreground">데이터 없음</p>
      </Card>
    );
  }
  const btc = rows.find((r) => r.symbol === "BTC") ?? rows[0];
  const alert = btc.premiumPct >= 4 || btc.premiumPct <= -2;

  return (
    <Card
      label="김치 프리미엄"
      via="via Upbit · Binance · USDT/KRW market rate"
      alert={alert}
    >
      <div>
        <p
          className={cn(
            "font-mono text-[44px] font-bold leading-none tabular-nums",
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

      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.symbol}
            className="flex items-baseline justify-between border-b border-border/40 pb-2 last:border-b-0 last:pb-0"
          >
            <span className="font-mono text-base font-bold tabular-nums">
              {r.symbol}
            </span>
            <div className="flex items-baseline gap-3 text-sm tabular-nums">
              <span className="text-muted-foreground">
                ₩{Math.round(r.upbitKrw).toLocaleString("ko-KR")}
              </span>
              <span
                className={cn("font-mono font-semibold", kimchiTone(r.premiumPct))}
              >
                {r.premiumPct >= 0 ? "+" : ""}
                {r.premiumPct.toFixed(2)}%
              </span>
            </div>
          </li>
        ))}
      </ul>

      <Hint>{kimchiHint(btc.premiumPct)}</Hint>
    </Card>
  );
}

// ─── 5. Stablecoin Mcap ──────────────────────────────────────────

function stablecapHint(v: number) {
  if (v >= 1) return "스테이블 시총 확장 — 시장 유입 자금 ↑, 위험자산 우호.";
  if (v <= -1) return "스테이블 시총 위축 — 유동성 회수, 변동성 위험.";
  return "안정 — 유의미한 자금 이동 없음.";
}

export async function StablecapCard() {
  const r = await fetchStablecoinMcap();
  return (
    <Card label="Stablecoin Mcap" via="via CoinGecko · 7d 시총 변화">
      <div>
        <p className="font-mono text-[44px] font-bold leading-none tabular-nums">
          {fmtBn(r.total)}
        </p>
        <p
          className={cn(
            "mt-2 text-sm tabular-nums",
            r.total7dDeltaPct >= 0 ? "text-grade-a" : "text-grade-d",
          )}
        >
          7일: {fmtPct(r.total7dDeltaPct)}
        </p>
      </div>

      <ul className="space-y-2">
        {r.coins.map((c) => (
          <li
            key={c.symbol}
            className="flex items-baseline justify-between border-b border-border/40 pb-2 last:border-b-0 last:pb-0"
          >
            <span className="font-mono text-base font-bold">{c.symbol}</span>
            <div className="flex items-baseline gap-3 text-sm tabular-nums">
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

      <Hint>{stablecapHint(r.total7dDeltaPct)}</Hint>
    </Card>
  );
}

// ─── 6. Long/Short Ratio ─────────────────────────────────────────

function lsHint(p: LongShortPoint) {
  const longShare = p.longPct * 100;
  if (longShare >= 65) return "롱 과열 — 역추세 단기 후보, 청산 캐스케이드 주의.";
  if (longShare >= 58) return "롱 우위 — 추세 추종 우호, 펀딩비 동반 점검.";
  if (longShare <= 35) return "숏 과열 — 숏 스퀴즈 가능, 매수 우호 구간.";
  if (longShare <= 42) return "숏 우위 — 단기 약세 심리, 바운스 트레이드 후보.";
  return "균형 — 명확한 포지셔닝 쏠림 없음.";
}

function LsSparkline({ series }: { series: LongShortPoint[] }) {
  if (series.length < 2) return null;
  const W = 200;
  const H = 36;
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
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={tone}
      />
      <circle
        cx={xs[xs.length - 1]}
        cy={ys[ys.length - 1]}
        r="3"
        className={tone}
        fill="currentColor"
      />
    </svg>
  );
}

export async function LongShortCard() {
  const r = await fetchLongShortRatio("BTCUSDT");
  if (!r.latest) {
    return (
      <Card label="Long/Short · BTC" via="via Binance">
        <p className="text-sm text-muted-foreground">데이터 없음</p>
      </Card>
    );
  }
  const longPct = r.latest.longPct * 100;
  const shortPct = r.latest.shortPct * 100;
  const ratio = r.latest.ratio;
  const alert = longPct >= 65 || shortPct >= 65;

  return (
    <Card
      label="Long/Short · BTC"
      via="via Binance · global account ratio"
      alert={alert}
    >
      <div>
        <p className="font-mono text-[48px] font-bold leading-none tabular-nums">
          {ratio.toFixed(2)}
          <span className="ml-1 text-2xl text-muted-foreground">×</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          롱/숏 계좌 비율 (Binance perp)
        </p>
      </div>

      <div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/30">
          <div className="bg-grade-a/80" style={{ width: `${longPct}%` }} />
          <div className="bg-grade-d/80" style={{ width: `${shortPct}%` }} />
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 text-sm tabular-nums">
          <li className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-sm bg-grade-a/80" />
            <span className="text-muted-foreground">Long</span>
            <span className="ml-auto font-mono">{longPct.toFixed(1)}%</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-sm bg-grade-d/80" />
            <span className="text-muted-foreground">Short</span>
            <span className="ml-auto font-mono">{shortPct.toFixed(1)}%</span>
          </li>
        </ul>
      </div>

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          최근 24시간 · Long 비중
        </p>
        <LsSparkline series={r.series} />
        <p
          className={cn(
            "mt-1 text-xs tabular-nums",
            r.deltaLongPct > 0
              ? "text-grade-a"
              : r.deltaLongPct < 0
                ? "text-grade-d"
                : "text-muted-foreground",
          )}
        >
          24h 변화:{" "}
          {Math.abs(r.deltaLongPct) < 0.05
            ? "변동 없음"
            : `${r.deltaLongPct >= 0 ? "+" : ""}${r.deltaLongPct.toFixed(1)}pp`}
        </p>
      </div>

      <Hint>{lsHint(r.latest)}</Hint>
    </Card>
  );
}
