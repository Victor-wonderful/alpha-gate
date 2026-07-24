/**
 * swing/CHoCH 되돌림 재검증 — 봇 실제 진입방식(되돌림 지정가)에서도 엣지가 유지되는가?
 *
 * 시장가(즉시진입) 결과: 1h +0.067R / 4h +0.148R (발행자격 통과, backtest-structure-breaks).
 * 봇은 시장가 추격을 안 하고 되돌림 지정가만 쓴다. 그래서 각 CHoCH에서:
 *   진입가 = 돌파된 pivot 레벨(ev.level) 재테스트 (SMC 정석 retest = 봇의 구조레벨 되돌림).
 *   유효기간(day 24h / swing 72h) 내 그 가격에 닿으면 체결, 안 닿으면 취소(거래 없음).
 * 체결분만 손절/목표 first-touch로 순R 집계하고, 시장가와 나란히 + 체결률을 본다.
 *
 * 되돌림의 상충: 진입가 유리 → 같은 손절폭에서 R↑. 하지만 일부는 안 닿아 놓침(표본↓).
 * 어느 쪽이 이기는지가 이 재검증의 답. swing 계층(50)만, 봇 발주 TF(1h/4h)만.
 *
 * 실행: pnpm exec tsx scripts/backtest-choch-retest.ts
 */
import { detectStructureBreaks } from "../src/lib/analysis/smc";
import {
  type Trade, netRFromGross, winRate, expectancyR, profitFactor,
  maxDrawdown, dailyRCurve, evaluateGate, walkForwardGate,
} from "../src/lib/backtest/metrics";

type Candle = { openTime: number; open: number; high: number; low: number; close: number; volume: number; closeTime: number; buyVolume: number };

const COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "TRXUSDT", "LTCUSDT", "DOTUSDT"];

// 봇 발주 TF만. expiry = 지정가 유효기간(봉 수): day 24h/1h=24, swing 72h/4h=18.
const STYLES = {
  day:   { mtf: "1h", bars: 20000, horizon: 24, rr: 1.5, stopMin: 0.7, stopMax: 1.5, expiry: 24 },
  swing: { mtf: "4h", bars: 12000, horizon: 60, rr: 2,   stopMin: 2,   stopMax: 5, expiry: 18 },
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

/** 진입 봉(entryIdx)·진입가(entryPx) 기준 손절/목표 first-touch → net R. */
function simFrom(c: Candle[], entryIdx: number, entryPx: number, side: "long" | "short", atrPct: number, cfg: Cfg): Trade {
  const stopPct = clamp(STOP_MULT * atrPct, cfg.stopMin, cfg.stopMax);
  const stopDist = (stopPct / 100) * entryPx;
  const stop = side === "long" ? entryPx - stopDist : entryPx + stopDist;
  const target = side === "long" ? entryPx + cfg.rr * stopDist : entryPx - cfg.rr * stopDist;
  const end = Math.min(c.length - 1, entryIdx + cfg.horizon);
  let grossR = 0, bars = end - entryIdx;
  for (let j = entryIdx + 1; j <= end; j++) {
    if (side === "long") { if (c[j].low <= stop) { grossR = -1; bars = j - entryIdx; break; } if (c[j].high >= target) { grossR = cfg.rr; bars = j - entryIdx; break; } }
    else { if (c[j].high >= stop) { grossR = -1; bars = j - entryIdx; break; } if (c[j].low <= target) { grossR = cfg.rr; bars = j - entryIdx; break; } }
    if (j === end) { const mv = side === "long" ? c[end].close - entryPx : entryPx - c[end].close; grossR = mv / stopDist; }
  }
  return { rMultiple: netRFromGross(grossR, stopPct, bars), retPct: 0, barsHeld: bars, entryTs: new Date(c[entryIdx].openTime).toISOString() };
}

function report(name: string, t: Trade[]) {
  if (t.length < 5) { console.log(`   ${name}: n=${t.length} (표본부족)`); return; }
  const g = evaluateGate(t), wf = walkForwardGate(t), mdd = maxDrawdown(dailyRCurve(t, 0.01));
  const pass = g.passed && wf.passed ? "✅발행자격" : "❌";
  console.log(`   ${name}: n=${t.length} 승률=${((winRate(t) ?? 0) * 100).toFixed(0)}% 기대값=${(expectancyR(t) ?? 0) >= 0 ? "+" : ""}${(expectancyR(t) ?? 0).toFixed(3)}R PF=${(profitFactor(t) ?? 0).toFixed(2)} MDD=${((mdd ?? 0) * 100).toFixed(0)}% WF=[${wf.splits.map((s) => (s.expectancyR ?? 0).toFixed(2)).join(",")}] ${pass}`);
}

async function main() {
  for (const [styleName, cfg] of Object.entries(STYLES)) {
    const market: Trade[] = [], limit: Trade[] = [];
    let nSignals = 0, nFilled = 0;
    for (const sym of COINS) {
      let c: Candle[];
      try { c = await klines(sym, cfg.mtf, cfg.bars); } catch { continue; }
      const atr = atrPctSeries(c);
      const breaks = detectStructureBreaks(c, 50).filter((b) => b.type === "CHoCH");
      for (const ev of breaks) {
        const i = ev.index;
        if (i < WARMUP || i >= c.length - 1) continue;
        if (!Number.isFinite(atr[i]) || atr[i] <= 0) continue;
        const side = ev.side === "bullish" ? "long" : "short";
        nSignals++;
        // 시장가 baseline — CHoCH 봉 종가 즉시 진입.
        market.push(simFrom(c, i, c[i].close, side, atr[i], cfg));
        // 지정가 — 돌파된 pivot 레벨 재테스트 되돌림 대기 (유효기간 내).
        const entryPx = ev.level;
        const jEnd = Math.min(i + cfg.expiry, c.length - 1);
        let fill = -1;
        for (let j = i + 1; j <= jEnd; j++) {
          if (side === "long" ? c[j].low <= entryPx : c[j].high >= entryPx) { fill = j; break; }
        }
        if (fill >= 0 && Number.isFinite(atr[fill]) && atr[fill] > 0) {
          nFilled++;
          limit.push(simFrom(c, fill, entryPx, side, atr[fill], cfg));
        }
      }
    }
    const fillRate = nSignals > 0 ? (nFilled / nSignals) * 100 : 0;
    console.log(`\n■ ${styleName.toUpperCase()} (${cfg.mtf}) — swing/CHoCH · 12코인 · 신호 ${nSignals}건 · 체결률 ${fillRate.toFixed(0)}% (유효기간 ${cfg.expiry}봉)`);
    report("시장가(즉시진입)", market);
    report("지정가(되돌림)  ", limit);
  }
  console.log("\n발행자격 = 기본게이트(표본≥20·기대값≥0.05R·MDD≤40%) + 워크포워드(분할≥50%양수·최근≥0) 둘 다 통과.");
  console.log("판정: 지정가 기대값 ≥ 시장가 & 발행자격 유지 & 체결률 충분 → 봇 배선 정당. 체결률 낮거나 기대값 붕괴 → 되돌림 폭·유효기간 조정.");
}

main().catch((e) => { console.error(e); process.exit(1); });
