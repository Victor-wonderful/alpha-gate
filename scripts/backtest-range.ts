/**
 * 공정한 횡보 백테스트 — "박스 끝에서 페이드, 목표=POC/반대편(고정 RR 아님), 손절=박스 바깥".
 *
 * 기존 매트릭스의 횡보 결함(고정 2R 목표 → 평균회귀 불리) 교정.
 * 레짐이 range/mixed일 때만, 볼륨프로파일 박스(VAH/VAL)가 깨끗하면 끝단 페이드.
 * 목표 변형 2개: POC(중앙, 보수) / 반대편 끝(완전 회귀).
 *
 * 실행: pnpm exec tsx scripts/backtest-range.ts
 */
import { classifyTrendComposite } from "../src/lib/analysis/trend";
import { computeVolumeProfile } from "../src/lib/analysis/volume-profile";
import { type Trade, netRFromGross, expectancyR, winRate, profitFactor, evaluateGate, walkForwardGate } from "../src/lib/backtest/metrics";

type Candle = { openTime: number; open: number; high: number; low: number; close: number; volume: number; closeTime: number; buyVolume: number };
type Side = "long" | "short";

const COINS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","ADAUSDT","AVAXUSDT","LINKUSDT","TRXUSDT","LTCUSDT","DOTUSDT","BCHUSDT","ETCUSDT","ATOMUSDT","UNIUSDT","AAVEUSDT","FILUSDT","NEARUSDT","ALGOUSDT","EOSUSDT","XLMUSDT","VETUSDT","THETAUSDT","SANDUSDT","AXSUSDT","FTMUSDT","ICPUSDT"];
const STYLES = {
  day:   { mtf: "1h", bars: 12000, horizon: 24, cooldown: 12, vpLook: 120, boxMin: 1.5, boxMax: 8,  edgeTolAtr: 0.5, stopBufAtr: 0.7 },
  swing: { mtf: "4h", bars: 12000, horizon: 60, cooldown: 12, vpLook: 120, boxMin: 3,   boxMax: 15, edgeTolAtr: 0.5, stopBufAtr: 0.7 },
} as const;
type Cfg = (typeof STYLES)[keyof typeof STYLES];
const ATR_LEN = 14, WARMUP = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
function atrAbsSeries(c: Candle[], period = ATR_LEN): number[] {
  const tr: number[] = [0];
  for (let i = 1; i < c.length; i++) tr.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)));
  const out: number[] = new Array(c.length).fill(NaN);
  for (let i = period; i < c.length; i++) { let s = 0; for (let k = i - period + 1; k <= i; k++) s += tr[k]; out[i] = s / period; }
  return out;
}

/** 진입/손절/목표 가격으로 전방 시뮬 → net R. */
function sim(c: Candle[], i: number, side: Side, entry: number, stop: number, target: number, horizon: number): Trade {
  const risk = Math.abs(entry - stop); const end = Math.min(c.length - 1, i + horizon);
  let g = 0, bars = end - i;
  for (let j = i + 1; j <= end; j++) {
    if (side === "long") { if (c[j].low <= stop) { g = -1; bars = j - i; break; } if (c[j].high >= target) { g = (target - entry) / risk; bars = j - i; break; } }
    else { if (c[j].high >= stop) { g = -1; bars = j - i; break; } if (c[j].low <= target) { g = (entry - target) / risk; bars = j - i; break; } }
    if (j === end) g = (side === "long" ? c[end].close - entry : entry - c[end].close) / risk;
  }
  const stopPct = (risk / entry) * 100;
  return { rMultiple: netRFromGross(g, stopPct, bars), retPct: 0, barsHeld: bars, entryTs: new Date(c[i].openTime).toISOString() };
}

function report(name: string, t: Trade[]) {
  if (t.length < 20) { console.log(`   ${name}: n=${t.length} (표본부족)`); return; }
  const pass = evaluateGate(t).passed && walkForwardGate(t).passed, wf = walkForwardGate(t);
  console.log(`   ${name}: n=${t.length} 승률=${((winRate(t) ?? 0) * 100).toFixed(0)}% 기대값=${(expectancyR(t) ?? 0).toFixed(3)}R PF=${(profitFactor(t) ?? 0).toFixed(2)} WF=[${wf.splits.map((s) => (s.expectancyR ?? 0).toFixed(2)).join(",")}] ${pass ? "✅발행자격" : "❌"}`);
}

async function main() {
  for (const [styleName, cfg] of Object.entries(STYLES) as [string, Cfg][]) {
    const poc: Trade[] = [], opp: Trade[] = [];
    for (const sym of COINS) {
      let c: Candle[]; try { c = await klines(sym, cfg.mtf, cfg.bars); } catch { continue; }
      const atr = atrAbsSeries(c); let last = -1e9;
      for (let i = Math.max(WARMUP, cfg.vpLook); i < c.length - 1; i++) {
        if (i - last < cfg.cooldown || !Number.isFinite(atr[i]) || atr[i] <= 0) continue;
        const tc = classifyTrendComposite(c.slice(i - 150, i + 1)).composite;
        if (tc.classification !== "range" && tc.classification !== "mixed") continue; // 횡보/불명확만
        const vp = computeVolumeProfile(c.slice(i - cfg.vpLook, i), 40, 0.7);
        if (vp.vah <= 0 || vp.val <= 0 || vp.poc <= 0) continue;
        const price = c[i].close, widthPct = ((vp.vah - vp.val) / price) * 100;
        if (widthPct < cfg.boxMin || widthPct > cfg.boxMax) continue; // 깨끗한 박스만
        const tol = cfg.edgeTolAtr * atr[i], buf = cfg.stopBufAtr * atr[i];

        // 상단 페이드(숏): 가격이 VAH 근처 + 상단부(POC 위)
        if (Math.abs(price - vp.vah) <= tol && price >= vp.poc) {
          const stop = vp.vah + buf;
          if (vp.poc < price) poc.push(sim(c, i, "short", price, stop, vp.poc, cfg.horizon));
          if (vp.val < price) opp.push(sim(c, i, "short", price, stop, vp.val, cfg.horizon));
          last = i;
        // 하단 페이드(롱): 가격이 VAL 근처 + 하단부(POC 아래)
        } else if (Math.abs(price - vp.val) <= tol && price <= vp.poc) {
          const stop = vp.val - buf;
          if (vp.poc > price) poc.push(sim(c, i, "long", price, stop, vp.poc, cfg.horizon));
          if (vp.vah > price) opp.push(sim(c, i, "long", price, stop, vp.vah, cfg.horizon));
          last = i;
        }
      }
      process.stdout.write(".");
    }
    console.log(`\n\n■ ${styleName.toUpperCase()} (${cfg.mtf}) — 횡보 박스 페이드 (목표별)`);
    report("목표=POC(중앙)   ", poc);
    report("목표=반대편 끝   ", opp);
  }
  console.log("\n발행자격 = 표본≥20 + 기대값≥0.05R + R-MDD≤40% + 워크포워드. 고정RR 아닌 박스 기반 목표.");
}
main().catch((e) => { console.error(e); process.exit(1); });
