import { ChevronDown } from "lucide-react";
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

function fmtDelta(v: number, digits = 2) {
  if (v === 0) return "0%";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function tvlInsight(delta7d: number): { title: string; body: React.ReactNode } {
  if (delta7d >= 5)
    return {
      title: "강한 risk-on · 알트 우호",
      body: (
        <>
          <p>· DeFi로 자금 회귀 강함. 위험 자산 매수 우호 환경.</p>
          <p>· 메이저 알트(ETH/SOL/AVAX) 추세 추종 유리.</p>
          <p>· 특정 체인 TVL 급증 시 그 체인 토큰 강세 신호 (예: SOL 생태계).</p>
        </>
      ),
    };
  if (delta7d >= 1)
    return {
      title: "온화한 자금 유입",
      body: (
        <>
          <p>· 안정적 risk-on. 추세 추종 가능.</p>
          <p>· 알트 비중 일부 ↑ 가능, 사이즈는 평상.</p>
        </>
      ),
    };
  if (delta7d > -1)
    return {
      title: "보합 · 신호 없음",
      body: (
        <>
          <p>· 큰 자금 이동 없음. 다른 지표(심리·도미넌스) 우선.</p>
          <p>· 방향성 매매보다 레인지 매매 유리.</p>
        </>
      ),
    };
  if (delta7d > -5)
    return {
      title: "디레버리징 시작",
      body: (
        <>
          <p>· 자금 이탈 초입. 변동성 ↑ 가능.</p>
          <p>· 알트 사이즈 ↓, 신규는 보수적.</p>
          <p>· 손절 좁히고 추가 하락 대비.</p>
        </>
      ),
    };
  return {
    title: "강한 risk-off · 변동성 ↑",
    body: (
      <>
        <p>· 위험 자산 회피 모드. 디파이 자금 이탈 진행.</p>
        <p>· 보유 포지션 축소 검토. 신규 진입 보류.</p>
        <p>· 단기 바운스가 있어도 신뢰도 낮음.</p>
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
  const d = await fetchDefiTvl();
  const ins = tvlInsight(d.delta7dPct);

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">On-chain · DeFi TVL</h2>
        <span className="text-xs text-muted-foreground">via DeFiLlama</span>
      </div>

      <article className="flex h-full flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-5">
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
            최근 30일
          </p>
          <Sparkline data={d.series} />
        </div>

        {/* Top chains */}
        <div>
          <p className="mb-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
            체인별 TOP 5
          </p>
          <ul className="space-y-1.5">
            {d.topChains.length === 0 ? (
              <li className="text-xs text-muted-foreground">데이터 없음</li>
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
              <span className="text-muted-foreground">방향 해석 ·</span>
              <span>{ins.title}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
            {ins.body}
          </div>
        </details>

        <p className="mt-auto pt-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
          via DeFiLlama · 30일 추이 · 증가 = risk-on · 감소 = risk-off
        </p>
      </article>
    </section>
  );
}
