/**
 * 구조 이벤트 검증 — CHoCH/BOS(LuxAlgo SMC 포팅)가 방향 엣지를 주는가?
 *
 * 각 구조 이벤트가 발생한 봉에서 그 방향으로 진입(bullish→롱, bearish→숏)하고,
 * 봇 표준 손절/목표 밴드 + 비용 + 게이트(metrics.ts)로 순R을 집계한다.
 * 두 계층(swing=50 / internal=5) × 두 유형(BOS 지속 / CHoCH 전환)을 분리해 본다.
 *
 * 대조 baseline (같은 코인·스타일, 이전 backtest-direction-magic 결과):
 *   COMPOSITE(봇 기존 방향) — DAY 기대값 −0.024R / SWING +0.049R.
 *
 * 가설: CHoCH(전환) 진입이 baseline보다 기대값이 높으면 "구조 전환 조기 진입"에 엣지.
 *       BOS(지속)는 추세추종이라 COMPOSITE와 비슷할 것으로 예상.
 *
 * 실행: pnpm exec tsx scripts/backtest-structure-breaks.ts
 */
import { detectStructureBreaks } from "../src/lib/analysis/smc";
import {
  type Trade, netRFromGross, winRate, expectancyR, profitFactor,
  maxDrawdown, dailyRCurve, evaluateGate, walkForwardGate,
} from "../src/lib/backtest/metrics";

type Candle = { openTime: number; open: number; high: number; low: number; close: number; volume: number; closeTime: number; buyVolume: number };

const COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "TRXUSDT", "LTCUSDT", "DOTUSDT"];

const STYLES = {
  scalp: { mtf: "15m", bars: 12000, horizon: 48, rr: 1.3, stopMin: 0.3, stopMax: 1.2 },
  day:   { mtf: "1h",  bars: 20000, horizon: 24, rr: 1.5, stopMin: 0.7, stopMax: 1.5 },
  swing: { mtf: "4h",  bars: 12000, horizon: 60, rr: 2,   stopMin: 2,   stopMax: 5 },
} as const;
type Cfg = (typeof STYLES)[keyof typeof STYLES];

const ATR_LEN = 14, STOP_MULT = 1.5, WARMUP = 160;
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
  console.log(`   ${name}: n=${t.length} 승률=${((winRate(t) ?? 0) * 100).toFixed(0)}% 기대값=${(expectancyR(t) ?? 0) >= 0 ? "+" : ""}${(expectancyR(t) ?? 0).toFixed(3)}R PF=${(profitFactor(t) ?? 0).toFixed(2)} MDD=${((mdd ?? 0) * 100).toFixed(0)}% WF=[${wf.splits.map((s) => (s.expectancyR ?? 0).toFixed(2)).join(",")}] ${pass}`);
}

async function main() {
  for (const [styleName, cfg] of Object.entries(STYLES)) {
    const buckets: Record<string, Trade[]> = {
      "swing/BOS": [], "swing/CHoCH": [], "internal/BOS": [], "internal/CHoCH": [],
    };
    for (const sym of COINS) {
      let c: Candle[];
      try { c = await klines(sym, cfg.mtf, cfg.bars); } catch { continue; }
      const atr = atrPctSeries(c);
      const feed = (breaks: ReturnType<typeof detectStructureBreaks>, prefix: string) => {
        for (const ev of breaks) {
          if (ev.index < WARMUP || ev.index >= c.length - 1) continue;
          if (!Number.isFinite(atr[ev.index]) || atr[ev.index] <= 0) continue;
          const side = ev.side === "bullish" ? "long" : "short";
          buckets[`${prefix}/${ev.type}`].push(makeTrade(c, ev.index, side, atr[ev.index], cfg));
        }
      };
      feed(detectStructureBreaks(c, 50), "swing");
      feed(detectStructureBreaks(c, 5), "internal");
    }
    console.log(`\n■ ${styleName.toUpperCase()} (${cfg.mtf}) — 구조 이벤트 진입 (12코인). baseline은 magic 하니스 COMPOSITE 참조`);
    for (const [name, t] of Object.entries(buckets)) report(name.padEnd(14), t);
  }
  console.log("\n발행자격 = 기본게이트(표본≥20·기대값≥0.05R·MDD≤40%) + 워크포워드(분할≥50%양수·최근≥0) 둘 다 통과.");
  console.log("해석: CHoCH 기대값 > baseline → 전환 조기진입 엣지. BOS는 추세추종이라 baseline과 유사 예상.");
}

main().catch((e) => { console.error(e); process.exit(1); });
