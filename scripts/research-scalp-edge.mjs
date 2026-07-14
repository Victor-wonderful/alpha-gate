/**
 * 스캘프 엣지 탐색 — 평균회귀 신호 백테스트. LLM/토큰 0. 공개 Binance klines만.
 *
 * 가설: 짧은 시간대(5m)는 평균회귀 성질 → 극단에서 역방향 진입하면 고승률.
 *   스캘프 프로 프로필(승률↑·RR↓)에 맞음. (모멘텀 추격은 이미 무엣지 확인)
 *
 * 신호(각 독립 검증, 과최적화 방지):
 *   A) RSI(14) < 25 롱 / > 75 숏
 *   B) z-score = (close-SMA20)/std20 < -2 롱 / > +2 숏
 * 진입: 신호 다음 봉 시가(룩어헤드 방지). 한 번에 1포지션(비중첩).
 * 청산: 고정 목표 +0.4% / 손절 0.5% (RR 0.8, 고승률 기대). 미도달 시 4h 타임아웃.
 * 수수료: 진입 taker 0.05%, 목표 maker 0.02%, 손절/타임아웃 taker 0.05% (VIP0). BNB=×0.9.
 * 안정성: 전반부/후반부 분리로 후반에도 +인지.
 *
 * 실행: node scripts/research-scalp-edge.mjs
 */
const COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "BNBUSDT", "AVAXUSDT", "LINKUSDT"];
const DAYS = 40, TF = "5m", BAR_MS = 3e5;
const TARGET_PCT = 0.4, STOP_PCT = 0.5, TIMEOUT_BARS = 48;
const TAKER = 0.05, MAKER = 0.02;

async function klines(sym, startMs, endMs) {
  const out = []; let cur = startMs;
  while (cur < endMs) {
    const u = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${TF}&startTime=${cur}&endTime=${endMs}&limit=1500`;
    const r = await fetch(u); if (!r.ok) break;
    const k = await r.json(); if (!Array.isArray(k) || !k.length) break;
    out.push(...k);
    if (k.length < 1500) break;
    cur = k[k.length - 1][0] + 1;
    await new Promise((z) => setTimeout(z, 25));
  }
  return out.map((b) => ({ t: +b[0], o: +b[1], h: +b[2], l: +b[3], c: +b[4] }));
}

function sma(arr, i, n) { if (i < n - 1) return null; let s = 0; for (let j = i - n + 1; j <= i; j++) s += arr[j].c; return s / n; }
function std(arr, i, n, m) { if (i < n - 1) return null; let s = 0; for (let j = i - n + 1; j <= i; j++) s += (arr[j].c - m) ** 2; return Math.sqrt(s / n); }
function rsiSeries(arr, n = 14) {
  const out = new Array(arr.length).fill(null);
  let ag = 0, al = 0;
  for (let i = 1; i < arr.length; i++) {
    const ch = arr[i].c - arr[i - 1].c;
    const g = Math.max(0, ch), l = Math.max(0, -ch);
    if (i <= n) { ag += g; al += l; if (i === n) { ag /= n; al /= n; out[i] = 100 - 100 / (1 + ag / (al || 1e-9)); } }
    else { ag = (ag * (n - 1) + g) / n; al = (al * (n - 1) + l) / n; out[i] = 100 - 100 / (1 + ag / (al || 1e-9)); }
  }
  return out;
}

// 한 코인·한 신호 시뮬 → 트레이드 배열 [{r, exit, half}]
function run(bars, signalFn) {
  const rsi = rsiSeries(bars);
  const trades = [];
  let i = 30;
  const mid = bars[Math.floor(bars.length / 2)].t;
  while (i < bars.length - 1) {
    const m = sma(bars, i, 20), sd = std(bars, i, 20, m ?? 0);
    const dir = signalFn(bars, i, rsi, m, sd); // 1 long / -1 short / 0
    if (!dir) { i++; continue; }
    const entry = bars[i + 1].o;               // 다음 봉 시가
    if (!entry) { i++; continue; }
    const stop = dir === 1 ? entry * (1 - STOP_PCT / 100) : entry * (1 + STOP_PCT / 100);
    const tgt = dir === 1 ? entry * (1 + TARGET_PCT / 100) : entry * (1 - TARGET_PCT / 100);
    let exit = null, r = null, exitIdx = i + 1;
    const lastJ = Math.min(bars.length, i + 1 + TIMEOUT_BARS);
    for (let j = i + 1; j < lastJ; j++) {
      const hitStop = dir === 1 ? bars[j].l <= stop : bars[j].h >= stop;
      const hitTgt = dir === 1 ? bars[j].h >= tgt : bars[j].l <= tgt;
      if (hitStop) { exit = "stop"; r = -1; exitIdx = j; break; }       // 보수적
      if (hitTgt) { exit = "target"; r = TARGET_PCT / STOP_PCT; exitIdx = j; break; }
    }
    if (!exit) { exitIdx = Math.min(bars.length - 1, i + TIMEOUT_BARS); const last = bars[exitIdx].c; r = ((dir === 1 ? last - entry : entry - last) / entry) * 100 / STOP_PCT; exit = "timeout"; }
    trades.push({ r, exit, half: bars[exitIdx].t < mid ? 0 : 1 });
    i = exitIdx + 1;
  }
  return trades;
}

const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
function net(trades, bnb) {
  const d = bnb ? 0.9 : 1;
  return trades.map((t) => t.r - ((TAKER * d) + ((t.exit === "target" ? MAKER : TAKER) * d)) / STOP_PCT);
}
function report(name, trades) {
  if (trades.length < 30) { console.log(`  ${name}: n=${trades.length} (표본부족)`); return; }
  const win = trades.filter((t) => t.exit === "target").length / trades.length;
  const g = mean(trades.map((t) => t.r));
  const n0 = mean(net(trades, false)), nb = mean(net(trades, true));
  const h1 = net(trades.filter((t) => t.half === 0), true), h2 = net(trades.filter((t) => t.half === 1), true);
  console.log(`  ${name}: n=${trades.length} 승률 ${(win * 100).toFixed(0)}%  gross ${g >= 0 ? "+" : ""}${g.toFixed(3)}R  순(VIP0) ${n0 >= 0 ? "+" : ""}${n0.toFixed(3)}R  순(BNB) ${nb >= 0 ? "+" : ""}${nb.toFixed(3)}R`);
  console.log(`     안정성(BNB): 전반 ${mean(h1) >= 0 ? "+" : ""}${mean(h1).toFixed(3)}R (n${h1.length}) · 후반 ${mean(h2) >= 0 ? "+" : ""}${mean(h2).toFixed(3)}R (n${h2.length})`);
}

// 상위 추세: 5m SMA20 vs SMA100 (빠른선>느린선 = 상승추세)
const trendUp = (b, i) => { const f = sma(b, i, 20), s = sma(b, i, 100); return f != null && s != null ? (f > s ? 1 : -1) : 0; };
const SIGNALS = {
  "A_RSI극단": (b, i, rsi) => (rsi[i] != null && rsi[i] < 25 ? 1 : rsi[i] != null && rsi[i] > 75 ? -1 : 0),
  "B_z-score2": (b, i, rsi, m, sd) => { if (!m || !sd) return 0; const z = (b[i].c - m) / sd; return z < -2 ? 1 : z > 2 ? -1 : 0; },
  // C/D: 상위 추세 "방향으로만" 되돌림 진입 (추세 거스르는 fade 금지)
  "C_z+추세": (b, i, rsi, m, sd) => { if (!m || !sd) return 0; const z = (b[i].c - m) / sd, tr = trendUp(b, i); if (z < -2 && tr === 1) return 1; if (z > 2 && tr === -1) return -1; return 0; },
  "D_RSI+추세": (b, i, rsi) => { const tr = trendUp(b, i); if (rsi[i] != null && rsi[i] < 30 && tr === 1) return 1; if (rsi[i] != null && rsi[i] > 70 && tr === -1) return -1; return 0; },
};

const END = 1000 * Math.floor(Date.now() / 1000) * 0; // Date.now 사용 가능(스크립트)
const end = Date.now(), start = end - DAYS * 288 * BAR_MS;
console.log(`${TF} · 최근 ${DAYS}일 · ${COINS.length}코인 · 목표 ${TARGET_PCT}%/손절 ${STOP_PCT}% (RR ${(TARGET_PCT / STOP_PCT).toFixed(1)})`);
console.log(`본전 승률(RR ${(TARGET_PCT / STOP_PCT).toFixed(1)}) ≈ ${(100 / (1 + TARGET_PCT / STOP_PCT)).toFixed(0)}% (수수료 전)\n`);

const all = {};
for (const name of Object.keys(SIGNALS)) all[name] = [];
for (const sym of COINS) {
  let bars; try { bars = await klines(sym, start, end); } catch { console.log(`  ${sym} 실패`); continue; }
  if (bars.length < 300) { console.log(`  ${sym} 데이터 부족(${bars.length})`); continue; }
  for (const [name, fn] of Object.entries(SIGNALS)) all[name].push(...run(bars, fn));
  process.stdout.write(`  ${sym} ${bars.length}봉 완료\n`);
}
console.log("\n════ 신호별 성적 (전 코인 합산) ════");
for (const [name, tr] of Object.entries(all)) report(name, tr);
console.log("\n해석: 순(BNB)이 뚜렷이 + 이고 전반·후반 둘 다 + 면 → 엣지 후보. 하나라도 −면 무효/불안정.");
