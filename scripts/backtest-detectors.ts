/**
 * LLM-free 백테스트 — 코드 detector(vol_squeeze / sigma / confluence)의 실제 엣지 측정.
 *
 * 실제 detectors.ts · metrics.ts 를 그대로 import(로직 중복 없음).
 * ★ 스타일별로 실제 사용하는 MTF 봉 + 실제 스타일 밴드/RR/보유기간으로 측정.
 *   (스캘프 15m / 데이 1h / 스윙 4h / 포지션 4h — style.ts STYLE_PRESETS.mtf 기준)
 *
 * 실행: pnpm exec tsx scripts/backtest-detectors.ts
 */
import { detectVolSqueeze, detectSigma, computeConfluence, type DirectionalVote } from "../src/lib/analysis/detectors";
import {
  type Trade, netRFromGross, winRate, expectancyR, profitFactor,
  maxDrawdown, dailyRCurve, evaluateGate, walkForwardGate,
} from "../src/lib/backtest/metrics";

type Candle = { openTime: number; open: number; high: number; low: number; close: number; volume: number; closeTime: number; buyVolume: number };

const COINS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT",
  "ADAUSDT", "AVAXUSDT", "LINKUSDT", "TRXUSDT", "LTCUSDT", "DOTUSDT",
];

// 스타일별 실제 설정 — mtf(style.ts) + 밴드/RR(standards.ts·synthesize STOP_RANGES) + 보유기간.
// bars 확장(2022 대약세장 포함): 4h 12000봉≈5.5년, 1h 20000봉≈2.3년, 15m 12000봉≈4개월.
const STYLES = {
  scalp:    { mtf: "15m", bars: 12000, horizon: 48,  cooldown: 8,  rr: 1.3, stopMin: 0.3, stopMax: 1.2 }, // ~12h
  day:      { mtf: "1h",  bars: 20000, horizon: 24,  cooldown: 12, rr: 1.5, stopMin: 0.7, stopMax: 1.5 }, // ~1d
  swing:    { mtf: "4h",  bars: 12000, horizon: 60,  cooldown: 12, rr: 2,   stopMin: 2,   stopMax: 5 },   // ~10d
  position: { mtf: "4h",  bars: 12000, horizon: 120, cooldown: 24, rr: 3,   stopMin: 5,   stopMax: 15 },  // ~20d
} as const;

const ATR_LEN = 14;
const STOP_MULT = 1.5; // 손절 = clamp(1.5×ATR%, 밴드)
const WARMUP = 220;

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
    const batch: Candle[] = raw.map((k) => ({ openTime: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], closeTime: +k[6], buyVolume: +k[9] }));
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
  for (let i = period; i < c.length; i++) {
    let s = 0; for (let k = i - period + 1; k <= i; k++) s += tr[k];
    out[i] = c[i].close > 0 ? ((s / period) / c[i].close) * 100 : NaN; // %
  }
  return out;
}

function smaSeries(c: Candle[], period: number): number[] {
  const out: number[] = new Array(c.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < c.length; i++) { s += c[i].close; if (i >= period) s -= c[i - period].close; if (i >= period - 1) out[i] = s / period; }
  return out;
}

type Cfg = (typeof STYLES)[keyof typeof STYLES];
type Regime = "up" | "range" | "down";

/** SMA50 위치+기울기로 레짐 분류. */
function regimeAt(c: Candle[], sma50: number[], i: number): Regime {
  const t = sma50[i], tp = sma50[i - 10];
  if (!Number.isFinite(t) || !Number.isFinite(tp)) return "range";
  if (c[i].close > t && t > tp) return "up";
  if (c[i].close < t && t < tp) return "down";
  return "range";
}

const tfMin: Record<string, number> = { "15m": 15, "1h": 60, "4h": 240 };

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
  console.log(`   ${name}: n=${trades.length} 승률=${((winRate(trades) ?? 0) * 100).toFixed(0)}% 기대값=${(expectancyR(trades) ?? 0).toFixed(3)}R PF=${(profitFactor(trades) ?? 0).toFixed(2)} MDD=${((mdd ?? 0) * 100).toFixed(0)}% WF분할=[${wf.splits.map((s) => (s.expectancyR ?? 0).toFixed(2)).join(",")}] ${pass}`);
}

async function main() {
  // 레짐 적응형: 상승=컨플루언스 롱 / 하락=컨플루언스 숏 / 횡보=sigma 페이드(양끝).
  for (const [styleName, cfg] of Object.entries(STYLES)) {
    const byReg: Record<Regime, Trade[]> = { up: [], range: [], down: [] };
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
        const trail = c.slice(i - WARMUP + 1, i + 1);
        const v = detectVolSqueeze(trail), s = detectSigma(trail.slice(-21));
        const reg = regimeAt(c, sma50, i);

        if (reg === "up" || reg === "down") {
          // 추세장 — 컨플루언스(추세+신호 2개+ 동의)로 추세 방향 진입
          const votes: DirectionalVote[] = [{ name: "추세", side: reg === "up" ? "long" : "short" }];
          if (v.active) votes.push({ name: "vs", side: "long" });
          if (s.active && s.side) votes.push({ name: "sig", side: s.side });
          const cf = computeConfluence(votes);
          if (cf.highConviction && cf.net === (reg === "up" ? "long" : "short")) {
            byReg[reg].push(makeTrade(c, i, reg === "up" ? "long" : "short", atr[i], cfg)); last = i;
          }
        } else {
          // 횡보장 — sigma 과매도/과매수 페이드(양방향)
          if (s.active && s.side) { byReg.range.push(makeTrade(c, i, s.side, atr[i], cfg)); last = i; }
        }
      }
    }
    const all = [...byReg.up, ...byReg.range, ...byReg.down];
    const perDay = days > 0 ? (all.length / (days / COINS.length)).toFixed(2) : "?";
    const since = Number.isFinite(earliest) ? new Date(earliest).toISOString().slice(0, 10) : "?";
    console.log(`\n■ ${styleName.toUpperCase()} (${cfg.mtf}) — ${since}부터, 코인당 ${(days / COINS.length).toFixed(0)}일, 빈도 ${perDay}건/일·코인`);
    report("상승장(롱)   ", byReg.up);
    report("횡보장(페이드)", byReg.range);
    report("하락장(숏)   ", byReg.down);
    report("전체         ", all);
  }
  console.log("\n발행자격 = 기본게이트(표본≥20·기대값≥0.05R·MDD≤40%) + 워크포워드(분할≥50%양수·최근≥0) 둘 다 통과.");
}

main().catch((e) => { console.error(e); process.exit(1); });
