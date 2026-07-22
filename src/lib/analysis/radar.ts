import "server-only";
import {
  fetchAllTickers24h,
  fetchAllFunding,
  fetchCryptoPerpSymbols,
  fetchKlines,
  type Candle,
  type Interval,
} from "./binance";
import { findSwings, detectLiquiditySweeps, classifyTrend } from "./smc";
import { classifyTrendComposite } from "./trend";
import { computeVolumeProfile } from "./volume-profile";
import { simulateRange } from "./monte-carlo";
import { RADAR_UNIVERSE, PINNED_SYMBOLS } from "./radar-constants";
import { STYLE_STANDARDS, MIN_STOP_PCT_VS_FEES } from "./standards";
import type { TradingStyle } from "./style";

/**
 * 후보 레이더 — "지금 볼 만한 코인" 스캔 엔진 (v1, 코드 구조신호만, LLM 없음).
 *
 * 철학: "사라"가 아니라 "여기를 분석해봐라". 방향은 단정하지 않고,
 * 지금 트레이드할 구조가 잡히는지(셋업 임박 조건)만 점수화한다.
 *
 * 스타일별 기준 TF로 각각 점수화해서, 셋업이 가장 뚜렷한 스타일을 골라준다.
 */

export interface RadarSignal {
  key: string;
  label: string;
}

export type StyleFit = Record<TradingStyle, number>;

export interface RadarCandidate {
  symbol: string;
  score: number;
  /** 예상 매매 등급(A/B/C/D) — scan-radar 크론이 봇과 동일 경로로 계산. 점수와 별개. */
  grade?: string | null;
  signals: RadarSignal[];
  /** 셋업이 가장 뚜렷한 트레이딩 스타일. */
  bestStyle: TradingStyle;
  /** 스타일별 신호 점수 (스캘핑/데이/스윙/포지션). */
  styleFit: StyleFit;
  /** 스타일별 ATR%(기준 TF, 가격 대비). 진입 가능 판정·손절/목표 추정용. */
  styleAtr: StyleFit;
  /** best 스타일 TF 기준 현재 추세. */
  trend: "up" | "down" | "range";
  /** 추세 지속력 (ADX/KER/Choppiness 종합). 방향 아님 — "이 추세가 이어질 힘". */
  trendStrength: "strong" | "moderate" | "weak";
  /** 추세 기반 권장 방향 — 백테스트 검증(강한 추세+방향이 엣지). 약추세/횡보면 null. */
  suggestedDirection: "long" | "short" | null;
  /** 예상 변동 범위 콘 (다음 horizon봉 80% 구간, %). 방향 예측 아님. */
  rangeLowPct: number;
  rangeHighPct: number;
  /** 진입 자리 근접도 — 현재가↔최근접 매물대 레벨(POC/VAH/VAL) 거리를 ATR 배수로.
   *  스캔 시 랭킹용(가까울수록 손절 기준이 명확한 자리). 방향 신호 아님. DB 미영속. */
  levelDistAtr?: number | null;
  price: number;
  change24hPct: number;
  fundingRate: number;
  volume24hUsd: number;
}

// 각 스타일의 셋업 기준 TF (style.ts 의 MTF에 해당).
const STYLE_TF: Record<TradingStyle, Interval> = {
  scalp: "15m",
  day: "1h",
  swing: "4h",
  position: "1d",
};

// 펀딩비는 단기 플레이에만 유효 (8시간마다 리셋 → 스윙/포지션엔 무의미).
const STYLE_FUNDING: Record<TradingStyle, boolean> = {
  scalp: true,
  day: true,
  swing: false,
  position: false,
};

// 스타일별 예상 범위 콘 horizon (기준 TF 봉 수). 해석 가능한 짧은 창으로.
const STYLE_HORIZON: Record<TradingStyle, number> = {
  scalp: 8, // 15m × 8 ≈ 2h
  day: 12, // 1h × 12 ≈ 12h
  swing: 20, // 4h × 20 ≈ 3d
  position: 14, // 1d × 14 ≈ 2주
};

// 가격 구조는 시간축에 중첩되어 긴 TF일수록 신호를 쉽게 먹는다.
// 짧고 실행 가능한 셋업을 우선하도록 긴 TF에 핸디캡을 준다.
// (짧은 TF에 구조가 없으면 핸디캡을 줘도 긴 TF가 정당하게 선택됨)
const STYLE_HANDICAP: Record<TradingStyle, number> = {
  scalp: 0,
  day: 1,
  swing: 2,
  position: 3,
};

// 핸디캡 동점 시 더 짧은(실행 가능한) 스타일 우선.
// position 제외 (2026-07-13): UI에서 숨김(전패 검증)이라 스캔 best-style 후보에서도 제외 —
// 보이지 않는 스타일 기준으로 게이트되는 후보가 생기지 않게. 복원 시 배열에 다시 추가.
const STYLE_ORDER: TradingStyle[] = ["scalp", "day", "swing"];

const SCAN_BARS = 200;
const UNIVERSE_SIZE = 30;

const BLOCKLIST = new Set(["BTCDOMUSDT", "DEFIUSDT", "BLUEBIRDUSDT"]);

// 유니버스 상수는 radar-constants.ts(클라이언트 공용)로 이관 — DCA 자산 게이트가
// 같은 목록을 써야 해서 server-only 인 이 파일에 둘 수 없다.

/** 최종 후보 수 — BTC(항상 고정) + 게이트·랭킹 통과 4개. */
const RADAR_TOP = 5;

// ⚠ 값은 radar-panel.tsx의 STYLE_ATR_CAP/styleFloor와 동일하게 유지할 것
// (패널은 클라이언트 번들이라 server-only인 이 파일에서 import 불가 → 중복 정의).
const RADAR_ATR_CAP: Record<TradingStyle, number> = {
  scalp: 2.5,
  day: 4,
  swing: 10,
  position: 25,
};
function radarStyleFloor(style: TradingStyle): number {
  return Math.max(MIN_STOP_PCT_VS_FEES, STYLE_STANDARDS[style].stopPct.min * 0.8);
}

/** 거래대금 상위 N개 USDT 무기한 (크립토만). */
export async function fetchTopSymbolsByVolume(n = UNIVERSE_SIZE): Promise<
  Array<{
    symbol: string;
    lastPrice: number;
    priceChangePercent: number;
    highPrice: number;
    lowPrice: number;
    quoteVolume: number;
  }>
> {
  const [all, cryptoSymbols] = await Promise.all([
    fetchAllTickers24h(),
    fetchCryptoPerpSymbols(),
  ]);
  const allowed = new Set(cryptoSymbols);
  const eligible = all.filter(
    (t) =>
      allowed.has(t.symbol) &&
      !BLOCKLIST.has(t.symbol) &&
      t.lastPrice > 0 &&
      Number.isFinite(t.quoteVolume),
  );
  const top = eligible.sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, n);
  // 고정 자산이 상위 n에서 밀렸어도 유니버스에 반드시 포함 (항상 스캔·표시).
  for (const sym of PINNED_SYMBOLS) {
    if (!top.some((t) => t.symbol === sym)) {
      const m = eligible.find((t) => t.symbol === sym);
      if (m) top.push(m);
    }
  }
  return top;
}

// --- 신호 계산 헬퍼 ---

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** ATR%(가격 대비) — 마지막 period봉 평균 True Range / 현재가. */
function atrPct(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    sum += Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  }
  const atr = sum / period;
  const last = candles[candles.length - 1].close;
  return last > 0 ? (atr / last) * 100 : 0;
}

/** True Range 기반 ATR%(가격 대비)의 (현재 / 최근 중앙값) 비율. <1 = 변동성 수축. */
function compressionRatio(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 30) return null;
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    tr.push(
      Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)),
    );
  }
  const atrPct: number[] = [];
  for (let i = period - 1; i < tr.length; i++) {
    const slice = tr.slice(i - period + 1, i + 1);
    const atr = slice.reduce((a, b) => a + b, 0) / period;
    const close = candles[i + 1].close;
    if (close > 0) atrPct.push(atr / close);
  }
  if (atrPct.length < 20) return null;
  const last = atrPct[atrPct.length - 1];
  const med = median(atrPct.slice(-50));
  if (!med) return null;
  return last / med;
}

/** 오늘 UTC 0시 시가 대비 변동률 — 앱의 홈 "오늘 시장"과 동일 기준. */
function dayChangePct(candles: Candle[], price: number): number | null {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let dayOpen: number | null = null;
  for (const c of candles) {
    if (c.openTime >= midnight) {
      dayOpen = c.open;
      break;
    }
  }
  if (dayOpen === null || dayOpen <= 0) return null;
  return ((price - dayOpen) / dayOpen) * 100;
}

const FUNDING_PCT = (r: number) => (r * 100).toFixed(3);

/** 한 TF(=한 스타일)의 구조신호 점수. */
function scoreForTf(
  candles: Candle[],
  meta: { lastPrice: number; highPrice: number; lowPrice: number },
  opts: { includeFunding: boolean; fundingRate: number },
): { score: number; signals: RadarSignal[] } {
  const signals: RadarSignal[] = [];
  let score = 0;
  if (candles.length < 60) return { score, signals };
  const price = candles[candles.length - 1].close;

  // 1) 유동성 sweep 직후 (TF 기준).
  const swings = findSwings(candles, 3);
  const sweeps = detectLiquiditySweeps(candles, swings, { maxAgeBars: 5 });
  const fresh = sweeps.find((s) => s.ageBars <= 5);
  if (fresh) {
    score += 3;
    signals.push({
      key: "sweep",
      label: fresh.side === "bullish" ? "하단 유동성 sweep 직후" : "상단 유동성 sweep 직후",
    });
  }

  // 2) 펀딩 극단 (단기 스타일만).
  if (opts.includeFunding) {
    const absF = Math.abs(opts.fundingRate);
    if (absF >= 0.0004) {
      score += absF >= 0.0008 ? 3 : 2;
      signals.push({
        key: "funding",
        label:
          opts.fundingRate > 0
            ? `펀딩 과열 (+${FUNDING_PCT(opts.fundingRate)}%)`
            : `펀딩 역프 (${FUNDING_PCT(opts.fundingRate)}%)`,
      });
    }
  }

  // 3) 변동성 수축 — 돌파 임박.
  const cr = compressionRatio(candles);
  if (cr !== null && cr < 0.65) {
    score += 2;
    signals.push({ key: "compression", label: "변동성 수축 (돌파 임박)" });
  }

  // 4) 매물대 끝단 도달.
  const vp = computeVolumeProfile(candles.slice(-120), 40, 0.7);
  if (vp.vah > 0 && vp.val > 0) {
    if (Math.abs(price - vp.vah) / price <= 0.006) {
      score += 2;
      signals.push({ key: "vah", label: "매물대 상단(VAH) 도달" });
    } else if (Math.abs(price - vp.val) / price <= 0.006) {
      score += 2;
      signals.push({ key: "val", label: "매물대 하단(VAL) 도달" });
    }
  }

  // 5) 거래량 급증.
  const vols = candles.slice(-31, -1).map((c) => c.volume);
  const medVol = median(vols);
  const lastVol = candles[candles.length - 1].volume;
  if (medVol > 0 && lastVol >= medVol * 2) {
    score += lastVol >= medVol * 3 ? 2 : 1;
    signals.push({ key: "volume", label: "거래량 급증" });
  }

  // 6) 24h 극단 부근.
  if (meta.highPrice > 0 && Math.abs(meta.lastPrice - meta.highPrice) / meta.highPrice <= 0.01) {
    score += 1;
    signals.push({ key: "high24h", label: "24h 고가 부근" });
  } else if (meta.lowPrice > 0 && Math.abs(meta.lastPrice - meta.lowPrice) / meta.lowPrice <= 0.01) {
    score += 1;
    signals.push({ key: "low24h", label: "24h 저가 부근" });
  }

  return { score, signals };
}

const UNIQUE_TFS = Array.from(new Set(Object.values(STYLE_TF)));

/** 한 코인을 4개 스타일 TF로 스캔 → 최적 스타일 + 스타일별 점수. */
async function scanCoin(
  meta: {
    symbol: string;
    lastPrice: number;
    priceChangePercent: number;
    highPrice: number;
    lowPrice: number;
    quoteVolume: number;
  },
  fundingRate: number,
): Promise<RadarCandidate | null> {
  const klineArr = await Promise.all(
    UNIQUE_TFS.map((tf) => fetchKlines(meta.symbol, tf, SCAN_BARS)),
  );
  const byTf: Record<string, Candle[]> = {};
  UNIQUE_TFS.forEach((tf, i) => (byTf[tf] = klineArr[i]));

  const styleFit = {} as StyleFit;
  const styleAtr = {} as StyleFit;
  let best: { style: TradingStyle; score: number; signals: RadarSignal[]; adj: number } | null =
    null;

  for (const style of STYLE_ORDER) {
    const candles = byTf[STYLE_TF[style]] ?? [];
    const { score, signals } = scoreForTf(candles, meta, {
      includeFunding: STYLE_FUNDING[style],
      fundingRate,
    });
    styleFit[style] = score;
    styleAtr[style] = atrPct(candles);
    // 핸디캡 적용한 점수로 스타일 선택 (긴 TF 편향 제거). STYLE_ORDER가 짧은 순이라 동점 시 짧은 쪽 우선.
    const adj = score - STYLE_HANDICAP[style];
    if (!best || adj > best.adj) best = { style, score, signals, adj };
  }

  if (!best) return null;

  const refCandles = byTf["4h"] ?? byTf[STYLE_TF[best.style]];
  const price = refCandles[refCandles.length - 1].close || meta.lastPrice;
  const bestCandles = byTf[STYLE_TF[best.style]] ?? refCandles;
  const trend = classifyTrend(bestCandles);
  // 추세 지속력 (ADX/KER/Choppiness 종합).
  const trendStrength =
    bestCandles.length >= 30 ? classifyTrendComposite(bestCandles).composite.strength : "weak";

  // 강한 추세는 신호 칩으로 명시 (추세 강도 자체는 runRadarScan 랭킹에서 반영 — 검증된 엣지).
  const clearTrend = trend === "up" || trend === "down";
  const signals =
    clearTrend && trendStrength === "strong"
      ? [{ key: "trend", label: trend === "up" ? "강한 상승 추세" : "강한 하락 추세" }, ...best.signals]
      : best.signals;
  const score = best.score;
  const suggestedDirection: "long" | "short" | null =
    clearTrend && trendStrength !== "weak" ? (trend === "up" ? "long" : "short") : null;

  // 진입 자리 근접도 — 현재가↔최근접 VP 레벨(POC/VAH/VAL) 거리(%) ÷ ATR(%).
  // "강한 추세라도 레벨에서 멀면(한복판) 들어갈 자리가 없다" 랭킹의 1순위 재료.
  const bestAtr = styleAtr[best.style] ?? 0;
  let levelDistAtr: number | null = null;
  if (bestAtr > 0 && price > 0) {
    const vp = computeVolumeProfile(bestCandles.slice(-120), 40, 0.7);
    const levels = [vp.poc, vp.vah, vp.val].filter((l) => Number.isFinite(l) && l > 0);
    if (levels.length) {
      const distPct = Math.min(...levels.map((l) => (Math.abs(price - l) / price) * 100));
      levelDistAtr = distPct / bestAtr;
    }
  }

  // 예상 변동 범위 콘 (드리프트 0 — 방향 예측 아님).
  const cone = simulateRange(bestCandles.map((c) => c.close), STYLE_HORIZON[best.style], 2000);

  return {
    symbol: meta.symbol,
    score,
    signals,
    bestStyle: best.style,
    styleFit,
    styleAtr,
    trend,
    trendStrength,
    suggestedDirection,
    rangeLowPct: cone.insufficient ? 0 : cone.lowPct,
    rangeHighPct: cone.insufficient ? 0 : cone.highPct,
    levelDistAtr,
    price,
    change24hPct: dayChangePct(refCandles, price) ?? meta.priceChangePercent,
    fundingRate,
    volume24hUsd: meta.quoteVolume,
  };
}

/** 배치 동시성 제한 러너. */
async function mapChunked<T, R>(
  items: T[],
  size: number,
  fn: (t: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    out.push(...(await Promise.allSettled(batch.map(fn))));
  }
  return out;
}

/** 하드 게이트 — 통과 못하면 후보 제외 (BTC는 기준 자산이라 면제).
 *  ① 변동성 밴드: ATR이 손절 하한(수수료 이김) 이상 & 스타일 상한(이상 급변) 이하.
 *  ② R:R 도달 가능성: 최소 R:R 목표폭이 예상 변동 콘 안에 있어야 함(못 닿는 목표 = 진입 가치 없음). */
function passesGates(c: RadarCandidate): boolean {
  const atr = c.styleAtr[c.bestStyle] ?? 0;
  const floor = radarStyleFloor(c.bestStyle);
  if (!(atr >= floor * 1.1 && atr <= RADAR_ATR_CAP[c.bestStyle])) return false;
  const stopPct = Math.max(floor, atr);
  const targetPct = stopPct * STYLE_STANDARDS[c.bestStyle].rr.min;
  const maxMove = Math.max(Math.abs(c.rangeLowPct), Math.abs(c.rangeHighPct));
  if (maxMove > 0 && maxMove < targetPct) return false;
  return true;
}

/** 랭킹 점수 (사전식 가중 — 상위 기준이 하위를 항상 지배).
 *  ① 진입 자리 근접 (레벨 ≤1.2 ATR=200 / ≤2.5=100 / 그 외 0) — 자리 없으면 강추세도 후순위
 *  ② 추세 강도 (강=20 / 중=10) — 백테스트 검증된 유일한 방향 엣지
 *  ③ BTC 레짐 정렬 (+5) — BTC와 같은 방향 우선(역행 시 등급 -2와 일관)
 *  ④ 구조 신호 점수 (0~4 클램프) — 동점 타이브레이크 전용 */
function rankScore(c: RadarCandidate, btcTrend: "up" | "down" | null): number {
  const d = c.levelDistAtr;
  const prox = d != null && d <= 1.2 ? 2 : d != null && d <= 2.5 ? 1 : 0;
  const clear = c.trend === "up" || c.trend === "down";
  const trendPts = clear ? (c.trendStrength === "strong" ? 2 : c.trendStrength === "moderate" ? 1 : 0) : 0;
  const align = btcTrend && c.trend === btcTrend ? 1 : 0;
  return prox * 100 + trendPts * 10 + align * 5 + Math.min(c.score, 4);
}

/** 전체 스캔 — RADAR_UNIVERSE(대장주 5개)를 게이트·랭킹으로 (BTC 고정 + 나머지 4).
 *  DCA(15개)와 분리된 트레이딩 전용 유니버스. cf. radar-constants.ts RADAR_UNIVERSE.
 *  score 컬럼에 랭킹 점수를 저장 — DB 로드(score desc)가 곧 선별 순서. */
export async function runRadarScan(): Promise<RadarCandidate[]> {
  const [tickers, funding] = await Promise.all([
    fetchAllTickers24h(),
    fetchAllFunding().catch(() => ({}) as Record<string, number>),
  ]);
  const bySymbol = new Map(tickers.map((t) => [t.symbol, t]));
  const universe = RADAR_UNIVERSE.flatMap((s) => {
    const m = bySymbol.get(s);
    return m && m.lastPrice > 0 ? [m] : [];
  });

  // 코인당 4 TF fetch → 동시성 12코인으로 제한 (속도 ↑, rate limit 안전).
  const results = await mapChunked(universe, 12, (meta) =>
    scanCoin(meta, funding[meta.symbol] ?? 0),
  );

  const candidates: RadarCandidate[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) candidates.push(r.value);
  }

  const btcCand = candidates.find((c) => c.symbol === "BTCUSDT") ?? null;
  const btcTrend =
    btcCand && (btcCand.trend === "up" || btcCand.trend === "down") && btcCand.trendStrength !== "weak"
      ? btcCand.trend
      : null;

  // BTC 제외 나머지 4칸 — 게이트 통과 + 랭킹 점수 > 0 만 (억지 후보 없음: 4개 미만이면 그대로 적게).
  const ranked = candidates
    .filter((c) => c.symbol !== "BTCUSDT" && passesGates(c))
    .map((c) => ({ ...c, score: rankScore(c, btcTrend) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || b.volume24hUsd - a.volume24hUsd)
    .slice(0, RADAR_TOP - 1);

  // BTC는 항상 포함 + 최상단 (+1000 오프셋으로 score 정렬에서도 맨 앞 보존).
  return btcCand ? [{ ...btcCand, score: 1000 + rankScore(btcCand, btcTrend) }, ...ranked] : ranked;
}
