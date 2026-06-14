// LLM-FREE multi-regime band measurement.
// Pulls long Binance futures history, computes per-entry ATR, measures forward
// MFE/MAE over each style's horizon, buckets by volatility tercile, and reports
// MAE/ATR & MFE/ATR ratios (regime-robust scaling) + current-band mismatch.

const COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];
const FEE = 0.08; // round-trip taker %

const STYLES = {
  scalp:    { interval: "5m",  horizon: 96,  bars: 12000, stride: 8 },
  day:      { interval: "15m", horizon: 192, bars: 12000, stride: 12 },
  swing:    { interval: "1h",  horizon: 240, bars: 20000, stride: 24 },
  position: { interval: "1h",  horizon: 720, bars: 20000, stride: 48 },
};
const BANDS = {
  scalp:    { stopMin: 0.3, stopMax: 0.7, targetMin: 0.7, rr: 2 },
  day:      { stopMin: 0.7, stopMax: 1.5, targetMin: 1.5, rr: 1.5 },
  swing:    { stopMin: 2,   stopMax: 5,   targetMin: 5,   rr: 2 },
  position: { stopMin: 5,   stopMax: 15,  targetMin: 15,  rr: 3 },
};
const ATR_LEN = 14;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function klines(sym, interval, totalBars) {
  let out = [];
  let endTime = Date.now();
  while (out.length < totalBars) {
    const limit = Math.min(1500, totalBars - out.length);
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${interval}&limit=${limit}&endTime=${endTime}`;
    let arr;
    try { arr = await fetch(url).then((r) => r.json()); } catch { break; }
    if (!Array.isArray(arr) || arr.length === 0) break;
    out = arr.concat(out);
    endTime = arr[0][0] - 1;
    await sleep(110);
    if (arr.length < limit) break;
  }
  process.stderr.write(`  ${sym} ${interval}: ${out.length} bars\n`);
  return out.map((k) => ({ o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
}

function pctile(arr, p) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}
const med = (a) => pctile(a, 0.5);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

const cache = {};
async function getCandles(sym, interval, bars) {
  const key = `${sym}:${interval}:${bars}`;
  if (!cache[key]) cache[key] = await klines(sym, interval, bars);
  return cache[key];
}

// ATR% at bar i (using bars i-ATR_LEN..i)
function atrPctAt(c, i) {
  if (i < ATR_LEN + 1) return null;
  let sum = 0;
  for (let k = i - ATR_LEN + 1; k <= i; k++) {
    const tr = Math.max(c[k].h - c[k].l, Math.abs(c[k].h - c[k - 1].c), Math.abs(c[k].l - c[k - 1].c));
    sum += tr;
  }
  const atr = sum / ATR_LEN;
  return c[i].c > 0 ? (atr / c[i].c) * 100 : null;
}

const out = {};

for (const [style, cfg] of Object.entries(STYLES)) {
  process.stderr.write(`\n[${style}] fetching...\n`);
  const samples = []; // {atr, mfe, mae}
  for (const sym of COINS) {
    const c = await getCandles(sym, cfg.interval, cfg.bars);
    if (c.length < cfg.horizon + ATR_LEN + 10) continue;
    for (let i = ATR_LEN + 1; i + cfg.horizon < c.length; i += cfg.stride) {
      const atr = atrPctAt(c, i);
      if (!atr || atr <= 0) continue;
      const entry = c[i].c;
      let maxH = -Infinity, minL = Infinity;
      for (let j = i + 1; j <= i + cfg.horizon; j++) {
        if (c[j].h > maxH) maxH = c[j].h;
        if (c[j].l < minL) minL = c[j].l;
      }
      const mfe = ((maxH - entry) / entry) * 100;
      const mae = ((entry - minL) / entry) * 100;
      samples.push({ atr, mfe, mae });
    }
  }
  // vol terciles by ATR
  const sorted = [...samples].sort((a, b) => a.atr - b.atr);
  const t1 = sorted[Math.floor(sorted.length / 3)]?.atr ?? 0;
  const t2 = sorted[Math.floor((2 * sorted.length) / 3)]?.atr ?? 0;
  const buckets = { low: [], mid: [], high: [] };
  for (const s of samples) (s.atr <= t1 ? buckets.low : s.atr <= t2 ? buckets.mid : buckets.high).push(s);

  const band = BANDS[style];
  const bucketStats = {};
  for (const [name, bs] of Object.entries(buckets)) {
    if (bs.length === 0) continue;
    const maeArr = bs.map((s) => s.mae), mfeArr = bs.map((s) => s.mfe), atrArr = bs.map((s) => s.atr);
    const maeAtr = bs.map((s) => s.mae / s.atr), mfeAtr = bs.map((s) => s.mfe / s.atr);
    bucketStats[name] = {
      n: bs.length,
      atrMed: med(atrArr),
      maeMed: med(maeArr), mfeMed: med(mfeArr),
      maeAtrMed: med(maeAtr), mfeAtrMed: med(mfeAtr),
      noiseStopRate: bs.filter((s) => s.mae >= band.stopMin).length / bs.length * 100,
      reachTarget: bs.filter((s) => Math.max(s.mfe, s.mae) >= band.targetMin).length / bs.length * 100,
    };
  }
  out[style] = { nTotal: samples.length, band, bucketStats,
    overall: { maeAtrMed: med(samples.map((s) => s.mae / s.atr)), mfeAtrMed: med(samples.map((s) => s.mfe / s.atr)) } };
}

console.log("\n========== MULTI-REGIME BAND MEASUREMENT (6 coins, vol terciles) ==========\n");
for (const [style, r] of Object.entries(out)) {
  const b = r.band;
  console.log(`■ ${style.toUpperCase()}  (n=${r.nTotal})   현재 밴드: 손절 ${b.stopMin}~${b.stopMax}% · 목표 ${b.targetMin}%+ · R:R ${b.rr}+`);
  console.log(`   ${"vol버킷".padEnd(8)} ${"ATR%".padEnd(7)} ${"MAE중앙".padEnd(8)} ${"MFE중앙".padEnd(8)} ${"MAE/ATR".padEnd(8)} ${"MFE/ATR".padEnd(8)} ${"손절노이즈".padEnd(9)} 목표도달`);
  for (const name of ["low", "mid", "high"]) {
    const s = r.bucketStats[name];
    if (!s) continue;
    const ko = name === "low" ? "저변동" : name === "mid" ? "중변동" : "고변동";
    console.log(`   ${ko.padEnd(7)} ${s.atrMed.toFixed(2).padEnd(7)} ${s.maeMed.toFixed(2).padEnd(8)} ${s.mfeMed.toFixed(2).padEnd(8)} ${s.maeAtrMed.toFixed(2).padEnd(8)} ${s.mfeAtrMed.toFixed(2).padEnd(8)} ${(s.noiseStopRate.toFixed(0)+"%").padEnd(9)} ${s.reachTarget.toFixed(0)}%`);
  }
  console.log(`   → 전체 MAE/ATR=${r.overall.maeAtrMed.toFixed(2)}  MFE/ATR=${r.overall.mfeAtrMed.toFixed(2)}  (국면 안정성 = 위 3행 MAE/ATR 편차로 판단)\n`);
}
