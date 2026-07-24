/**
 * 4h swing/CHoCH 되돌림 깊이 A/B — "ATR이 되돌림 기준으로 중요한가?"에 데이터로 답한다.
 *
 * ev.level 재테스트(구조, 깊음)는 4h에서 시장가보다 나빴다(+0.148→+0.099, 발행자격 탈락).
 * 되돌림 깊이를 잘못 잡은 탓인지, 되돌림 자체가 4h에 안 맞는지 구분하려면 기준을 여러 개 봐야 한다.
 *
 * 진입 되돌림 기준(롱 기준, 숏 대칭) — 손절/목표는 공통(ATR×1.5 밴드) 고정:
 *   market  — CHoCH 봉 종가 즉시(되돌림 없음, baseline)
 *   level   — 돌파된 pivot 재테스트 (구조, 깊음)
 *   mid     — 종가~돌파레벨 중간 (돌파폭 50% 되돌림, 구조 기반)
 *   atr0.3/0.5/0.8 — 종가에서 k×ATR 되돌림 (변동성 기반)
 *
 * 각 기준의 체결률 + 기대값 + 발행자격을 비교. ATR 기준이 구조 기준을 못 이기면
 * "ATR은 되돌림에 핵심이 아니다"가 데이터로 확인된다.
 *
 * 실행: pnpm exec tsx scripts/backtest-choch-retest-depth.ts
 */
import { detectStructureBreaks } from "../src/lib/analysis/smc";
import {
  type Trade, netRFromGross, winRate, expectancyR, profitFactor,
  maxDrawdown, dailyRCurve, evaluateGate, walkForwardGate,
} from "../src/lib/backtest/metrics";

type Candle = { openTime: number; open: number; high: number; low: number; close: number; volume: number; closeTime: number; buyVolume: number };

const COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "TRXUSDT", "LTCUSDT", "DOTUSDT"];

const CFG = { mtf: "4h", bars: 12000, horizon: 60, rr: 2, stopMin: 2, stopMax: 5, expiry: 18 };
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

function simFrom(c: Candle[], entryIdx: number, entryPx: number, side: "long" | "short", atrPct: number): Trade {
  const stopPct = clamp(STOP_MULT * atrPct, CFG.stopMin, CFG.stopMax);
  const stopDist = (stopPct / 100) * entryPx;
  const stop = side === "long" ? entryPx - stopDist : entryPx + stopDist;
  const target = side === "long" ? entryPx + CFG.rr * stopDist : entryPx - CFG.rr * stopDist;
  const end = Math.min(c.length - 1, entryIdx + CFG.horizon);
  let grossR = 0, bars = end - entryIdx;
  for (let j = entryIdx + 1; j <= end; j++) {
    if (side === "long") { if (c[j].low <= stop) { grossR = -1; bars = j - entryIdx; break; } if (c[j].high >= target) { grossR = CFG.rr; bars = j - entryIdx; break; } }
    else { if (c[j].high >= stop) { grossR = -1; bars = j - entryIdx; break; } if (c[j].low <= target) { grossR = CFG.rr; bars = j - entryIdx; break; } }
    if (j === end) { const mv = side === "long" ? c[end].close - entryPx : entryPx - c[end].close; grossR = mv / stopDist; }
  }
  return { rMultiple: netRFromGross(grossR, stopPct, bars), retPct: 0, barsHeld: bars, entryTs: new Date(c[entryIdx].openTime).toISOString() };
}

/** 되돌림 진입가(롱=종가 아래 / 숏=종가 위). market이면 null(즉시진입 별도 처리). */
function retracePx(method: string, close: number, level: number, atrPx: number, side: "long" | "short"): number {
  if (method === "level") return level;
  if (method === "mid") return (close + level) / 2;
  const k = method === "atr0.3" ? 0.3 : method === "atr0.5" ? 0.5 : 0.8;
  return side === "long" ? close - k * atrPx : close + k * atrPx;
}

const METHODS = ["market", "level", "mid", "atr0.3", "atr0.5", "atr0.8"];

function report(name: string, t: Trade[], fillRate: number | null) {
  const fr = fillRate === null ? "  — " : `${fillRate.toFixed(0)}%`.padStart(4);
  if (t.length < 5) { console.log(`   ${name} 체결${fr}: n=${t.length} (표본부족)`); return; }
  const g = evaluateGate(t), wf = walkForwardGate(t), mdd = maxDrawdown(dailyRCurve(t, 0.01));
  const pass = g.passed && wf.passed ? "✅발행자격" : "❌";
  console.log(`   ${name} 체결${fr}: n=${t.length} 승률=${((winRate(t) ?? 0) * 100).toFixed(0)}% 기대값=${(expectancyR(t) ?? 0) >= 0 ? "+" : ""}${(expectancyR(t) ?? 0).toFixed(3)}R PF=${(profitFactor(t) ?? 0).toFixed(2)} MDD=${((mdd ?? 0) * 100).toFixed(0)}% WF=[${wf.splits.map((s) => (s.expectancyR ?? 0).toFixed(2)).join(",")}] ${pass}`);
}

async function main() {
  const buckets: Record<string, Trade[]> = {};
  const counts: Record<string, { sig: number; fill: number }> = {};
  for (const m of METHODS) { buckets[m] = []; counts[m] = { sig: 0, fill: 0 }; }

  for (const sym of COINS) {
    let c: Candle[];
    try { c = await klines(sym, CFG.mtf, CFG.bars); } catch { continue; }
    const atr = atrPctSeries(c);
    const breaks = detectStructureBreaks(c, 50).filter((b) => b.type === "CHoCH");
    for (const ev of breaks) {
      const i = ev.index;
      if (i < WARMUP || i >= c.length - 1) continue;
      if (!Number.isFinite(atr[i]) || atr[i] <= 0) continue;
      const side = ev.side === "bullish" ? "long" : "short";
      const close = c[i].close, atrPx = (atr[i] / 100) * close;
      for (const m of METHODS) {
        counts[m].sig++;
        if (m === "market") { counts[m].fill++; buckets[m].push(simFrom(c, i, close, side, atr[i])); continue; }
        const entryPx = retracePx(m, close, ev.level, atrPx, side);
        // 되돌림이 올바른 방향(롱=아래/숏=위)이 아니면 스킵(즉시체결 방지).
        if (side === "long" ? entryPx >= close : entryPx <= close) continue;
        const jEnd = Math.min(i + CFG.expiry, c.length - 1);
        let fill = -1;
        for (let j = i + 1; j <= jEnd; j++) {
          if (side === "long" ? c[j].low <= entryPx : c[j].high >= entryPx) { fill = j; break; }
        }
        if (fill >= 0 && Number.isFinite(atr[fill]) && atr[fill] > 0) {
          counts[m].fill++;
          buckets[m].push(simFrom(c, fill, entryPx, side, atr[fill]));
        }
      }
    }
  }

  console.log(`\n■ SWING (4h) — swing/CHoCH 되돌림 기준 A/B · 12코인 · 유효기간 ${CFG.expiry}봉`);
  const labels: Record<string, string> = {
    market: "시장가        ", level: "level(구조깊음)", mid: "mid(돌파50%)  ",
    "atr0.3": "ATR×0.3       ", "atr0.5": "ATR×0.5       ", "atr0.8": "ATR×0.8       ",
  };
  for (const m of METHODS) {
    const fr = m === "market" ? null : (counts[m].fill / counts[m].sig) * 100;
    report(labels[m], buckets[m], fr);
  }
  console.log("\n발행자격 = 기본게이트(표본≥20·기대값≥0.05R·MDD≤40%) + 워크포워드(분할≥50%양수·최근≥0) 둘 다 통과.");
  console.log("판정: ATR 기준(0.3/0.5/0.8)이 구조 기준(level/mid)·시장가를 못 이기면 'ATR은 되돌림에 핵심 아님' 확인.");
}

main().catch((e) => { console.error(e); process.exit(1); });
