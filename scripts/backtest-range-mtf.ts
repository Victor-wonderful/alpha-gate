/**
 * 멀티TF 횡보 매매 백테스트 — 스타일별 HTF/MTF/LTF를 제대로 써서 공정 검증.
 *
 * 방식(진짜 트레이더처럼):
 *  - HTF에서 박스(지지저항=볼륨프로파일 VAH/VAL/POC) 식별
 *  - MTF가 횡보(range/mixed) 레짐일 때만
 *  - LTF에서 박스 끝 거부 캔들 확인 후 진입 (맹목적 터치 X)
 *  - 목표 = POC/반대편, 손절 = 박스 바깥
 *  - 4개 스타일 전부.
 *
 * 실행: pnpm exec tsx scripts/backtest-range-mtf.ts
 */
import { classifyTrendComposite } from "../src/lib/analysis/trend";
import { computeVolumeProfile } from "../src/lib/analysis/volume-profile";
import { type Trade, netRFromGross, winRate, expectancyR, profitFactor, evaluateGate, walkForwardGate } from "../src/lib/backtest/metrics";

type Candle = { openTime: number; open: number; high: number; low: number; close: number; volume: number; closeTime: number; buyVolume: number };
type Side = "long" | "short";

const COINS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","ADAUSDT","AVAXUSDT","LINKUSDT","TRXUSDT","LTCUSDT","DOTUSDT"];

// 스타일별 HTF/MTF/LTF (style.ts STYLE_PRESETS) + 박스/손절/보유 파라미터.
const STYLES = {
  scalp:    { htf: "1h", mtf: "15m", ltf: "5m",  htfBars: 2000, mtfBars: 5000, ltfBars: 12000, vpLook: 80, boxMin: 0.6, boxMax: 4,  horizon: 96,  cooldown: 12 },
  day:      { htf: "4h", mtf: "1h",  ltf: "15m", htfBars: 1500, mtfBars: 4000, ltfBars: 12000, vpLook: 80, boxMin: 1.5, boxMax: 8,  horizon: 96,  cooldown: 12 },
  swing:    { htf: "1d", mtf: "4h",  ltf: "1h",  htfBars: 1200, mtfBars: 4000, ltfBars: 12000, vpLook: 60, boxMin: 3,   boxMax: 18, horizon: 120, cooldown: 12 },
  position: { htf: "1d", mtf: "4h",  ltf: "1h",  htfBars: 1200, mtfBars: 4000, ltfBars: 12000, vpLook: 80, boxMin: 5,   boxMax: 30, horizon: 240, cooldown: 24 },
} as const;
type Cfg = (typeof STYLES)[keyof typeof STYLES];

const STOP_BUF_ATR = 0.5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function klines(sym: string, interval: string, n: number): Promise<Candle[]> {
  const out: Candle[] = []; let endTime = Date.now();
  while (out.length < n) {
    const limit = Math.min(1500, n - out.length);
    const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${interval}&limit=${limit}&endTime=${endTime}`);
    if (!res.ok) throw new Error(`${sym} ${interval} ${res.status}`);
    const raw = (await res.json()) as number[][]; if (!raw.length) break;
    out.unshift(...raw.map((k) => ({ openTime: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], closeTime: +k[6], buyVolume: +k[9] })));
    endTime = out[0].openTime - 1; await sleep(110);
  }
  return out.slice(-n);
}
function atrAbs(c: Candle[], period = 14): number[] {
  const tr: number[] = [0];
  for (let i = 1; i < c.length; i++) tr.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)));
  const out: number[] = new Array(c.length).fill(NaN);
  for (let i = period; i < c.length; i++) { let s = 0; for (let k = i - period + 1; k <= i; k++) s += tr[k]; out[i] = s / period; }
  return out;
}

function report(name: string, t: Trade[]) {
  if (t.length < 20) { console.log(`   ${name}: n=${t.length} (표본부족)`); return; }
  const pass = evaluateGate(t).passed && walkForwardGate(t).passed, wf = walkForwardGate(t);
  console.log(`   ${name}: n=${t.length} 승률=${((winRate(t) ?? 0) * 100).toFixed(0)}% 기대값=${(expectancyR(t) ?? 0).toFixed(3)}R PF=${(profitFactor(t) ?? 0).toFixed(2)} WF=[${wf.splits.map((s) => (s.expectancyR ?? 0).toFixed(2)).join(",")}] ${pass ? "✅발행자격" : "❌"}`);
}

async function main() {
  for (const [styleName, cfg] of Object.entries(STYLES) as [string, Cfg][]) {
    const pocT: Trade[] = [], oppT: Trade[] = [];
    for (const sym of COINS) {
      let htf: Candle[], mtf: Candle[], ltf: Candle[];
      try {
        [htf, mtf, ltf] = await Promise.all([klines(sym, cfg.htf, cfg.htfBars), klines(sym, cfg.mtf, cfg.mtfBars), klines(sym, cfg.ltf, cfg.ltfBars)]);
      } catch { continue; }
      if (htf.length < cfg.vpLook + 2 || mtf.length < 160 || ltf.length < 50) continue;

      // 1) HTF 박스 사전계산 (각 HTF 봉까지의 닫힌 vpLook봉 VP)
      const box: (null | { poc: number; vah: number; val: number })[] = new Array(htf.length).fill(null);
      for (let k = cfg.vpLook; k < htf.length; k++) {
        const vp = computeVolumeProfile(htf.slice(k - cfg.vpLook, k), 40, 0.7);
        if (vp.vah > 0 && vp.val > 0 && vp.poc > 0) box[k] = { poc: vp.poc, vah: vp.vah, val: vp.val };
      }
      // 2) MTF 횡보 여부 사전계산
      const isRange: boolean[] = new Array(mtf.length).fill(false);
      for (let k = 150; k < mtf.length; k++) {
        const cl = classifyTrendComposite(mtf.slice(k - 150, k)).composite.classification;
        isRange[k] = cl === "range" || cl === "mixed";
      }
      const ltfAtr = atrAbs(ltf);

      // 3) LTF 순회 — 상위 TF는 "마지막 닫힌 봉" 포인터로 정렬
      let hi = 0, mi = 0, last = -1e9;
      for (let j = 30; j < ltf.length - 1; j++) {
        const t = ltf[j].openTime;
        while (hi + 1 < htf.length && htf[hi + 1].openTime <= t) hi++;
        while (mi + 1 < mtf.length && mtf[mi + 1].openTime <= t) mi++;
        if (hi < 1 || mi < 1) continue;
        if (j - last < cfg.cooldown || !Number.isFinite(ltfAtr[j]) || ltfAtr[j] <= 0) continue;
        if (!isRange[mi - 1]) continue;            // MTF 횡보 레짐만
        const b = box[hi - 1];                      // HTF 닫힌 박스
        if (!b) continue;
        const price = ltf[j].close, widthPct = ((b.vah - b.val) / price) * 100;
        if (widthPct < cfg.boxMin || widthPct > cfg.boxMax) continue; // 깨끗한 박스만
        const buf = STOP_BUF_ATR * ltfAtr[j];
        const cj = ltf[j];

        // 상단 거부(숏): 고가가 VAH 닿았다가 종가가 VAH 아래 + 음봉
        if (cj.high >= b.vah && cj.close < b.vah && cj.close < cj.open && price > b.poc) {
          const stop = b.vah + buf; const risk = stop - price;
          if (risk > 0) {
            if (b.poc < price) pocT.push(simLtf(ltf, j, "short", price, stop, b.poc, cfg.horizon));
            if (b.val < price) oppT.push(simLtf(ltf, j, "short", price, stop, b.val, cfg.horizon));
            last = j;
          }
        // 하단 거부(롱): 저가가 VAL 닿았다가 종가가 VAL 위 + 양봉
        } else if (cj.low <= b.val && cj.close > b.val && cj.close > cj.open && price < b.poc) {
          const stop = b.val - buf; const risk = price - stop;
          if (risk > 0) {
            if (b.poc > price) pocT.push(simLtf(ltf, j, "long", price, stop, b.poc, cfg.horizon));
            if (b.vah > price) oppT.push(simLtf(ltf, j, "long", price, stop, b.vah, cfg.horizon));
            last = j;
          }
        }
      }
      process.stdout.write(".");
    }
    console.log(`\n\n■ ${styleName.toUpperCase()} (HTF ${cfg.htf} 박스 + LTF ${cfg.ltf} 거부확인) — 횡보 멀티TF`);
    report("목표=POC      ", pocT);
    report("목표=반대편 끝 ", oppT);
  }
  console.log("\n발행자격 = 표본≥20 + 기대값≥0.05R + R-MDD≤40% + 워크포워드.");
}

function simLtf(c: Candle[], i: number, side: Side, entry: number, stop: number, target: number, horizon: number): Trade {
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

main().catch((e) => { console.error(e); process.exit(1); });
