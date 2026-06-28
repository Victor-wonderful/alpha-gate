/**
 * 미검증 전략 검토 — 크립토 네이티브(liquidity_grab, session_open_drive) +
 * 통계 모델(kalman·delta·markov)의 엣지를 레짐별로 측정.
 *
 * funding_squeeze(펀딩이력 필요)·bayes(복합)·sortino(필터지표)는 제외.
 * 실행: pnpm exec tsx scripts/backtest-strategies.ts
 */
import { classifyTrendComposite } from "../src/lib/analysis/trend";
import { findSwings, detectLiquiditySweeps } from "../src/lib/analysis/smc";
import { type Trade, netRFromGross, winRate, expectancyR, profitFactor, evaluateGate, walkForwardGate } from "../src/lib/backtest/metrics";

type Candle = { openTime: number; open: number; high: number; low: number; close: number; volume: number; closeTime: number; buyVolume: number };
type Side = "long" | "short";
const COINS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","ADAUSDT","AVAXUSDT","LINKUSDT","TRXUSDT","LTCUSDT","DOTUSDT"];
const STYLES = {
  day:   { mtf: "1h", bars: 16000, horizon: 24, cooldown: 12, rr: 1.5, stopMin: 0.7, stopMax: 1.5 },
  swing: { mtf: "4h", bars: 12000, horizon: 60, cooldown: 12, rr: 2,   stopMin: 2,   stopMax: 5 },
} as const;
type Cfg = (typeof STYLES)[keyof typeof STYLES];
const STOP_MULT = 1.5, WARMUP = 220;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

async function klines(sym: string, interval: string, n: number): Promise<Candle[]> {
  const out: Candle[] = []; let endTime = Date.now();
  while (out.length < n) {
    const limit = Math.min(1500, n - out.length);
    const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${interval}&limit=${limit}&endTime=${endTime}`);
    if (!res.ok) throw new Error(`${sym} ${res.status}`);
    const raw = (await res.json()) as number[][]; if (!raw.length) break;
    out.unshift(...raw.map((k) => ({ openTime: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], closeTime: +k[6], buyVolume: +k[9] })));
    endTime = out[0].openTime - 1; await sleep(110);
  }
  return out.slice(-n);
}
function atrPct(c: Candle[], period = 14): number[] {
  const tr: number[] = [0];
  for (let i = 1; i < c.length; i++) tr.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)));
  const out: number[] = new Array(c.length).fill(NaN);
  for (let i = period; i < c.length; i++) { let s = 0; for (let k = i - period + 1; k <= i; k++) s += tr[k]; out[i] = c[i].close > 0 ? ((s / period) / c[i].close) * 100 : NaN; }
  return out;
}
function makeTrade(c: Candle[], i: number, side: Side, ap: number, cfg: Cfg): Trade {
  const entry = c[i].close, sp = clamp(STOP_MULT * ap, cfg.stopMin, cfg.stopMax), sd = (sp / 100) * entry;
  const stop = side === "long" ? entry - sd : entry + sd, tgt = side === "long" ? entry + cfg.rr * sd : entry - cfg.rr * sd;
  const end = Math.min(c.length - 1, i + cfg.horizon); let g = 0, bars = end - i;
  for (let j = i + 1; j <= end; j++) {
    if (side === "long") { if (c[j].low <= stop) { g = -1; bars = j - i; break; } if (c[j].high >= tgt) { g = cfg.rr; bars = j - i; break; } }
    else { if (c[j].high >= stop) { g = -1; bars = j - i; break; } if (c[j].low <= tgt) { g = cfg.rr; bars = j - i; break; } }
    if (j === end) g = (side === "long" ? c[end].close - entry : entry - c[end].close) / sd;
  }
  return { rMultiple: netRFromGross(g, sp, bars), retPct: 0, barsHeld: bars, entryTs: new Date(c[i].openTime).toISOString() };
}
function report(name: string, t: Trade[]) {
  if (t.length < 20) { console.log(`   ${name}: n=${t.length} (표본부족)`); return; }
  const wf = walkForwardGate(t), pass = evaluateGate(t).passed && wf.passed;
  console.log(`   ${name}: n=${t.length} 승률=${((winRate(t) ?? 0) * 100).toFixed(0)}% 기대값=${(expectancyR(t) ?? 0).toFixed(3)}R PF=${(profitFactor(t) ?? 0).toFixed(2)} WF=[${wf.splits.map((s) => (s.expectancyR ?? 0).toFixed(2)).join(",")}] ${pass ? "✅발행자격" : "❌"}`);
}

async function main() {
  for (const [styleName, cfg] of Object.entries(STYLES) as [string, Cfg][]) {
    const B: Record<string, Trade[]> = { liquidity_grab: [], session_drive: [], kalman: [], delta: [], markov: [] };
    for (const sym of COINS) {
      let c: Candle[]; try { c = await klines(sym, cfg.mtf, cfg.bars); } catch { continue; }
      const ap = atrPct(c);
      const last: Record<string, number> = {};
      // EMA(kalman 근사)
      const k = 2 / (20 + 1); const ema: number[] = new Array(c.length).fill(NaN); let e = c[0].close;
      for (let i = 0; i < c.length; i++) { e = i === 0 ? c[0].close : c[i].close * k + e * (1 - k); ema[i] = e; }
      const fire = (name: string, side: Side | null, i: number) => { if (!side || i - (last[name] ?? -1e9) < cfg.cooldown) return; B[name].push(makeTrade(c, i, side, ap[i], cfg)); last[name] = i; };
      for (let i = WARMUP; i < c.length - 1; i++) {
        if (!Number.isFinite(ap[i]) || ap[i] <= 0) continue;
        const trail = c.slice(i - 200, i + 1);
        // 1) liquidity_grab — 최근 스윕 회복 방향
        const sw = detectLiquiditySweeps(trail, findSwings(trail, 3), { maxAgeBars: 5 }).find((x) => x.ageBars <= 5);
        if (sw) fire("liquidity_grab", sw.side === "bullish" ? "long" : "short", i);
        // 2) session_open_drive — 데이만. US 개장(13:00 UTC) 1h봉 방향
        if (cfg.mtf === "1h") { const h = new Date(c[i].openTime).getUTCHours(); if (h === 13) { const mv = (c[i].close - c[i].open) / c[i].open; if (Math.abs(mv) > 0.004) fire("session_drive", mv > 0 ? "long" : "short", i); } }
        // 3) kalman(추세선 기울기 근사) — EMA 상승/하락 기울기
        const slope = (ema[i] - ema[i - 10]) / ema[i - 10]; if (Math.abs(slope) > ap[i] / 100 * 0.5) fire("kalman", slope > 0 ? "long" : "short", i);
        // 4) delta(AR1 모멘텀 지속) — 최근 수익률 자기상관 양수 + 방향
        const rets: number[] = []; for (let j = i - 20; j < i; j++) rets.push((c[j + 1].close - c[j].close) / c[j].close);
        let num = 0, den = 0; const mr = rets.reduce((a, b) => a + b, 0) / rets.length;
        for (let j = 1; j < rets.length; j++) num += (rets[j] - mr) * (rets[j - 1] - mr);
        for (const r of rets) den += (r - mr) ** 2;
        const ac = den > 0 ? num / den : 0; if (ac > 0.1) fire("delta", rets[rets.length - 1] > 0 ? "long" : "short", i);
        // 5) markov — 상승봉 다음 상승봉 확률 ≥55%
        let up = 0, upup = 0; for (let j = i - 30; j < i; j++) { const u = c[j].close > c[j].open; if (u) { up++; if (c[j + 1].close > c[j + 1].open) upup++; } }
        if (up >= 8 && upup / up >= 0.55) fire("markov", "long", i);
      }
      process.stdout.write(".");
    }
    console.log(`\n■ ${styleName.toUpperCase()} (${cfg.mtf}) — 미검증 전략 검토`);
    for (const name of Object.keys(B)) report(name.padEnd(16), B[name]);
  }
  console.log("\n발행자격 = 표본≥20 + 기대값≥0.05R + R-MDD≤40% + 워크포워드.");
}
main().catch((e) => { console.error(e); process.exit(1); });
