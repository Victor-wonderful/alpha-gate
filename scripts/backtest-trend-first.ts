/**
 * 추세 우선 선별 가설 검증 — "추세가 강하고 명확한 코인을, 추세 방향으로 거래"가
 * 실제로 엣지가 높은가?
 *
 * 실제 분류기 classifyTrendComposite(ADX/KER/Choppiness) + metrics.ts 게이트 사용.
 * 진입 = 추세 방향(up→롱, down→숏), 추세 강도(strong/moderate/weak)별로 결과 분리.
 * → 강한 추세 버킷이 약한 버킷보다 월등하면 "추세 우선 선별" 검증.
 *
 * 실행: pnpm exec tsx scripts/backtest-trend-first.ts
 */
import { classifyTrendComposite } from "../src/lib/analysis/trend";
import {
  type Trade, netRFromGross, winRate, expectancyR, profitFactor,
  maxDrawdown, dailyRCurve, evaluateGate, walkForwardGate,
} from "../src/lib/backtest/metrics";

type Candle = { openTime: number; open: number; high: number; low: number; close: number; volume: number; closeTime: number; buyVolume: number };

const COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "TRXUSDT", "LTCUSDT", "DOTUSDT"];

const STYLES = {
  scalp:    { mtf: "15m", bars: 12000, horizon: 48,  cooldown: 8,  rr: 1.3, stopMin: 0.3, stopMax: 1.2 },
  day:      { mtf: "1h",  bars: 20000, horizon: 24,  cooldown: 12, rr: 1.5, stopMin: 0.7, stopMax: 1.5 },
  swing:    { mtf: "4h",  bars: 12000, horizon: 60,  cooldown: 12, rr: 2,   stopMin: 2,   stopMax: 5 },
  position: { mtf: "4h",  bars: 12000, horizon: 120, cooldown: 24, rr: 3,   stopMin: 5,   stopMax: 15 },
} as const;
type Cfg = (typeof STYLES)[keyof typeof STYLES];

const ATR_LEN = 14, STOP_MULT = 1.5, WARMUP = 160, TREND_WIN = 150;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

async function klines(sym: string, interval: string, totalBars: number): Promise<Candle[]> {
  const out: Candle[] = [];
  let endTime = Date.now();
  while (out.length < totalBars) {
    const limit = Math.min(1500, totalBars - out.length);
    const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${interval}&limit=${limit}&endTime=${endTime}`);
    if (!res.ok) throw new Error(`${sym} ${res.status}`);
    const raw = (await res.json()) as unknown[][];
    if (!raw.length) break;
    const batch: Candle[] = raw.map((k) => ({ openTime: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], closeTime: +k[6], buyVolume: +k[9] }));
    out.unshift(...batch); endTime = batch[0].openTime - 1; await sleep(110);
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
    if (j === end) { const mv = side === "long" ? c[end].close - entry : entry - c[end].close; grossR = mv / stopDist; }
  }
  return { rMultiple: netRFromGross(grossR, stopPct, bars), retPct: 0, barsHeld: bars, entryTs: new Date(c[i].openTime).toISOString() };
}

function report(name: string, t: Trade[]) {
  if (t.length < 5) { console.log(`   ${name}: n=${t.length} (표본부족)`); return; }
  const g = evaluateGate(t), wf = walkForwardGate(t), mdd = maxDrawdown(dailyRCurve(t, 0.01));
  const pass = g.passed && wf.passed ? "✅발행자격" : "❌";
  console.log(`   ${name}: n=${t.length} 승률=${((winRate(t) ?? 0) * 100).toFixed(0)}% 기대값=${(expectancyR(t) ?? 0).toFixed(3)}R PF=${(profitFactor(t) ?? 0).toFixed(2)} MDD=${((mdd ?? 0) * 100).toFixed(0)}% WF=[${wf.splits.map((s) => (s.expectancyR ?? 0).toFixed(2)).join(",")}] ${pass}`);
}

async function main() {
  for (const [styleName, cfg] of Object.entries(STYLES)) {
    const byStrength: Record<string, Trade[]> = { strong: [], moderate: [], weak: [] };
    for (const sym of COINS) {
      let c: Candle[];
      try { c = await klines(sym, cfg.mtf, cfg.bars); } catch { continue; }
      const atr = atrPctSeries(c);
      let last = -1e9;
      for (let i = Math.max(WARMUP, TREND_WIN); i < c.length - 1; i++) {
        if (i - last < cfg.cooldown || !Number.isFinite(atr[i]) || atr[i] <= 0) continue;
        const v = classifyTrendComposite(c.slice(i - TREND_WIN + 1, i + 1)).composite;
        if (v.classification !== "up" && v.classification !== "down") continue; // 추세 명확할 때만
        const side = v.classification === "up" ? "long" : "short";
        byStrength[v.strength].push(makeTrade(c, i, side, atr[i], cfg)); last = i;
      }
    }
    const all = [...byStrength.strong, ...byStrength.moderate, ...byStrength.weak];
    console.log(`\n■ ${styleName.toUpperCase()} (${cfg.mtf}) — 추세 방향 진입, 강도별`);
    report("강한추세  ", byStrength.strong);
    report("중간추세  ", byStrength.moderate);
    report("약한추세  ", byStrength.weak);
    report("전체(추세) ", all);
  }
  console.log("\n발행자격 = 기본게이트(표본≥20·기대값≥0.05R·MDD≤40%) + 워크포워드(분할≥50%양수·최근≥0) 둘 다 통과.");
  console.log("가설: 강한추세 버킷이 약한추세보다 월등하면 '추세 우선 선별' 검증.");
}

main().catch((e) => { console.error(e); process.exit(1); });
