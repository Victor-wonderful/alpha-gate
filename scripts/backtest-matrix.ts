/**
 * 레짐 × 전략 엣지 매트릭스 — "어느 레짐에서 어느 전략이 게이트를 통과하나"의 지도.
 *
 * 실제 detectors/trend/smc/metrics 모듈을 그대로 import.
 * 각 전략(결정론 진입룰)을 전 봉에 적용, 진입 시점의 레짐별로 결과를 분리 →
 * (전략 × 레짐) 칸마다 기대값·발행자격. 검증된 칸만 라이브러리에 넣는 근거.
 *
 * 실행: pnpm exec tsx scripts/backtest-matrix.ts
 */
import { detectVolSqueeze, detectSigma } from "../src/lib/analysis/detectors";
import { classifyTrendComposite } from "../src/lib/analysis/trend";
import { findSwings, detectLiquiditySweeps } from "../src/lib/analysis/smc";
import {
  type Trade, netRFromGross, expectancyR, evaluateGate, walkForwardGate,
} from "../src/lib/backtest/metrics";

type Candle = { openTime: number; open: number; high: number; low: number; close: number; volume: number; closeTime: number; buyVolume: number };
type Side = "long" | "short";

const COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "TRXUSDT", "LTCUSDT", "DOTUSDT"];
const STYLES = {
  day:   { mtf: "1h", bars: 12000, horizon: 24, cooldown: 12, rr: 1.5, stopMin: 0.7, stopMax: 1.5 },
  swing: { mtf: "4h", bars: 12000, horizon: 60, cooldown: 12, rr: 2,   stopMin: 2,   stopMax: 5 },
} as const;
type Cfg = (typeof STYLES)[keyof typeof STYLES];

const ATR_LEN = 14, STOP_MULT = 1.5, WARMUP = 220;
const STRATS = ["추세추종", "돌파", "범위페이드", "유동성스윕", "변동성수축", "sigma과매도과매수"] as const;
const REGIMES = ["강상승", "강하락", "횡보", "중간"] as const;
type RegimeL = (typeof REGIMES)[number];

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
    out.unshift(...raw.map((k) => ({ openTime: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], closeTime: +k[6], buyVolume: +k[9] })));
    endTime = out[0].openTime - 1; await sleep(110);
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
function emaSeries(c: Candle[], period: number): number[] {
  const k = 2 / (period + 1); const out: number[] = new Array(c.length).fill(NaN); let e = c[0].close;
  for (let i = 0; i < c.length; i++) { e = i === 0 ? c[0].close : c[i].close * k + e * (1 - k); out[i] = e; } return out;
}
function rollExtreme(c: Candle[], n: number, hi: boolean): number[] {
  const out: number[] = new Array(c.length).fill(NaN);
  for (let i = n; i < c.length; i++) { let v = hi ? -Infinity : Infinity; for (let j = i - n; j < i; j++) v = hi ? Math.max(v, c[j].high) : Math.min(v, c[j].low); out[i] = v; }
  return out;
}

function makeTrade(c: Candle[], i: number, side: Side, atrPct: number, cfg: Cfg): Trade {
  const entry = c[i].close, stopPct = clamp(STOP_MULT * atrPct, cfg.stopMin, cfg.stopMax), sd = (stopPct / 100) * entry;
  const stop = side === "long" ? entry - sd : entry + sd, tgt = side === "long" ? entry + cfg.rr * sd : entry - cfg.rr * sd;
  const end = Math.min(c.length - 1, i + cfg.horizon); let g = 0, bars = end - i;
  for (let j = i + 1; j <= end; j++) {
    if (side === "long") { if (c[j].low <= stop) { g = -1; bars = j - i; break; } if (c[j].high >= tgt) { g = cfg.rr; bars = j - i; break; } }
    else { if (c[j].high >= stop) { g = -1; bars = j - i; break; } if (c[j].low <= tgt) { g = cfg.rr; bars = j - i; break; } }
    if (j === end) g = (side === "long" ? c[end].close - entry : entry - c[end].close) / sd;
  }
  return { rMultiple: netRFromGross(g, stopPct, bars), retPct: 0, barsHeld: bars, entryTs: new Date(c[i].openTime).toISOString() };
}

function cell(t: Trade[]): string {
  if (t.length < 20) return `   ·(n${t.length})`.padStart(12);
  const e = expectancyR(t) ?? 0, pass = evaluateGate(t).passed && walkForwardGate(t).passed;
  return `${(e >= 0 ? "+" : "") + e.toFixed(3)}${pass ? "✅" : "  "}(${t.length})`.padStart(12);
}

async function main() {
  for (const [styleName, cfg] of Object.entries(STYLES)) {
    // buckets[strat][regime] = Trade[]
    const B: Record<string, Record<string, Trade[]>> = {};
    for (const s of STRATS) { B[s] = {}; for (const r of REGIMES) B[s][r] = []; }

    for (const sym of COINS) {
      let c: Candle[]; try { c = await klines(sym, cfg.mtf, cfg.bars); } catch { continue; }
      const atr = atrPctSeries(c), ema20 = emaSeries(c, 20);
      const hi20 = rollExtreme(c, 20, true), lo20 = rollExtreme(c, 20, false);
      const hi40 = rollExtreme(c, 40, true), lo40 = rollExtreme(c, 40, false);
      const last: Record<string, number> = {};
      for (let i = WARMUP; i < c.length - 1; i++) {
        if (!Number.isFinite(atr[i]) || atr[i] <= 0) continue;
        const trail = c.slice(i - 200, i + 1);
        const tc = classifyTrendComposite(c.slice(i - 150, i + 1)).composite;
        const regime: RegimeL =
          tc.classification === "up" && tc.strength === "strong" ? "강상승"
          : tc.classification === "down" && tc.strength === "strong" ? "강하락"
          : tc.classification === "range" || tc.classification === "mixed" ? "횡보" : "중간";
        const price = c[i].close;

        const fire = (name: string, side: Side | null) => {
          if (!side || i - (last[name] ?? -1e9) < cfg.cooldown) return;
          B[name][regime].push(makeTrade(c, i, side, atr[i], cfg)); last[name] = i;
        };

        // 1) 추세추종 — 추세 방향 + EMA20 근처(눌림)
        const upDown = tc.classification === "up" ? "long" : tc.classification === "down" ? "short" : null;
        if (upDown && Math.abs(price - ema20[i]) / price <= atr[i] / 100) fire("추세추종", upDown as Side);
        // 2) 돌파 — 20봉 신고가/신저가
        fire("돌파", price > hi20[i] ? "long" : price < lo20[i] ? "short" : null);
        // 3) 범위페이드 — 40봉 끝단 ±0.5%
        const fade: Side | null = price >= hi40[i] * 0.995 ? "short" : price <= lo40[i] * 1.005 ? "long" : null;
        fire("범위페이드", fade);
        // 4) 유동성스윕 — 최근 회복 sweep
        const sw = detectLiquiditySweeps(trail, findSwings(trail, 3), { maxAgeBars: 5 }).find((x) => x.ageBars <= 5);
        fire("유동성스윕", sw ? (sw.side === "bullish" ? "long" : "short") : null);
        // 5) 변동성수축 — vol_squeeze(롱 돌파)
        fire("변동성수축", detectVolSqueeze(trail).active ? "long" : null);
        // 6) sigma 과매도/과매수
        const sg = detectSigma(trail.slice(-21));
        fire("sigma과매도과매수", sg.active ? sg.side : null);
      }
      process.stdout.write(".");
    }

    console.log(`\n\n■ ${styleName.toUpperCase()} (${cfg.mtf}) — 레짐×전략 기대값R (✅=발행자격, ·=표본부족)`);
    console.log("전략".padEnd(20) + REGIMES.map((r) => r.padStart(12)).join(""));
    for (const s of STRATS) console.log(s.padEnd(20) + REGIMES.map((r) => cell(B[s][r])).join(""));
  }
  console.log("\n발행자격 = 표본≥20 + 기대값≥0.05R + R-MDD≤40% + 워크포워드(분할≥50%양수·최근≥0).");
}
main().catch((e) => { console.error(e); process.exit(1); });
