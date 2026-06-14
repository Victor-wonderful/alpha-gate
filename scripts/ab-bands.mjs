// A/B BACKTEST: OLD fixed-% bands vs NEW ATR-relative bands.
// LLM-free. Directionless (long+short averaged) first-touch simulation over each
// style's horizon, bucketed by volatility tercile. Isolates exactly what the band
// rule controls: stop sizing → noise-stop rate, fee drag, win rate, net R.

const COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];
const FEE = 0.08;            // round-trip taker %
const FEE_FLOOR = 0.24;      // absolute min stop % (= FEE*3)
const ATR_LEN = 14;

const STYLES = {
  scalp:    { interval: "5m",  horizon: 96,  bars: 12000, stride: 8 },
  day:      { interval: "15m", horizon: 192, bars: 12000, stride: 12 },
  swing:    { interval: "1h",  horizon: 240, bars: 20000, stride: 24 },
  position: { interval: "1h",  horizon: 720, bars: 20000, stride: 48 },
};
// OLD rule: trade at the binding minimum stop, old RR.
const OLD = {
  scalp:    { stopMin: 0.3, rr: 2 },
  day:      { stopMin: 0.7, rr: 1.5 },
  swing:    { stopMin: 2,   rr: 2 },
  position: { stopMin: 5,   rr: 3 },
};
// NEW rule: stop = max(FEE_FLOOR, k*ATR), new RR.
const NEW = {
  scalp:    { k: 2.0, rr: 1.3 },
  day:      { k: 2.0, rr: 1.5 },
  swing:    { k: 2.5, rr: 1.8 },
  position: { k: 3.0, rr: 2.0 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function klines(sym, interval, totalBars) {
  let out = [], endTime = Date.now();
  while (out.length < totalBars) {
    const limit = Math.min(1500, totalBars - out.length);
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${interval}&limit=${limit}&endTime=${endTime}`;
    let arr; try { arr = await fetch(url).then((r) => r.json()); } catch { break; }
    if (!Array.isArray(arr) || arr.length === 0) break;
    out = arr.concat(out); endTime = arr[0][0] - 1; await sleep(110);
    if (arr.length < limit) break;
  }
  process.stderr.write(`  ${sym} ${interval}: ${out.length}\n`);
  return out.map((k) => ({ o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
}
const cache = {};
async function getCandles(sym, interval, bars) {
  const key = `${sym}:${interval}`;
  if (!cache[key]) cache[key] = await klines(sym, interval, bars);
  return cache[key];
}
function atrPctAt(c, i) {
  if (i < ATR_LEN + 1) return null;
  let sum = 0;
  for (let k = i - ATR_LEN + 1; k <= i; k++)
    sum += Math.max(c[k].h - c[k].l, Math.abs(c[k].h - c[k - 1].c), Math.abs(c[k].l - c[k - 1].c));
  return c[i].c > 0 ? (sum / ATR_LEN / c[i].c) * 100 : null;
}
function pctile(a, p) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }
const med = (a) => pctile(a, 0.5);

// first-touch over horizon. stopPct/targetPct in %. returns net R (after fee).
function simNetR(c, i, horizon, stopPct, targetPct, isLong) {
  const entry = c[i].c;
  const stop = isLong ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100);
  const target = isLong ? entry * (1 + targetPct / 100) : entry * (1 - targetPct / 100);
  const risk = Math.abs(entry - stop);
  const feeR = FEE / stopPct;
  let outcome = "timeout", exit = c[i + horizon]?.c ?? entry;
  for (let j = i + 1; j <= i + horizon; j++) {
    const b = c[j];
    const hitStop = isLong ? b.l <= stop : b.h >= stop;
    const hitTgt = isLong ? b.h >= target : b.l <= target;
    if (hitStop) { outcome = "stop"; exit = stop; break; }
    if (hitTgt) { outcome = "target"; exit = target; break; }
  }
  const grossR = risk > 0 ? (isLong ? exit - entry : entry - exit) / risk : 0;
  return { netR: grossR - feeR, outcome, feeR, stopPct };
}

function acc() { return { n: 0, netR: 0, win: 0, stop: 0, timeout: 0, feeR: 0, stopPctSum: 0 }; }
function add(a, r) {
  a.n++; a.netR += r.netR; a.feeR += r.feeR; a.stopPctSum += r.stopPct;
  if (r.outcome === "target") a.win++; else if (r.outcome === "stop") a.stop++; else a.timeout++;
}
function fmt(a) {
  if (!a.n) return "—";
  return `손절폭${(a.stopPctSum / a.n).toFixed(2)}% 승률${(a.win / a.n * 100).toFixed(0)}% 손절${(a.stop / a.n * 100).toFixed(0)}% 시간초과${(a.timeout / a.n * 100).toFixed(0)}% 수수료${(a.feeR / a.n).toFixed(2)}R 순R${(a.netR / a.n >= 0 ? "+" : "")}${(a.netR / a.n).toFixed(3)}`;
}

const report = {};
for (const [style, cfg] of Object.entries(STYLES)) {
  process.stderr.write(`\n[${style}]\n`);
  const old = cfg, o = OLD[style], nw = NEW[style];
  const atrs = [];
  const rows = []; // {atr, fns: ...}
  for (const sym of COINS) {
    const c = await getCandles(sym, cfg.interval, cfg.bars);
    if (c.length < cfg.horizon + ATR_LEN + 10) continue;
    for (let i = ATR_LEN + 1; i + cfg.horizon < c.length; i += cfg.stride) {
      const atr = atrPctAt(c, i);
      if (!atr || atr <= 0) continue;
      rows.push({ c, i, atr });
      atrs.push(atr);
    }
  }
  const t1 = pctile(atrs, 1 / 3), t2 = pctile(atrs, 2 / 3);
  const buckets = { low: { OLD: acc(), NEW: acc() }, mid: { OLD: acc(), NEW: acc() }, high: { OLD: acc(), NEW: acc() }, all: { OLD: acc(), NEW: acc() } };
  for (const { c, i, atr } of rows) {
    const bname = atr <= t1 ? "low" : atr <= t2 ? "mid" : "high";
    // OLD
    const oStop = o.stopMin, oTgt = o.stopMin * o.rr;
    // NEW
    const nStop = Math.max(FEE_FLOOR, nw.k * atr), nTgt = nStop * nw.rr;
    for (const isLong of [true, false]) {
      const ro = simNetR(c, i, cfg.horizon, oStop, oTgt, isLong);
      const rn = simNetR(c, i, cfg.horizon, nStop, nTgt, isLong);
      add(buckets[bname].OLD, ro); add(buckets.all.OLD, ro);
      add(buckets[bname].NEW, rn); add(buckets.all.NEW, rn);
    }
  }
  report[style] = buckets;
}

console.log("\n============ A/B: 구 고정밴드 vs 신 ATR밴드 (무방향, 6코인) ============\n");
for (const [style, b] of Object.entries(report)) {
  console.log(`■ ${style.toUpperCase()}   OLD(손절 ${OLD[style].stopMin}% · R:R ${OLD[style].rr})  →  NEW(손절 ${NEW[style].k}·ATR · R:R ${NEW[style].rr})`);
  for (const bk of ["low", "mid", "high", "all"]) {
    const ko = { low: "저변동", mid: "중변동", high: "고변동", all: "전체  " }[bk];
    console.log(`   ${ko}  OLD: ${fmt(b[bk].OLD)}`);
    console.log(`   ${ko}  NEW: ${fmt(b[bk].NEW)}`);
  }
  const dAll = (b.all.NEW.netR / b.all.NEW.n) - (b.all.OLD.netR / b.all.OLD.n);
  console.log(`   Δ 전체 순R (NEW-OLD) = ${dAll >= 0 ? "+" : ""}${dAll.toFixed(3)}R/거래\n`);
}
