/**
 * 방향 엔진 A/B/C — Trend Magic(CCI) 통합이 엣지를 주는가?
 *
 * 같은 시점·같은 손절/목표 밴드로, 방향만 다른 세 엔진을 비교한다:
 *   ① COMPOSITE  — 봇 기존 방향 소스 classifyTrendComposite(ADX/KER/Choppiness).
 *                  up/down일 때만 진입(range/mixed면 현금).
 *   ② MAGIC      — Trend Magic sign(CCI). 항상 방향이 있어 진입 빈도가 훨씬 높다(횡보 포함).
 *   ③ CONFLUENCE — COMPOSITE가 방향을 확정 + MAGIC이 같은 방향일 때만 진입(가장 선별적).
 *
 * 실제 함수를 import해 검증한다(포팅 정확성도 같이 확인). 손절/목표·비용·게이트는
 * 봇 표준과 동일 파이프라인(metrics.ts). 봇이 발주하는 day/swing 두 스타일만.
 *
 * 판정 기준(발행자격): 기본게이트(표본≥20·기대값≥0.05R·MDD≤40%) + 워크포워드(분할≥50%양수·최근≥0).
 * 가설: CONFLUENCE의 기대값/발행자격이 COMPOSITE 단독보다 나으면 통합할 가치가 있다.
 *       MAGIC 단독이 COMPOSITE보다 나쁘면(빈도만 높고 기대값 낮음) "방향 강제"의 함정 확인.
 *
 * 실행: pnpm exec tsx scripts/backtest-direction-magic.ts
 */
import { classifyTrendComposite, classifyTrendMagic } from "../src/lib/analysis/trend";
import {
  type Trade, netRFromGross, winRate, expectancyR, profitFactor,
  maxDrawdown, dailyRCurve, evaluateGate, walkForwardGate,
} from "../src/lib/backtest/metrics";

type Candle = { openTime: number; open: number; high: number; low: number; close: number; volume: number };

const COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "TRXUSDT", "LTCUSDT", "DOTUSDT"];

// 봇이 실제로 발주하는 두 스타일. mtf = 방향 판정 참조 TF (analyze.ts TREND_REF_ROLE와 일치).
const STYLES = {
  scalp: { mtf: "15m", bars: 12000, horizon: 48, cooldown: 8,  rr: 1.3, stopMin: 0.3, stopMax: 1.2 },
  day:   { mtf: "1h",  bars: 20000, horizon: 24, cooldown: 12, rr: 1.5, stopMin: 0.7, stopMax: 1.5 },
  swing: { mtf: "4h",  bars: 12000, horizon: 60, cooldown: 12, rr: 2,   stopMin: 2,   stopMax: 5 },
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
    const raw = (await res.json()) as number[][];
    if (!raw.length) break;
    const batch: Candle[] = raw.map((k) => ({ openTime: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
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

const sideOf = (cls: string): "long" | "short" | null => (cls === "up" ? "long" : cls === "down" ? "short" : null);

async function main() {
  for (const [styleName, cfg] of Object.entries(STYLES)) {
    const trades: Record<"COMPOSITE" | "MAGIC" | "CONFLUENCE", Trade[]> = { COMPOSITE: [], MAGIC: [], CONFLUENCE: [] };
    const last: Record<string, number> = { COMPOSITE: -1e9, MAGIC: -1e9, CONFLUENCE: -1e9 };
    for (const sym of COINS) {
      let c: Candle[];
      try { c = await klines(sym, cfg.mtf, cfg.bars); } catch { continue; }
      const atr = atrPctSeries(c);
      // 코인 경계에서 cooldown 리셋(다른 심볼끼리 쿨다운 공유 안 하도록).
      last.COMPOSITE = last.MAGIC = last.CONFLUENCE = -1e9;
      for (let i = Math.max(WARMUP, TREND_WIN); i < c.length - 1; i++) {
        if (!Number.isFinite(atr[i]) || atr[i] <= 0) continue;
        const win = c.slice(i - TREND_WIN + 1, i + 1);
        const compSide = sideOf(classifyTrendComposite(win).composite.classification);
        const magicDir = classifyTrendMagic(win);
        const magicSide = magicDir === "up" ? "long" : magicDir === "down" ? "short" : null;
        const confSide = compSide && compSide === magicSide ? compSide : null;

        if (compSide && i - last.COMPOSITE >= cfg.cooldown) { trades.COMPOSITE.push(makeTrade(c, i, compSide, atr[i], cfg)); last.COMPOSITE = i; }
        if (magicSide && i - last.MAGIC >= cfg.cooldown) { trades.MAGIC.push(makeTrade(c, i, magicSide, atr[i], cfg)); last.MAGIC = i; }
        if (confSide && i - last.CONFLUENCE >= cfg.cooldown) { trades.CONFLUENCE.push(makeTrade(c, i, confSide, atr[i], cfg)); last.CONFLUENCE = i; }
      }
    }
    console.log(`\n■ ${styleName.toUpperCase()} (${cfg.mtf}) — 방향 엔진 비교 (같은 손절/목표 밴드, 12코인)`);
    report("COMPOSITE(봇기존) ", trades.COMPOSITE);
    report("MAGIC(CCI 부호)   ", trades.MAGIC);
    report("CONFLUENCE(둘 동의)", trades.CONFLUENCE);
  }
  console.log("\n발행자격 = 기본게이트(표본≥20·기대값≥0.05R·MDD≤40%) + 워크포워드(분할≥50%양수·최근≥0) 둘 다 통과.");
  console.log("해석: CONFLUENCE 기대값 > COMPOSITE → 통합 가치. MAGIC 단독이 최악이면 '방향 강제'의 함정 확인.");
}

main().catch((e) => { console.error(e); process.exit(1); });
