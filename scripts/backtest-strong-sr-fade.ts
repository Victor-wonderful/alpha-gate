/**
 * 횡보장 "강한 지지/저항 페이드" 엣지 검증. LLM 0.
 *
 * 가설: 일반 횡보 페이드는 백테스트에서 전멸(손실)이지만, **강한 지지/저항**
 *       (스윙 고점·저점 클러스터 + 터치 횟수 많음)에서만 페이드하면 엣지가 있는가?
 *
 * 방법: 레짐=횡보(SMA50 평탄)일 때만, 현재가가 강한 지지(→롱)/저항(→숏) 근처면 진입.
 *       터치 강도(≥1/≥2/≥3)를 쓸어가며 "강할수록 엣지 개선" 여부 측정.
 *       스타일별 실제 밴드/RR + 워크포워드 게이트(기존 metrics.ts).
 *
 * 실행: pnpm exec tsx scripts/backtest-strong-sr-fade.ts
 */
import {
  type Trade, netRFromGross, winRate, expectancyR, profitFactor,
  maxDrawdown, dailyRCurve, evaluateGate, walkForwardGate,
} from "../src/lib/backtest/metrics";

type Candle = { openTime: number; open: number; high: number; low: number; close: number; volume: number };

const COINS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT",
  "ADAUSDT", "AVAXUSDT", "LINKUSDT", "TRXUSDT", "LTCUSDT", "DOTUSDT",
];

const STYLES = {
  scalp:    { mtf: "15m", bars: 12000, horizon: 48,  cooldown: 8,  rr: 1.3, stopMin: 0.3, stopMax: 1.2 },
  day:      { mtf: "1h",  bars: 20000, horizon: 24,  cooldown: 12, rr: 1.5, stopMin: 0.7, stopMax: 1.5 },
  swing:    { mtf: "4h",  bars: 12000, horizon: 60,  cooldown: 12, rr: 2,   stopMin: 2,   stopMax: 5 },
  position: { mtf: "4h",  bars: 12000, horizon: 120, cooldown: 24, rr: 3,   stopMin: 5,   stopMax: 15 },
} as const;
type Cfg = (typeof STYLES)[keyof typeof STYLES];

const ATR_LEN = 14, STOP_MULT = 1.5, WARMUP = 220;
const SR_LOOKBACK = 160;   // 지지/저항 탐색 창(봉)
const SR_TOL_PCT = 0.6;    // 스윙 클러스터 병합 허용(%)
const SWING_K = 3;         // 프랙탈 좌우 봉수
const TOUCH_LEVELS = [1, 2, 3]; // 강도(터치 횟수) 쓸기
const tfMin: Record<string, number> = { "15m": 15, "1h": 60, "4h": 240 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

async function klines(sym: string, interval: string, totalBars: number): Promise<Candle[]> {
  const out: Candle[] = [];
  let endTime = Date.now();
  while (out.length < totalBars) {
    const limit = Math.min(1500, totalBars - out.length);
    const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${interval}&limit=${limit}&endTime=${endTime}`);
    if (!res.ok) throw new Error(`${sym} ${res.status}`);
    const raw = (await res.json()) as number[][];
    if (!raw.length) break;
    const batch: Candle[] = raw.map((k) => ({ openTime: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
    out.unshift(...batch);
    endTime = batch[0].openTime - 1;
    await sleep(110);
  }
  return out.slice(-totalBars);
}

function atrPctSeries(c: Candle[], period = ATR_LEN): number[] {
  const tr: number[] = [0];
  for (let i = 1; i < c.length; i++) tr.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)));
  const out: number[] = new Array(c.length).fill(NaN);
  for (let i = period; i < c.length; i++) { let s = 0; for (let k = i - period + 1; k <= i; k++) s += tr[k]; out[i] = c[i].close > 0 ? ((s / period) / c[i].close) * 100 : NaN; }
  return out;
}
function smaSeries(c: Candle[], period: number): number[] {
  const out: number[] = new Array(c.length).fill(NaN); let s = 0;
  for (let i = 0; i < c.length; i++) { s += c[i].close; if (i >= period) s -= c[i - period].close; if (i >= period - 1) out[i] = s / period; }
  return out;
}

type Regime = "up" | "range" | "down";
function regimeAt(c: Candle[], sma50: number[], i: number): Regime {
  const t = sma50[i], tp = sma50[i - 10];
  if (!Number.isFinite(t) || !Number.isFinite(tp)) return "range";
  if (c[i].close > t && t > tp) return "up";
  if (c[i].close < t && t < tp) return "down";
  return "range";
}

/** i봉까지의 스윙 고점/저점을 클러스터링 → {price, touches}. */
function srLevels(c: Candle[], i: number): { highs: { price: number; touches: number }[]; lows: { price: number; touches: number }[] } {
  const highs: number[] = [], lows: number[] = [];
  const start = Math.max(SWING_K, i - SR_LOOKBACK);
  for (let j = start; j <= i - SWING_K; j++) {
    let isHigh = true, isLow = true;
    for (let m = 1; m <= SWING_K; m++) {
      if (c[j].high <= c[j - m].high || c[j].high <= c[j + m].high) isHigh = false;
      if (c[j].low >= c[j - m].low || c[j].low >= c[j + m].low) isLow = false;
    }
    if (isHigh) highs.push(c[j].high);
    if (isLow) lows.push(c[j].low);
  }
  const cluster = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const out: { sum: number; n: number }[] = [];
    for (const p of sorted) {
      const last = out[out.length - 1];
      const mean = last ? last.sum / last.n : 0;
      if (last && Math.abs(p - mean) / mean * 100 <= SR_TOL_PCT) { last.sum += p; last.n++; }
      else out.push({ sum: p, n: 1 });
    }
    return out.map((o) => ({ price: o.sum / o.n, touches: o.n }));
  };
  return { highs: cluster(highs), lows: cluster(lows) };
}

function makeTrade(c: Candle[], i: number, side: "long" | "short", atrPct: number, cfg: Cfg): Trade {
  const entry = c[i].close;
  const stopPct = clamp(STOP_MULT * atrPct, cfg.stopMin, cfg.stopMax);
  const stopDist = (stopPct / 100) * entry;
  const stop = side === "long" ? entry - stopDist : entry + stopDist;
  const target = side === "long" ? entry + cfg.rr * stopDist : entry - cfg.rr * stopDist;
  const end = Math.min(c.length - 1, i + cfg.horizon);
  let grossR = 0, bars = end - i;
  for (let j = i + 1; j <= end; j++) {
    if (side === "long") { if (c[j].low <= stop) { grossR = -1; bars = j - i; break; } if (c[j].high >= target) { grossR = cfg.rr; bars = j - i; break; } }
    else { if (c[j].high >= stop) { grossR = -1; bars = j - i; break; } if (c[j].low <= target) { grossR = cfg.rr; bars = j - i; break; } }
    if (j === end) { const move = side === "long" ? c[end].close - entry : entry - c[end].close; grossR = move / stopDist; }
  }
  const netR = netRFromGross(grossR, stopPct, bars);
  return { rMultiple: netR, retPct: (netR * stopPct) / 100, barsHeld: bars, entryTs: new Date(c[i].openTime).toISOString() };
}

function report(name: string, trades: Trade[]) {
  if (trades.length < 5) { console.log(`   ${name}: n=${trades.length} (표본부족)`); return; }
  const gate = evaluateGate(trades), wf = walkForwardGate(trades);
  const mdd = maxDrawdown(dailyRCurve(trades, 0.01));
  const pass = gate.passed && wf.passed ? "✅발행자격" : "❌";
  console.log(`   ${name}: n=${String(trades.length).padStart(4)} 승률=${((winRate(trades) ?? 0) * 100).toFixed(0)}% 기대값=${(expectancyR(trades) ?? 0) >= 0 ? "+" : ""}${(expectancyR(trades) ?? 0).toFixed(3)}R PF=${(profitFactor(trades) ?? 0).toFixed(2)} MDD=${((mdd ?? 0) * 100).toFixed(0)}% ${pass}`);
}

async function main() {
  for (const [styleName, cfg] of Object.entries(STYLES)) {
    // 터치 강도별 버킷 (횡보장 페이드만).
    const byTouch: Record<number, Trade[]> = { 1: [], 2: [], 3: [] };
    let days = 0, earliest = Infinity;
    for (const sym of COINS) {
      let c: Candle[];
      try { c = await klines(sym, cfg.mtf, cfg.bars); } catch { continue; }
      if (c.length) earliest = Math.min(earliest, c[0].openTime);
      days += (c.length * (tfMin[cfg.mtf] ?? 60)) / 1440;
      const atr = atrPctSeries(c), sma50 = smaSeries(c, 50);
      let last = -1e9;
      for (let i = WARMUP; i < c.length - 1; i++) {
        if (!Number.isFinite(atr[i]) || atr[i] <= 0 || i - last < cfg.cooldown) continue;
        if (regimeAt(c, sma50, i) !== "range") continue; // 횡보만
        const price = c[i].close;
        const near = Math.max(0.2, atr[i] * 0.6); // "근처" = 0.6×ATR
        const { highs, lows } = srLevels(c, i);
        // 강한 지지(현재가 근처, 아래쪽) → 롱 / 강한 저항(근처, 위쪽) → 숏
        const sup = lows.filter((l) => l.price <= price && (price - l.price) / price * 100 <= near).sort((a, b) => b.touches - a.touches)[0];
        const res = highs.filter((h) => h.price >= price && (h.price - price) / price * 100 <= near).sort((a, b) => b.touches - a.touches)[0];
        let side: "long" | "short" | null = null, touches = 0;
        if (sup && (!res || sup.touches >= res.touches)) { side = "long"; touches = sup.touches; }
        else if (res) { side = "short"; touches = res.touches; }
        if (!side) continue;
        const tr = makeTrade(c, i, side, atr[i], cfg); last = i;
        // 누적: 터치 t 이상 버킷 모두에 넣기 (≥1, ≥2, ≥3)
        for (const tl of TOUCH_LEVELS) if (touches >= tl) byTouch[tl].push(tr);
      }
    }
    const since = Number.isFinite(earliest) ? new Date(earliest).toISOString().slice(0, 10) : "?";
    console.log(`\n■ ${styleName.toUpperCase()} (${cfg.mtf}) — ${since}부터, 코인당 ${(days / COINS.length).toFixed(0)}일 · 횡보장 강한 S/R 페이드`);
    report("터치≥1 (약)   ", byTouch[1]);
    report("터치≥2 (중)   ", byTouch[2]);
    report("터치≥3 (강)   ", byTouch[3]);
  }
  console.log("\n발행자격 = 기본게이트(표본≥20·기대값≥0.05R·MDD≤40%) + 워크포워드(분할≥50%양수·최근≥0) 둘 다 통과.");
  console.log("가설 지지 조건: 터치 강도↑ 일수록 기대값·게이트 개선되면 '강한 S/R 페이드'는 엣지 있음.");
}
main().catch((e) => { console.error(e); process.exit(1); });
