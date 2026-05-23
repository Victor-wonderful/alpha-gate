import { ArrowDown, ArrowUp, ChevronDown, Pause } from "lucide-react";
import {
  fetchCapitalFlow,
  type ActionSignal,
  type Regime,
} from "@/lib/market-widgets/capital-flow";
import { cn } from "@/lib/utils";

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

const REGIME_META: Record<
  Regime,
  { dot: string; title: string; body: React.ReactNode }
> = {
  alt_season_entry: {
    dot: "bg-grade-a",
    title: "알트 시즌 진입",
    body: (
      <>
        <p>· 새 자금 유입(Stable ↑) + 도미넌스 ↓ + 알트 강세 — 자금이 BTC를 거치지 않고 알트로 직행.</p>
        <p>· 메이저 알트(ETH/SOL/AVAX) 추세 추종 적극.</p>
        <p>· 알트 비중 ↑, BTC 비중 ↓ 가능.</p>
        <p>· 도미넌스 50% 깨지면 더 공격적 신호.</p>
      </>
    ),
  },
  btc_led_rally: {
    dot: "bg-grade-a/80",
    title: "BTC 주도 강세",
    body: (
      <>
        <p>· 자금 유입(Stable ↑) + BTC가 알트보다 빠르게 상승.</p>
        <p>· 사이클 초입 패턴 — 알트는 보통 1~3주 후행.</p>
        <p>· 현재는 BTC 위주 진입, 도미넌스 꺾이는 시점 알트 전환 노릴 것.</p>
      </>
    ),
  },
  stables_deploying: {
    dot: "bg-grade-a",
    title: "스테이블 → 위험자산",
    body: (
      <>
        <p>· 스테이블 시총 감소 + 알트 강세 = 대기 자금이 실제 매수로 전환 중.</p>
        <p>· 알트 시즌 정점 가능성 — 추세는 유효하나 단기 변동성 ↑.</p>
        <p>· 익절 라인 점검 + 신규는 짧은 스윙 위주.</p>
      </>
    ),
  },
  rotation_alts_to_btc: {
    dot: "bg-amber-400",
    title: "알트 → BTC 회귀",
    body: (
      <>
        <p>· 알트 시총 ↓ + BTC 보합~상승 — 알트 시즌 종료 신호.</p>
        <p>· 알트 비중 축소, BTC 비중 ↑ 권장.</p>
        <p>· 다음 사이클까지 알트는 짧은 매매 위주.</p>
      </>
    ),
  },
  liquidity_tightening: {
    dot: "bg-amber-400",
    title: "유동성 위축",
    body: (
      <>
        <p>· 스테이블 발행 ↓ + 총 시총 보합 — 매수 탄약 부족.</p>
        <p>· 변동성 ↑ 위험. 신규 진입 사이즈 ↓.</p>
        <p>· 손절 좁히고 보수적 운영.</p>
      </>
    ),
  },
  deleveraging: {
    dot: "bg-grade-d",
    title: "디레버리징 · risk-off",
    body: (
      <>
        <p>· 총 시총 ↓ + 스테이블 시총 ↓ — 자금이 시장 밖으로 이탈.</p>
        <p>· 위험 회피 모드. 포지션 축소 검토.</p>
        <p>· 단기 바운스가 있어도 신뢰도 낮음 — 칼날 잡지 말 것.</p>
      </>
    ),
  },
  neutral: {
    dot: "bg-muted-foreground/50",
    title: "관망 · 큰 흐름 없음",
    body: (
      <>
        <p>· 모든 지표가 ±1~2% 이내 — 의미 있는 자금 이동 없음.</p>
        <p>· 시장 방향성은 다른 지표(심리·기술적)로 판단.</p>
        <p>· 스캘프/데이 트레이드 위주, 큰 베팅 회피.</p>
      </>
    ),
  },
};

export async function CapitalFlowCard() {
  const d = await fetchCapitalFlow();
  if (!d) {
    return (
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Capital Flow · 7d</h2>
        </div>
        <article className="rounded-2xl border border-border/60 bg-card/40 px-6 py-8 text-center text-sm text-muted-foreground">
          데이터를 가져오지 못했습니다.
        </article>
      </section>
    );
  }

  const r = REGIME_META[d.regime];

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Capital Flow · 7d</h2>
        <span className="text-xs text-muted-foreground">via CoinGecko</span>
      </div>

      <article className="flex h-full flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-5">
        {/* Verdict */}
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full animate-pulse", r.dot)} />
          <span className="text-base font-semibold">{r.title}</span>
        </div>

        {/* Action signals — BTC + Alt */}
        <div className="grid grid-cols-2 gap-2">
          <ActionChip asset="BTC" signal={d.btcAction} />
          <ActionChip asset="ALT" signal={d.altAction} />
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
          <p className="mt-1 text-xs text-muted-foreground">총 시총</p>
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
            label="Alt (기타)"
            mcap={d.altMcap}
            pct={d.alt7dPct}
            color="bg-muted-foreground/40"
          />
        </ul>

        {/* Dominance stacked bar */}
        <div>
          <p className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
            현재 도미넌스
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
              <span className="text-muted-foreground">방향 해석 ·</span>
              <span>{r.title}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
            {r.body}
          </div>
        </details>

        <p className="mt-auto pt-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
          via CoinGecko · Alt 시총은 BTC.D 기준 추정
        </p>
      </article>
    </section>
  );
}

const ACTION_META = {
  long: {
    label: "롱",
    Icon: ArrowUp,
    border: "border-grade-a/40",
    bg: "bg-grade-a/10",
    text: "text-grade-a",
    iconBg: "bg-grade-a/20",
  },
  short: {
    label: "숏",
    Icon: ArrowDown,
    border: "border-grade-d/40",
    bg: "bg-grade-d/10",
    text: "text-grade-d",
    iconBg: "bg-grade-d/20",
  },
  wait: {
    label: "관망",
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
}: {
  asset: string;
  signal: ActionSignal;
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
          <span className={cn("text-sm font-semibold", m.text)}>{m.label}</span>
          {signal.strength === "strong" ? (
            <span
              className={cn(
                "rounded px-1 text-[9px] font-bold uppercase tracking-wider",
                m.bg,
                m.text,
              )}
            >
              강
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
