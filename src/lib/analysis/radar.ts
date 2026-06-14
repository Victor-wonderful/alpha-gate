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
  /** 예상 변동 범위 콘 (다음 horizon봉 80% 구간, %). 방향 예측 아님. */
  rangeLowPct: number;
  rangeHighPct: number;
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
const STYLE_ORDER: TradingStyle[] = ["scalp", "day", "swing", "position"];

const SCAN_BARS = 200;
const UNIVERSE_SIZE = 30;
const MAX_CANDIDATES = 14;
const MIN_SCORE = 2;

const BLOCKLIST = new Set(["BTCDOMUSDT", "DEFIUSDT", "BLUEBIRDUSDT"]);

// 항상 후보 레이더에 고정 표시하는 기준 자산 (점수 컷오프 무관, 표시 순서도 이 순).
export const PINNED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "XRPUSDT", "BNBUSDT"];
const PINNED = new Set(PINNED_SYMBOLS);

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

  // 고정 자산(BTC/ETH/XRP/BNB)은 신호 점수가 낮아도 항상 후보에 포함 (사용자 요청).
  const isPinned = PINNED.has(meta.symbol);
  if (!best || (!isPinned && (best.score < MIN_SCORE || best.signals.length === 0))) return null;

  const refCandles = byTf["4h"] ?? byTf[STYLE_TF[best.style]];
  const price = refCandles[refCandles.length - 1].close || meta.lastPrice;
  const bestCandles = byTf[STYLE_TF[best.style]] ?? refCandles;
  const trend = classifyTrend(bestCandles);
  // A) 추세 지속력 (ADX/KER/Choppiness 종합).
  const trendStrength =
    bestCandles.length >= 30 ? classifyTrendComposite(bestCandles).composite.strength : "weak";
  // B) 예상 변동 범위 콘 (드리프트 0 — 방향 예측 아님).
  const cone = simulateRange(
    bestCandles.map((c) => c.close),
    STYLE_HORIZON[best.style],
    2000,
  );

  return {
    symbol: meta.symbol,
    score: best.score,
    signals: best.signals,
    bestStyle: best.style,
    styleFit,
    styleAtr,
    trend,
    trendStrength,
    rangeLowPct: cone.insufficient ? 0 : cone.lowPct,
    rangeHighPct: cone.insufficient ? 0 : cone.highPct,
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

/** 전체 스캔 — 거래대금 상위 30개를 스타일별 구조신호로 점수화. */
export async function runRadarScan(): Promise<RadarCandidate[]> {
  const [universe, funding] = await Promise.all([
    fetchTopSymbolsByVolume(UNIVERSE_SIZE),
    fetchAllFunding().catch(() => ({}) as Record<string, number>),
  ]);

  // 코인당 4 TF fetch → 동시성 12코인으로 제한 (속도 ↑, rate limit 안전).
  const results = await mapChunked(universe, 12, (meta) =>
    scanCoin(meta, funding[meta.symbol] ?? 0),
  );

  const candidates: RadarCandidate[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) candidates.push(r.value);
  }

  const sorted = candidates.sort(
    (a, b) => b.score - a.score || b.volume24hUsd - a.volume24hUsd,
  );
  const top = sorted.slice(0, MAX_CANDIDATES);
  // 고정 자산(BTC/ETH/XRP/BNB)이 점수 컷오프에 밀려 잘렸으면 다시 추가 (항상 후보에 포함).
  for (const sym of PINNED_SYMBOLS) {
    if (!top.some((c) => c.symbol === sym)) {
      const c = sorted.find((x) => x.symbol === sym);
      if (c) top.push(c);
    }
  }
  return top;
}
