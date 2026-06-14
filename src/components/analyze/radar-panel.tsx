"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  Radar,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RadarCandidate } from "@/lib/analysis/radar";
import type { RadarSnapshot } from "@/lib/analysis/radar-persist";
import type { TradingStyle } from "@/lib/analysis/style";
import { refreshRadarAction, getLiveQuotesAction } from "@/app/app/analyze/_radar-actions";

const LIVE_INTERVAL_MS = 25_000;
const COLLAPSED_COUNT = 5;

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  return `${Math.round(min / 60)}시간 전`;
}

function fmtPrice(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return p.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function fmtVol(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

/** 스캔 시점 가격·변동률에서 오늘 UTC 시가를 역산 (라이브 변동률 재계산용). */
function deriveDayOpen(price: number, changePct: number): number | null {
  const open = price / (1 + changePct / 100);
  return Number.isFinite(open) && open > 0 ? open : null;
}

const STYLE_LABEL: Record<TradingStyle, string> = {
  scalp: "스캘핑",
  day: "데이",
  swing: "스윙",
  position: "포지션",
};

// 스타일별 색상 (빠름→느림: 앰버/스카이/바이올렛/에메랄드).
const STYLE_BADGE: Record<TradingStyle, string> = {
  scalp: "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30",
  day: "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/30",
  swing: "bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-500/30",
  position: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
};

// 신호 종류별 색상 — "왜 볼 만한지"를 색으로 빠르게 구분.
const SIGNAL_COLOR: Record<string, string> = {
  sweep: "bg-sky-500/10 text-sky-300",
  funding: "bg-amber-500/10 text-amber-300",
  compression: "bg-violet-500/10 text-violet-300",
  vah: "bg-rose-500/10 text-rose-300",
  val: "bg-emerald-500/10 text-emerald-300",
  volume: "bg-orange-500/10 text-orange-300",
  high24h: "bg-foreground/10 text-foreground/70",
  low24h: "bg-foreground/10 text-foreground/70",
};

/** 셋업이 가장 뚜렷한(핸디캡 적용) 스타일 라벨 — 저장된 best_style 기준으로 통일. */
function bestStyleLabel(c: RadarCandidate): string {
  return STYLE_LABEL[c.bestStyle] ?? "스윙";
}

const STRENGTH_SHORT: Record<"strong" | "moderate" | "weak", string> = {
  strong: "강",
  moderate: "중",
  weak: "약",
};
const STRENGTH_FULL: Record<"strong" | "moderate" | "weak", string> = {
  strong: "강함",
  moderate: "보통",
  weak: "약함",
};
// 추세 지속력 칩 색상 — 강할수록 또렷하게.
const STRENGTH_BADGE: Record<"strong" | "moderate" | "weak", string> = {
  strong: "bg-amber-500/25 text-amber-200",
  moderate: "bg-foreground/15 text-foreground/90",
  weak: "bg-foreground/10 text-muted-foreground",
};

/** 예상 변동폭 — 80% 콘의 반폭(±%). 너무 큰 값은 상한 표기. */
function rangeText(c: RadarCandidate): string {
  if (!c.rangeLowPct && !c.rangeHighPct) return "—";
  const half = (c.rangeHighPct - c.rangeLowPct) / 2;
  if (half >= 50) return "±50%↑";
  return `±${half.toFixed(1)}%`;
}

function TrendMark({ trend }: { trend: "up" | "down" | "range" }) {
  if (trend === "up")
    return (
      <span title="상승 추세" className="flex items-center text-grade-a">
        <TrendingUp className="h-3.5 w-3.5" />
      </span>
    );
  if (trend === "down")
    return (
      <span title="하락 추세" className="flex items-center text-grade-d">
        <TrendingDown className="h-3.5 w-3.5" />
      </span>
    );
  return (
    <span title="박스권 (방향 없음)" className="flex items-center text-muted-foreground/50">
      <Minus className="h-3.5 w-3.5" />
    </span>
  );
}

export function RadarPanel({
  initial,
  onPick,
}: {
  initial: RadarSnapshot;
  onPick: (symbol: string, style: TradingStyle) => void;
}) {
  const [snapshot, setSnapshot] = useState<RadarSnapshot>(initial);
  const [live, setLive] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const symbolsKey = snapshot.candidates.map((c) => c.symbol).join(",");

  // 라이브 시세 폴링 — 가격·변동률만 갱신 (신호는 스캔 기준 유지).
  const poll = useCallback(async (symbols: string[]) => {
    if (!symbols.length) return;
    const q = await getLiveQuotesAction(symbols);
    if (Object.keys(q).length) setLive(q);
  }, []);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    const symbols = symbolsKey ? symbolsKey.split(",") : [];
    poll(symbols);
    const id = setInterval(() => {
      if (mountedRef.current) poll(symbols);
    }, LIVE_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [symbolsKey, poll]);

  function refresh() {
    startTransition(async () => {
      const r = await refreshRadarAction();
      if (r.error) toast.error(r.error);
      setSnapshot({ candidates: r.candidates, scannedAt: r.scannedAt });
      setLive({});
      setExpanded(false);
      if (!r.error)
        toast.success(
          r.candidates.length > 0
            ? `${r.candidates.length}개 후보 발견`
            : "지금은 뚜렷한 셋업이 없습니다",
        );
    });
  }

  const { candidates, scannedAt } = snapshot;
  const hasLive = Object.keys(live).length > 0;
  const hidden = Math.max(0, candidates.length - COLLAPSED_COUNT);
  const visible = expanded ? candidates : candidates.slice(0, COLLAPSED_COUNT);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-0 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radar className="h-[18px] w-[18px] text-primary" />
            후보 레이더 — 지금 볼 만한 코인
          </CardTitle>
          <div className="flex shrink-0 items-center gap-2.5 text-xs text-muted-foreground tabular-nums">
            {hasLive ? (
              <span className="flex items-center gap-1 text-[11px] text-grade-a">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-grade-a" />
                실시간
              </span>
            ) : null}
            {candidates.length > 0 ? (
              <span className="text-muted-foreground/70">
                {candidates.length}개 · 신호 {relativeTime(scannedAt)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={refresh}
              disabled={pending}
              aria-label="새로고침"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={"h-3.5 w-3.5 " + (pending ? "animate-spin" : "")} />
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-xs leading-tight text-muted-foreground">
          거래대금 상위 30개 중 셋업 조건이 잡힌 코인 ·{" "}
          <span className="text-foreground/60">매수 추천이 아닌 “분석 후보”</span>
        </p>
      </CardHeader>

      <CardContent className="px-2 pb-2">
        {candidates.length === 0 ? (
          <div className="mx-1 mb-1 whitespace-pre-line rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm leading-relaxed text-muted-foreground">
            {scannedAt
              ? "지금은 뚜렷한 셋업이 잡힌 코인이 없습니다.\n무리하지 말고 직접 코인을 선택해 분석하세요."
              : "레이더 준비 중 — [새로고침]을 눌러 바로 스캔할 수 있습니다."}
          </div>
        ) : (
          <>
            {/* 컬럼 제목 */}
            <div className="flex items-center gap-3 border-b border-border/50 px-2 pb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:gap-4">
              <span className="w-5 text-center">#</span>
              <span className="w-[76px]">코인</span>
              <span className="hidden w-[58px] sm:block">추세·힘</span>
              <span className="hidden w-[72px] sm:block">스타일</span>
              <span className="w-24 text-right">가격</span>
              <span className="w-[68px] text-right">변동</span>
              <span className="min-w-0 flex-1">신호 · 왜 볼 만한지</span>
              <span className="hidden w-[64px] text-right md:block">예상폭</span>
              <span className="hidden w-12 text-right md:block">점수</span>
              <span className="hidden w-20 text-right lg:block">거래대금</span>
              <span className="w-[60px] text-center">분석</span>
            </div>
            <ul className="divide-y divide-border/50">
              {visible.map((c, i) => (
                <CandidateRow
                  key={c.symbol + i}
                  c={c}
                  rank={i + 1}
                  livePrice={live[c.symbol]}
                  onPick={onPick}
                />
              ))}
            </ul>
            {hidden > 0 ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md border border-border/60 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              >
                {expanded ? (
                  <>
                    접기
                    <ChevronUp className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    더 보기 (+{hidden})
                    <ChevronDown className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CandidateRow({
  c,
  rank,
  livePrice,
  onPick,
}: {
  c: RadarCandidate;
  rank: number;
  livePrice?: number;
  onPick: (symbol: string, style: TradingStyle) => void;
}) {
  const base = c.symbol.replace("USDT", "");
  const strong = c.score >= 6;
  const styleLabel = bestStyleLabel(c);

  // 라이브 가격이 있으면 변동률을 오늘 시가 대비로 재계산.
  const price = livePrice ?? c.price;
  const dayOpen = deriveDayOpen(c.price, c.change24hPct);
  const changePct =
    livePrice && dayOpen ? ((livePrice - dayOpen) / dayOpen) * 100 : c.change24hPct;
  const up = changePct >= 0;

  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(c.symbol, c.bestStyle)}
        className="group flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-accent/50 sm:gap-4"
      >
        {/* 순위 */}
        <span
          className={
            "w-5 shrink-0 text-center font-mono text-xs tabular-nums " +
            (strong ? "font-bold text-primary" : "text-muted-foreground")
          }
        >
          {rank}
        </span>

        {/* 심볼 */}
        <span className="w-[76px] shrink-0 truncate font-mono text-sm font-semibold text-foreground">
          {base}
        </span>

        {/* 추세 + 지속력 */}
        <span className="hidden w-[58px] shrink-0 items-center gap-1 sm:flex">
          <TrendMark trend={c.trend} />
          {c.trend !== "range" ? (
            <span
              title={`추세 지속력: ${STRENGTH_FULL[c.trendStrength]} (방향 아님 — 이 추세가 이어질 힘)`}
              className={
                "rounded px-1 py-0.5 text-[10px] font-bold leading-none " +
                STRENGTH_BADGE[c.trendStrength]
              }
            >
              {STRENGTH_SHORT[c.trendStrength]}
            </span>
          ) : null}
        </span>

        {/* 적합 스타일 */}
        <span
          title={`${styleLabel} 셋업이 가장 뚜렷합니다`}
          className="hidden w-[72px] shrink-0 sm:inline-flex"
        >
          <span
            className={
              "truncate rounded-md px-2 py-0.5 text-[11px] font-semibold " +
              STYLE_BADGE[c.bestStyle]
            }
          >
            {styleLabel}
          </span>
        </span>

        {/* 가격 */}
        <span className="w-24 shrink-0 text-right font-mono text-sm tabular-nums text-foreground">
          {fmtPrice(price)}
        </span>

        {/* 변동률 */}
        <span
          className={
            "w-[68px] shrink-0 text-right font-mono text-sm tabular-nums " +
            (up ? "text-grade-a" : "text-grade-d")
          }
        >
          {up ? "+" : ""}
          {changePct.toFixed(2)}%
        </span>

        {/* 신호 (왜 볼 만한지) */}
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {c.signals.slice(0, 3).map((s) => (
            <span
              key={s.key}
              className={
                "whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium leading-relaxed " +
                (SIGNAL_COLOR[s.key] ?? "bg-foreground/10 text-foreground/70")
              }
            >
              {s.label}
            </span>
          ))}
          {c.signals.length > 3 ? (
            <span className="text-[11px] text-muted-foreground">+{c.signals.length - 3}</span>
          ) : null}
        </span>

        {/* 예상 변동폭 (몬테카를로 80% 콘) */}
        <span
          title={
            c.rangeLowPct || c.rangeHighPct
              ? `다음 구간 80% 예상 변동폭: ${c.rangeLowPct.toFixed(1)}% ~ +${c.rangeHighPct.toFixed(1)}% (방향 예측 아님)`
              : "데이터 부족"
          }
          className="hidden w-[64px] shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground md:block"
        >
          {rangeText(c)}
        </span>

        {/* 신호 점수 */}
        <span className="hidden w-12 shrink-0 text-right text-[11px] text-muted-foreground md:block">
          점수 <span className="font-mono tabular-nums text-foreground/80">{c.score}</span>
        </span>

        {/* 거래대금 (24h) */}
        <span className="hidden w-20 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground lg:block">
          {fmtVol(c.volume24hUsd)}
        </span>

        {/* 분석 액션 */}
        <span className="inline-flex w-[60px] shrink-0 items-center justify-center gap-0.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors group-hover:border-primary/50 group-hover:bg-primary/10 group-hover:text-primary">
          분석
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </button>
    </li>
  );
}
