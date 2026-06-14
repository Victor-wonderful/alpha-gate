import { ChevronDown } from "lucide-react";
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
function Insight({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group border-t border-border/40 pt-2">
      <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs font-medium text-foreground hover:text-primary [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">방향 해석 ·</span>
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

function fngInsight(v: number): { title: string; body: React.ReactNode } {
  if (v <= 25)
    return {
      title: "단기 바닥 후보",
      body: (
        <>
          <p>· 역사적으로 25 이하 구간은 단기 바닥과 자주 일치.</p>
          <p>· BTC/ETH 분할 매수 검토 구간 (전량 X). 알트는 추가 변동성 가능.</p>
          <p>· 추격 매도는 자제. 자금 관리 우선.</p>
        </>
      ),
    };
  if (v < 45)
    return {
      title: "추세 약화",
      body: (
        <>
          <p>· 심리 위축. 추세 모멘텀 약함.</p>
          <p>· 신규 진입은 셋업 명확할 때만, 사이즈 평소 70%.</p>
          <p>· 보유 포지션은 손절 좁히는 것 고려.</p>
        </>
      ),
    };
  if (v <= 55)
    return {
      title: "방향성 없음",
      body: (
        <>
          <p>· 심리 균형 — 큰 베팅 회피.</p>
          <p>· 기술적 신호(추세·구조) 우선, 심리는 보조.</p>
          <p>· 스캘프/데이트레이드에 유리.</p>
        </>
      ),
    };
  if (v < 75)
    return {
      title: "추격 자제",
      body: (
        <>
          <p>· 탐욕 우세 — 후발 매수는 손익비 나쁨.</p>
          <p>· 보유 포지션 일부 익절, 손절 끌어올리기.</p>
          <p>· 신규는 풀백 기다리는 게 안전.</p>
        </>
      ),
    };
  return {
    title: "조정 위험 ↑",
    body: (
      <>
        <p>· 극탐욕 — 단기 조정 위험 크게 ↑.</p>
        <p>· 익절·헷지 우선, 신규 매수 보류.</p>
        <p>· 75 이상은 보통 1~2주 내 -10~-20% 조정 빈도 ↑.</p>
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
  const fng = await fetchFng();
  const alert = fng.value >= 75 || fng.value <= 25;
  const angle = (fng.value / 100) * 180;
  const weekDelta = fng.value - fng.weekAgo;
  const ins = fngInsight(fng.value);
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
            {fngLabelKo(fng.label)} · 어제 {fng.change > 0 ? "+" : ""}
            {fng.change}
          </p>
        </div>
      </div>

      <FngScale value={fng.value} />

      <div>
        <p className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
          최근 7일
        </p>
        <FngSparkline history={fng.history} color={fngTone(fng.value)} />
        <div className="mt-0.5 flex items-baseline justify-between text-[11px] text-muted-foreground">
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

      <Insight title={ins.title}>{ins.body}</Insight>
    </Card>
  );
}

// ─── 2. BTC Dominance ────────────────────────────────────────────

function dominanceInsight(btc: number): { title: string; body: React.ReactNode } {
  if (btc >= 60)
    return {
      title: "BTC 우위장 · 알트 약세",
      body: (
        <>
          <p>· 자금이 알트 → BTC로 회귀. 알트는 개별 호재 없으면 약세 지속.</p>
          <p>· 포트폴리오에서 BTC 비중 ↑, 알트 비중 ↓ 권장.</p>
          <p>· 알트 매매는 짧은 스윙 위주, 추세 추종 X.</p>
        </>
      ),
    };
  if (btc >= 55)
    return {
      title: "BTC 우위 · 알트 선별",
      body: (
        <>
          <p>· BTC 추세가 주도. 알트는 시총 상위 메이저(ETH/SOL) 위주로만.</p>
          <p>· 도미넌스가 ↓ 전환되면 알트 시즌 신호.</p>
        </>
      ),
    };
  if (btc >= 50)
    return {
      title: "균형 · 섹터 로테이션",
      body: (
        <>
          <p>· 자금이 BTC ↔ 알트 사이 이동. 특정 섹터(L1/DeFi/AI) 강세 출현 가능.</p>
          <p>· 거래량 동반 강세 섹터 추종이 유리.</p>
        </>
      ),
    };
  return {
    title: "알트 우위 · 알트 시즌 가능",
    body: (
      <>
        <p>· 자금이 BTC → 알트로 이동 중. 알트 시즌 진입 신호.</p>
        <p>· 메이저 알트(ETH/SOL/AVAX) 추세 추종 우호.</p>
        <p>· BTC 비중 ↓, 알트 비중 ↑ 가능.</p>
      </>
    ),
  };
}

export async function DominanceCard() {
  const d = await fetchDominance();
  const ins = dominanceInsight(d.btc);
  return (
    <Card label="BTC Dominance" via="via CoinGecko">
      <div>
        <p className="font-mono text-[32px] font-bold leading-none tabular-nums">
          {d.btc.toFixed(1)}
          <span className="text-lg text-muted-foreground">%</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">전체 시총 중 BTC 비중</p>
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
            { k: "기타", v: d.others, c: "bg-muted-foreground/40" },
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

function altInsight(v: number): { title: string; body: React.ReactNode } {
  if (v >= 75)
    return {
      title: "알트 시즌 진행 중",
      body: (
        <>
          <p>· Top 50 알트 대다수가 BTC 초과. 자금 회전 빠름.</p>
          <p>· 메이저 알트(ETH/SOL/AVAX) 추세 추종 적극.</p>
          <p>· 단, 75+ 구간 장기화 시 끝물 신호 — 익절 라인 점검.</p>
        </>
      ),
    };
  if (v >= 50)
    return {
      title: "알트 우위",
      body: (
        <>
          <p>· 알트 절반 이상이 BTC 초과. 선별 진입 우호.</p>
          <p>· 시총 상위 + 거래량 동반 알트 위주.</p>
        </>
      ),
    };
  if (v >= 25)
    return {
      title: "중립 · 신중",
      body: (
        <>
          <p>· 특별한 방향성 없음. 섹터 로테이션 가능.</p>
          <p>· 알트는 짧은 스윙 위주, 큰 베팅 회피.</p>
        </>
      ),
    };
  return {
    title: "BTC 시즌",
    body: (
      <>
        <p>· 알트 대부분이 BTC 대비 약세. 알트 변동성 ↓.</p>
        <p>· BTC 비중 ↑ 권장. 알트는 매수 후 보유보단 짧은 매매.</p>
      </>
    ),
  };
}

export async function AltSeasonCard() {
  const r = await fetchAltSeasonIndex();
  const ins = altInsight(r.index);
  return (
    <Card label="Alt Season Index" via="via CoinGecko · 자체 산정 (90d, Top 50)">
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
          <span>BTC 시즌</span>
          <span>중립</span>
          <span>알트 시즌</span>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Top 50 중 BTC 초과:{" "}
        <span className="font-mono font-medium text-foreground">
          {r.outperformers}/{r.totalCompared}
        </span>
        {" · "}BTC 90일:{" "}
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

function kimchiInsight(v: number): { title: string; body: React.ReactNode } {
  if (v >= 4)
    return {
      title: "한국 과열 · 추격 X",
      body: (
        <>
          <p>· Upbit가 글로벌 대비 4% 이상 비쌈. 차익거래 매물 압력.</p>
          <p>· 한국 시장 추격 매수 위험. 단기 조정 가능.</p>
          <p>· 글로벌(Binance) 가격이 따라잡거나 한국이 빠지는 형태로 수렴.</p>
        </>
      ),
    };
  if (v >= 2)
    return {
      title: "FOMO 진입 단계",
      body: (
        <>
          <p>· 한국 매수세 강함. 변동성 ↑.</p>
          <p>· 신규 진입 시 분할, 사이즈 ↓.</p>
        </>
      ),
    };
  if (v <= -2)
    return {
      title: "역프 · 단기 바닥 후보",
      body: (
        <>
          <p>· 한국이 글로벌보다 싸짐. 한국 매도 쏠림 또는 USD 강세.</p>
          <p>· 글로벌 매수 우위 신호일 수 있음.</p>
          <p>· 단기 반등 후보 — 분할 매수 검토.</p>
        </>
      ),
    };
  return {
    title: "정상 · 글로벌 동조",
    body: (
      <>
        <p>· ±2% 이내 — 한국·글로벌 가격 차이가 합리적 범위.</p>
        <p>· 김프 신호 의미 없음. 다른 지표(기술적·뉴스) 우선.</p>
      </>
    ),
  };
}

export async function KimchiCard() {
  const rows = await fetchKimchiPremium();
  if (rows.length === 0) {
    return (
      <Card label="김치 프리미엄" via="via Upbit · Binance">
        <p className="text-xs text-muted-foreground">데이터 없음</p>
      </Card>
    );
  }
  const btc = rows.find((r) => r.symbol === "BTC") ?? rows[0];
  const alert = btc.premiumPct >= 4 || btc.premiumPct <= -2;
  const ins = kimchiInsight(btc.premiumPct);

  return (
    <Card
      label="김치 프리미엄"
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
              <th className="pb-1 text-right font-medium">김프</th>
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

function stablecapInsight(v: number): { title: string; body: React.ReactNode } {
  if (v >= 1)
    return {
      title: "매수 탄약 누적 · risk-on",
      body: (
        <>
          <p>· 스테이블 발행량 증가 = 시장 진입 자금 ↑.</p>
          <p>· 위험자산 매수 우호 환경. BTC/알트 매수 유리.</p>
          <p>· 단, 발행 → 실제 매수 전환에 시차 있음.</p>
        </>
      ),
    };
  if (v <= -1)
    return {
      title: "유동성 회수 · 변동성 ↑",
      body: (
        <>
          <p>· 스테이블 시총 감소 = 자금이 시장 밖으로.</p>
          <p>· 변동성 ↑, 하락 압력. 포지션 축소 검토.</p>
          <p>· 손절 좁히고 신규 진입 보수적.</p>
        </>
      ),
    };
  return {
    title: "안정 · 큰 자금 이동 없음",
    body: (
      <>
        <p>· ±1% 이내 — 자금 유출입 균형.</p>
        <p>· 시장 방향성은 다른 지표(심리·기술적)로 판단.</p>
      </>
    ),
  };
}

export async function StablecapCard() {
  const r = await fetchStablecoinMcap();
  const ins = stablecapInsight(r.total7dDeltaPct);
  return (
    <Card label="Stablecoin Mcap" via="via CoinGecko · 7d 시총 변화">
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
          7일: {fmtPct(r.total7dDeltaPct)}
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

function lsInsight(longPct: number): { title: string; body: React.ReactNode } {
  if (longPct >= 65)
    return {
      title: "롱 과열 · 청산 위험",
      body: (
        <>
          <p>· 65% 이상 롱 쏠림. 청산 캐스케이드 후보.</p>
          <p>· 신규 롱 자제. 숏 카운터 트레이드 후보.</p>
          <p>· 펀딩비도 같이 양수 高면 신호 강함.</p>
        </>
      ),
    };
  if (longPct >= 58)
    return {
      title: "롱 우위 · 추세 추종 우호",
      body: (
        <>
          <p>· 추세 추종에 유리한 환경.</p>
          <p>· 단, 펀딩비 + 도미넌스 같이 보고 판단.</p>
        </>
      ),
    };
  if (longPct <= 35)
    return {
      title: "숏 과열 · 스퀴즈 가능",
      body: (
        <>
          <p>· 숏 포지션 쏠림. 숏 스퀴즈 발생 가능.</p>
          <p>· 매수 우호 구간. 신규 숏 자제.</p>
          <p>· 갑작스러운 ↑ 변동에 주의.</p>
        </>
      ),
    };
  if (longPct <= 42)
    return {
      title: "숏 우위 · 바운스 후보",
      body: (
        <>
          <p>· 단기 약세 심리 우세.</p>
          <p>· 깊은 풀백 후 바운스 트레이드 후보.</p>
        </>
      ),
    };
  return {
    title: "균형 · 쏠림 없음",
    body: (
      <>
        <p>· 명확한 포지셔닝 쏠림 없음.</p>
        <p>· 기술적 신호와 펀딩비 우선 참고.</p>
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
  const r = await fetchLongShortRatio("BTCUSDT");
  if (!r.latest) {
    return (
      <Card label="Long/Short · BTC" via="via Binance">
        <p className="text-xs text-muted-foreground">데이터 없음</p>
      </Card>
    );
  }
  const longPct = r.latest.longPct * 100;
  const shortPct = r.latest.shortPct * 100;
  const ratio = r.latest.ratio;
  const alert = longPct >= 65 || shortPct >= 65;
  const ins = lsInsight(longPct);

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
        <p className="mt-1 text-xs text-muted-foreground">롱/숏 계좌 비율</p>
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
          24h · Long 비중
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
          24h:{" "}
          {Math.abs(r.deltaLongPct) < 0.05
            ? "변동 없음"
            : `${r.deltaLongPct >= 0 ? "+" : ""}${r.deltaLongPct.toFixed(1)}pp`}
        </p>
      </div>

      <Insight title={ins.title}>{ins.body}</Insight>
    </Card>
  );
}
