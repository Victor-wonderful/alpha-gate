"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useT } from "@/lib/i18n/context";
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
import { PINNED_SYMBOLS } from "@/lib/analysis/radar-constants";
import type { RadarSnapshot } from "@/lib/analysis/radar-persist";
import { STYLE_PRESETS, type TradingStyle } from "@/lib/analysis/style";
import { STYLE_STANDARDS, MIN_STOP_PCT_VS_FEES } from "@/lib/analysis/standards";
import { AnalysisTimingHint } from "./analysis-timing-hint";
import { refreshRadarAction, getLiveQuotesAction } from "@/app/app/analyze/_radar-actions";

const LIVE_INTERVAL_MS = 25_000;
const COLLAPSED_COUNT = 5;

function relativeTime(iso: string | null, t: ReturnType<typeof useT>): string {
  if (!iso) return "—";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return t("analyze.cmpC.timeJustNow");
  if (min < 60) return t("analyze.cmpC.timeMinAgo", { n: min });
  return t("analyze.cmpC.timeHourAgo", { n: Math.round(min / 60) });
}

function fmtPrice(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return p.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** 스캔 시점 가격·변동률에서 오늘 UTC 시가를 역산 (라이브 변동률 재계산용). */
function deriveDayOpen(price: number, changePct: number): number | null {
  const open = price / (1 + changePct / 100);
  return Number.isFinite(open) && open > 0 ? open : null;
}

const STYLE_LABEL_KEY: Record<TradingStyle, string> = {
  scalp: "analyze.cmpC.style.scalp",
  day: "analyze.cmpC.style.day",
  swing: "analyze.cmpC.style.swing",
  position: "analyze.cmpC.style.position",
};
const STYLE_DUR_KEY: Record<TradingStyle, string> = {
  scalp: "analyze.cmpC.styleDur.scalp",
  day: "analyze.cmpC.styleDur.day",
  swing: "analyze.cmpC.styleDur.swing",
  position: "analyze.cmpC.styleDur.position",
};
// 스타일별 색상 (빠름→느림: 앰버/스카이/바이올렛/에메랄드).
const STYLE_RING: Record<TradingStyle, string> = {
  scalp: "border-amber-500 bg-amber-500/15 text-amber-700",
  day: "border-sky-500 bg-sky-500/15 text-sky-700",
  swing: "border-violet-500 bg-violet-500/15 text-violet-700",
  position: "border-emerald-500 bg-emerald-500/15 text-emerald-700",
};
// position 숨김 (2026-07-13): 무기한 선물 × 수개월 보유는 구조 부적합(펀딩 출혈) +
// scenario_outcomes 결정 13건 전패. 장기 투자는 현물 DCA 모드로 이관 예정(docs/DCA-모드-설계.md).
// 코드·타입·데이터는 보존 — 배열에 다시 넣으면 복원.
const STYLE_ORDER: TradingStyle[] = ["scalp", "day", "swing"];

// 신호 종류별 색상 — "왜 볼 만한지"를 색으로 빠르게 구분.
// 라이트 배경용 진한 텍스트(-700). 옅은 -300/-200은 다크 테마 잔재라 흰 카드에서 안 보였음.
const SIGNAL_COLOR: Record<string, string> = {
  sweep: "bg-sky-500/15 text-sky-700",
  funding: "bg-amber-500/15 text-amber-700",
  compression: "bg-violet-500/15 text-violet-700",
  vah: "bg-rose-500/15 text-rose-700",
  val: "bg-emerald-500/15 text-emerald-700",
  volume: "bg-orange-500/15 text-orange-700",
  high24h: "bg-foreground/10 text-foreground/70",
  low24h: "bg-foreground/10 text-foreground/70",
};

/** 선택한 스타일의 손절 하한 (수수료 하한 vs 스타일 표준 하한×0.8 중 큰 값). */
function styleFloor(style: TradingStyle): number {
  return Math.max(MIN_STOP_PCT_VS_FEES, STYLE_STANDARDS[style].stopPct.min * 0.8);
}

// ATR 상한 — 이보다 변동성이 크면 저유동성/급등 이상치로 보고 진입 가능에서 제외.
// (5분봉 ATR 7%, 1분봉 20% 같은 micro-cap 펌핑 코인은 정상 셋업이 안 나옴.)
// ⚠ radar.ts의 RADAR_ATR_CAP/radarStyleFloor와 값 동일 유지 (서버 스캔 게이트와 같은 기준).
const STYLE_ATR_CAP: Record<TradingStyle, number> = {
  scalp: 2.5,
  day: 4,
  swing: 10,
  position: 25,
};

// 레이더 신호 라벨 i18n — 저장된(한국어) label에서 변형(sweep 방향·펀딩 값)을 추출해
// 코드 기반으로 번역한다. 신규 영문 DB 재적재 없이 기존 데이터에도 즉시 적용됨.
function signalText(
  s: { key: string; label: string },
  t: (k: string, v?: Record<string, string | number>) => string,
): string {
  switch (s.key) {
    case "sweep":
      return t(s.label.includes("하단") ? "radar.signal.sweep_lower" : "radar.signal.sweep_upper");
    case "funding": {
      const m = s.label.match(/\(([^)]+)\)/);
      const val = m ? m[1] : "";
      return t(s.label.includes("과열") ? "radar.signal.funding_over" : "radar.signal.funding_reverse", { val });
    }
    case "compression":
    case "vah":
    case "val":
    case "volume":
    case "high24h":
    case "low24h":
      return t(`radar.signal.${s.key}`);
    default:
      return s.label;
  }
}

interface Preview {
  atr: number;
  hasAtr: boolean;
  tradeable: boolean;
  dir: "long" | "short";
  /** 예상 진입 방향 (추정). neutral = 방향 불명확(양방향 가능). */
  bias: "long" | "short" | "neutral";
  stopPct: number;
  targetPct: number;
  entry: number;
  stop: number;
  target: number;
  score: number;
}

/** 선택 스타일 기준 셋업 미리보기 — LLM 없이 ATR·추세에서 결정론적으로 추정.
 *  실제 정밀 레벨은 클릭 후 본 분석(AI)에서 산출. */
function preview(c: RadarCandidate, style: TradingStyle, price: number): Preview {
  const atr = c.styleAtr?.[style] ?? 0;
  const floor = styleFloor(style);
  const hasAtr = atr > 0;
  // 고정 자산(BTC)은 기준 자산 — 항상 진입 가능 (분석도 항상 시나리오 생성).
  const isPinned = PINNED_SYMBOLS.includes(c.symbol);
  // 진입 가능 = ATR이 손절 하한 이상(LLM이 두는 구조 손절 ~0.8~1×ATR이 floor를 넘김 = 수수료/노이즈 이김)
  // 이고, ATR이 상한 이하(저유동성 이상치 제외). ×1.1로 약간의 여유.
  const tradeable = isPinned || (hasAtr && atr >= floor * 1.1 && atr <= STYLE_ATR_CAP[style]);
  const stopPct = Math.max(floor, atr); // 구조 손절 추정 ≈ 1×ATR (BTC는 하한)
  const targetPct = stopPct * STYLE_STANDARDS[style].rr.min;
  const bias = inferBias(c);
  // 손절/목표 기하학은 long/short만 가능 — 방향 불명확이면 추세 기준(상승·횡보=롱)으로 폴백.
  const dir: "long" | "short" = bias === "short" ? "short" : "long";
  const stop = dir === "long" ? price * (1 - stopPct / 100) : price * (1 + stopPct / 100);
  const target = dir === "long" ? price * (1 + targetPct / 100) : price * (1 - targetPct / 100);
  return {
    atr,
    hasAtr,
    tradeable,
    dir,
    bias,
    stopPct,
    targetPct,
    entry: price,
    stop,
    target,
    score: c.styleFit?.[style] ?? 0,
  };
}

/** 예상 진입 방향 = 추세 방향. (LLM 없이 결정론적, 추정.)
 *
 *  ⚠️ 근거: 실거래 분석 291건(strategy_direction)으로 검증 — 추세가 방향성을 가질 때
 *  실제 Strategy Agent 방향과 98.4% 일치. sweep/펀딩/매물대/24h극단 등 다른 신호는
 *  방향 예측에 무작위~역효과(sweep 49.6%, 펀딩 42%, 매물대 32% — 모두 기준선 77.7% 이하)라
 *  방향 판정에서 전부 제외. range(횡보)는 신뢰할 방향 신호가 없으므로 정직하게 "양방향".
 *  검증 하니스: scripts/validate-radar-bias.mjs, scripts/validate-radar-rules.mjs.
 *  실제 방향은 클릭 후 본 분석(Strategy Agent)이 확정. */
function inferBias(c: RadarCandidate): "long" | "short" | "neutral" {
  if (c.trend === "up") return "long";
  if (c.trend === "down") return "short";
  return "neutral";
}

/** 분석 시 나올 시나리오 개수 추정 (LLM 없이 추세·신호로 — 프롬프트 개수 가이드와 동일 논리).
 *  추세장: 눌림목 + (스윕→유동성사냥) + (돌파 임박). 횡보장: 양 끝 fade + (돌파). */
function estScenarios(c: RadarCandidate): number {
  const sig = new Set(c.signals.map((s) => s.key));
  let n: number;
  if (c.trend === "range") {
    n = 2; // 박스 양 끝 fade
    if (sig.has("compression")) n += 1; // 돌파 임박
  } else {
    n = 1; // 추세 눌림목
    if (sig.has("sweep")) n += 1; // 유동성 사냥
    if (sig.has("compression") || sig.has("vah") || sig.has("val")) n += 1; // 돌파
    if (c.trendStrength === "strong") n += 1;
  }
  return Math.min(4, Math.max(1, n));
}

/** 강한/중간 추세 강도 태그 — 방향이 있는(up/down) 후보에만. 강도가 검증된 엣지라 강조. */
/** 스타일 표준 스펙 미니 항목 (멀티 TF · 손절폭 · 목표폭 · 최소 R:R). */
function SpecItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[11px] text-muted-foreground/80">{label}</span>
      <span className="font-mono text-xs font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function StrengthTag({ strength }: { strength: "strong" | "moderate" | "weak" }) {
  const t = useT();
  if (strength === "strong")
    return (
      <span
        title={t("analyze.cmpC.strengthStrongTitle")}
        className="rounded-sm bg-grade-a/15 px-1 text-[9px] font-bold leading-tight text-grade-a"
      >
        {t("analyze.cmpC.strengthStrong")}
      </span>
    );
  if (strength === "moderate")
    return (
      <span
        title={t("analyze.cmpC.strengthModerateTitle")}
        className="rounded-sm bg-foreground/10 px-1 text-[9px] font-semibold leading-tight text-muted-foreground"
      >
        {t("analyze.cmpC.strengthModerate")}
      </span>
    );
  return null;
}

function TrendMark({
  trend,
  strength,
}: {
  trend: "up" | "down" | "range";
  strength?: "strong" | "moderate" | "weak";
}) {
  const t = useT();
  const showStrength = (trend === "up" || trend === "down") && strength ? (
    <StrengthTag strength={strength} />
  ) : null;
  if (trend === "up")
    return (
      <span title={t("analyze.cmpC.trendUp")} className="flex items-center gap-0.5 text-grade-a">
        <TrendingUp className="h-3.5 w-3.5" />
        {showStrength}
      </span>
    );
  if (trend === "down")
    return (
      <span title={t("analyze.cmpC.trendDown")} className="flex items-center gap-0.5 text-grade-d">
        <TrendingDown className="h-3.5 w-3.5" />
        {showStrength}
      </span>
    );
  return (
    <span title={t("analyze.cmpC.trendRange")} className="flex items-center text-muted-foreground/50">
      <Minus className="h-3.5 w-3.5" />
    </span>
  );
}

export function RadarPanel({
  initial,
  style,
  onStyleChange,
  onPick,
}: {
  initial: RadarSnapshot;
  style: TradingStyle;
  onStyleChange: (style: TradingStyle) => void;
  onPick: (symbol: string, style: TradingStyle) => void;
}) {
  const t = useT();
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
    });
  }

  const { candidates, scannedAt } = snapshot;
  const hasLive = Object.keys(live).length > 0;

  // 스타일별 ATR 데이터가 아직 없는(구 스캔) 경우 — 새로고침 안내.
  const hasAtrData = candidates.some(
    (c) => c.styleAtr && Object.keys(c.styleAtr).length > 0,
  );

  // 선택 스타일로 진입 가능한 코인만. BTC(기준 자산) 맨 앞 →
  // 스캔 랭킹(c.score = 진입자리 근접→추세강도→BTC정렬) → 스타일 신호 점수 순.
  const rows = candidates
    .map((c) => {
      const price = live[c.symbol] ?? c.price;
      return { c, price, p: preview(c, style, price) };
    })
    .filter((r) => r.p.tradeable)
    .sort((a, b) => {
      const ap = PINNED_SYMBOLS.indexOf(a.c.symbol);
      const bp = PINNED_SYMBOLS.indexOf(b.c.symbol);
      const aPin = ap === -1 ? Number.MAX_SAFE_INTEGER : ap;
      const bPin = bp === -1 ? Number.MAX_SAFE_INTEGER : bp;
      if (aPin !== bPin) return aPin - bPin;
      return b.c.score - a.c.score || b.p.score - a.p.score;
    });

  const hidden = Math.max(0, rows.length - COLLAPSED_COUNT);
  const visible = expanded ? rows : rows.slice(0, COLLAPSED_COUNT);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-0 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radar className="h-[18px] w-[18px] text-primary" />
            {t("analyze.cmpC.radarTitle")}
          </CardTitle>
          <div className="flex shrink-0 items-center gap-2.5 text-xs text-muted-foreground tabular-nums">
            {hasLive ? (
              <span className="flex items-center gap-1 text-[11px] text-grade-a">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-grade-a" />
                {t("analyze.cmpC.live")}
              </span>
            ) : null}
            <span className="text-muted-foreground/70">{t("analyze.cmpC.signalTime", { time: relativeTime(scannedAt, t) })}</span>
            <button
              type="button"
              onClick={refresh}
              disabled={pending}
              aria-label={t("analyze.cmpC.refresh")}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={"h-3.5 w-3.5 " + (pending ? "animate-spin" : "")} />
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-xs leading-tight text-muted-foreground">
          {t("analyze.cmpC.descPrefix")} <span className="text-foreground/70">{t("analyze.cmpC.descTradeable")}</span>{t("analyze.cmpC.descSuffix")} ·{" "}
          <span className="text-foreground/50">{t("analyze.cmpC.descNote")}</span>
        </p>

        {/* 스타일 탭 — 선택 시 분석 스타일도 함께 바뀜 */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {STYLE_ORDER.map((s) => {
            const active = style === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onStyleChange(s)}
                title={t(STYLE_DUR_KEY[s])}
                className={
                  "rounded-lg border px-3.5 py-1.5 text-sm transition-colors " +
                  (active
                    ? STYLE_RING[s] + " font-bold"
                    : "border-border bg-card font-medium text-muted-foreground hover:text-foreground")
                }
              >
                {t(STYLE_LABEL_KEY[s])}
                {s === "swing" ? (
                  <span className="ml-1 rounded bg-primary/15 px-1 py-0.5 align-middle text-[9px] font-medium text-primary">
                    {t("analyze.client.recommended")}
                  </span>
                ) : null}
              </button>
            );
          })}
          <span className="ml-auto text-[11px] font-medium text-grade-a">
            {t("analyze.cmpC.tradeableCount", { style: t(STYLE_LABEL_KEY[style]), n: rows.length })}
          </span>
        </div>

        {/* 선택 스타일 컨텍스트 — 분석 타이밍 적합도 + 표준 스펙 (구 '트레이딩 스타일' 카드 통합) */}
        <div className="mt-3 space-y-2">
          <AnalysisTimingHint style={style} />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md bg-muted/30 px-3 py-2">
            <SpecItem
              label={t("analyze.client.std.multiTf")}
              value={`${STYLE_PRESETS[style].htf}/${STYLE_PRESETS[style].mtf}/${STYLE_PRESETS[style].ltf}`.toUpperCase()}
            />
            <SpecItem
              label={t("analyze.client.std.stop")}
              value={`${STYLE_STANDARDS[style].stopPct.min}~${STYLE_STANDARDS[style].stopPct.max}%`}
            />
            <SpecItem
              label={t("analyze.client.std.target")}
              value={`${STYLE_STANDARDS[style].targetPct.min}~${STYLE_STANDARDS[style].targetPct.max}%`}
            />
            <SpecItem
              label={t("analyze.client.std.minRr")}
              value={`${STYLE_STANDARDS[style].rr.min}+`}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-2 pb-2">
        {!hasAtrData ? (
          <div className="mx-1 mb-1 flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm leading-relaxed text-muted-foreground xl:min-h-[352px]">
            {scannedAt
              ? t("analyze.cmpC.emptyStale")
              : t("analyze.cmpC.emptyReady")}
          </div>
        ) : rows.length === 0 ? (
          <div className="mx-1 mb-1 flex flex-col items-center justify-center whitespace-pre-line rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm leading-relaxed text-muted-foreground xl:min-h-[352px]">
            {t("analyze.cmpC.emptyNoRows", { style: t(STYLE_LABEL_KEY[style]) })}
          </div>
        ) : (
          <>
            {/* 컬럼 제목 */}
            <div className="flex items-center gap-3 border-b border-border/50 px-2 pb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:gap-4">
              <span className="w-5 text-center">#</span>
              <span className="w-[76px]">{t("analyze.cmpC.colCoin")}</span>
              <span className="w-[88px] text-right">{t("analyze.cmpC.colPriceChange")}</span>
              <span className="hidden min-w-0 flex-1 sm:block">{t("analyze.cmpC.colSignal")}</span>
              <span className="w-[78px] text-center">{t("analyze.cmpC.colDirScenario")}</span>
              <span className="hidden w-[120px] md:block">{t("analyze.cmpC.colStopTarget")}</span>
              <span className="hidden w-[56px] items-center justify-end gap-1 sm:flex">{t("analyze.cmpC.colRange")}</span>
              <span className="w-9 text-center">{t("analyze.cmpC.colScore")}</span>
              <span className="w-[60px] text-center">{t("analyze.cmpC.colAnalyze")}</span>
            </div>
            {/* xl:min-h — 후보가 5개 미만이어도 카드 높이 고정(우측 컬럼과 하단 정렬 유지) */}
            <ul className="divide-y divide-border/50 xl:min-h-[352px]">
              {visible.map((r, i) => (
                <CandidateRow
                  key={r.c.symbol + i}
                  c={r.c}
                  price={r.price}
                  p={r.p}
                  rank={i + 1}
                  style={style}
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
                    {t("analyze.cmpC.collapse")}
                    <ChevronUp className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    {t("analyze.cmpC.showMore", { n: hidden })}
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
  price,
  p,
  rank,
  style,
  onPick,
}: {
  c: RadarCandidate;
  price: number;
  p: Preview;
  rank: number;
  style: TradingStyle;
  onPick: (symbol: string, style: TradingStyle) => void;
}) {
  const t = useT();
  const base = c.symbol.replace("USDT", "");

  const dayOpen = deriveDayOpen(c.price, c.change24hPct);
  const changePct = dayOpen ? ((price - dayOpen) / dayOpen) * 100 : c.change24hPct;
  const up = changePct >= 0;
  const rangeHalf = (c.rangeHighPct - c.rangeLowPct) / 2;

  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(c.symbol, style)}
        className="group flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-accent/50 sm:gap-4"
      >
        {/* 순위 */}
        <span className="w-5 shrink-0 text-center font-mono text-xs font-bold tabular-nums text-primary">
          {rank}
        </span>

        {/* 심볼 + 추세 + 강도 */}
        <span className="flex w-[92px] shrink-0 items-center gap-1">
          <TrendMark trend={c.trend} strength={c.trendStrength} />
          <span className="truncate font-mono text-sm font-semibold text-foreground">{base}</span>
        </span>

        {/* 가격 · 변동 */}
        <span className="flex w-[88px] shrink-0 flex-col items-end leading-tight">
          <span className="font-mono text-[13px] tabular-nums text-foreground">{fmtPrice(price)}</span>
          <span className={"font-mono text-[11px] tabular-nums " + (up ? "text-grade-a" : "text-grade-d")}>
            {up ? "+" : ""}
            {changePct.toFixed(2)}%
          </span>
        </span>

        {/* 신호 */}
        <span className="hidden min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:flex">
          {c.signals.slice(0, 2).map((s) => (
            <span
              key={s.key}
              className={
                "whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium leading-relaxed " +
                (SIGNAL_COLOR[s.key] ?? "bg-foreground/10 text-foreground/70")
              }
            >
              {signalText(s, t)}
            </span>
          ))}
          {c.signals.length > 2 ? (
            <span className="text-[11px] text-muted-foreground">+{c.signals.length - 2}</span>
          ) : null}
        </span>

        {/* 예상 진입 방향 (추정) + 예상 시나리오 개수 */}
        <span className="flex w-[78px] shrink-0 flex-col items-center gap-0.5">
          {p.bias === "long" ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-grade-a/40 bg-grade-a/10 px-1.5 py-0.5 text-[10px] font-semibold text-grade-a">
              <TrendingUp className="h-3 w-3" />
              {t("analyze.cmpC.biasLong")}
            </span>
          ) : p.bias === "short" ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-grade-d/40 bg-grade-d/10 px-1.5 py-0.5 text-[10px] font-semibold text-grade-d">
              <TrendingDown className="h-3 w-3" />
              {t("analyze.cmpC.biasShort")}
            </span>
          ) : (
            <span
              title={t("analyze.cmpC.biasNeutralTitle")}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border bg-foreground/5 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
            >
              <Minus className="h-3 w-3" />
              {t("analyze.cmpC.biasNeutral")}
            </span>
          )}
          <span className="text-[9px] text-muted-foreground">{t("analyze.cmpC.scenarioCount", { n: estScenarios(c) })}</span>
        </span>

        {/* 예상 손절폭 · 목표폭 (추정 — 분석 시 정밀화) */}
        <span className="hidden w-[120px] shrink-0 flex-col gap-0.5 leading-tight md:flex">
          <span className="flex items-center gap-1.5">
            <span className="w-7 shrink-0 text-[9px] font-medium text-muted-foreground/70">{t("analyze.cmpC.stopLabel")}</span>
            <span className="font-mono text-[11px] font-semibold tabular-nums text-grade-d">
              ±{p.stopPct.toFixed(1)}%
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-7 shrink-0 text-[9px] font-medium text-muted-foreground/70">{t("analyze.cmpC.targetLabel")}</span>
            <span className="font-mono text-[11px] font-semibold tabular-nums text-grade-a">
              ~{p.targetPct.toFixed(1)}%
            </span>
            <span className="text-[9px] text-muted-foreground">R:R {STYLE_STANDARDS[style].rr.min}</span>
          </span>
        </span>

        {/* 예상폭 */}
        <span
          title={t("analyze.cmpC.rangeTitle")}
          className="hidden w-[56px] shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground sm:block"
        >
          {rangeHalf > 0 ? (rangeHalf >= 50 ? "±50%↑" : `±${rangeHalf.toFixed(1)}%`) : "—"}
        </span>

        {/* 점수 (선택 스타일 신호 점수) */}
        <span className="w-9 shrink-0 text-center font-mono text-base font-bold tabular-nums text-primary">
          {p.score}
        </span>

        {/* 분석 액션 */}
        <span className="inline-flex w-[60px] shrink-0 items-center justify-center gap-0.5 whitespace-nowrap rounded-md border border-border px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors group-hover:border-primary/50 group-hover:bg-primary/10 group-hover:text-primary">
          {t("analyze.cmpC.analyzeAction")}
          <ChevronRight className="h-3 w-3 shrink-0" />
        </span>
      </button>
    </li>
  );
}
