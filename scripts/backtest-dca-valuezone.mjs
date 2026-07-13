// DCA 밸류 존 백테스트 — docs/DCA-모드-설계.md §10 검증 게이트.
// 질문: G2 밸류 존(3지표 다수결) 필터가 "무지성 매주 DCA"보다 평단을 실제로 낮추는가?
//
// 3지표 (설계서 G2와 동일, 전부 일봉 결정론):
//   ① 고점 대비 낙폭 백분위 — 당일까지 확장 히스토리에서 현재 낙폭의 깊이 순위
//      (하위 30% = cheap 표, 상위 30%(고점권) = expensive 표)
//   ② 200D MA — 아래 = cheap 표, +30% 위 = expensive 표
//   ③ 365D Volume Profile — VAL 이하 = cheap 표, VAH 이상 = expensive 표
//   다수결(2표+) → cheap / expensive, 아니면 neutral.
//
// 전략 (매주 월요일 100 USDT 예산 적립):
//   A 순수 DCA      — 무조건 매수 (기준선)
//   B 밸류존 온리   — cheap일 때만 적립분 전액 매수 (아니면 현금 보관)
//   C 기울인 DCA    — cheap: 풀에서 2배, neutral: 1배, expensive: 0 (보관)
//
// 판정 지표: 평단(투입 자본 효율) + 최종 가치(기회비용 포함) — 둘 다 봐야 정직.
// 실행: node scripts/backtest-dca-valuezone.mjs

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const WEEKLY = 100;
const WARMUP = 400; // MA200 + 낙폭 히스토리 + VP 창 확보

async function fetchDaily(symbol, wantDays = 2100) {
  const out = [];
  let endTime = Date.now();
  while (out.length < wantDays) {
    const r = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=1000&endTime=${endTime}`,
    );
    if (!r.ok) throw new Error(`${symbol} klines ${r.status}`);
    const batch = await r.json();
    if (!batch.length) break;
    out.unshift(
      ...batch.map((k) => ({
        openTime: k[0],
        close: parseFloat(k[4]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        volume: parseFloat(k[5]),
      })),
    );
    endTime = batch[0][0] - 1;
    if (batch.length < 1000) break;
  }
  return out;
}

function volumeProfile(candles, binCount = 40, vaPct = 0.7) {
  if (!candles.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (const c of candles) {
    if (c.low < lo) lo = c.low;
    if (c.high > hi) hi = c.high;
  }
  const size = (hi - lo) / binCount;
  if (size <= 0) return null;
  const bins = new Array(binCount).fill(0);
  for (const c of candles) {
    const mid = (c.high + c.low) / 2;
    const i = Math.min(binCount - 1, Math.max(0, Math.floor((mid - lo) / size)));
    bins[i] += c.volume;
  }
  let poc = 0;
  for (let i = 1; i < binCount; i++) if (bins[i] > bins[poc]) poc = i;
  const total = bins.reduce((s, v) => s + v, 0);
  let acc = bins[poc], a = poc, b = poc;
  while (acc < total * vaPct && (a > 0 || b < binCount - 1)) {
    const left = a > 0 ? bins[a - 1] : -1;
    const right = b < binCount - 1 ? bins[b + 1] : -1;
    if (right >= left) { b++; acc += bins[b]; } else { a--; acc += bins[a]; }
  }
  return { val: lo + a * size, vah: lo + (b + 1) * size };
}

/** i일 시점 밸류 존 판정 (미래 정보 없음 — 전부 i까지만 사용). */
function verdictAt(candles, i, state) {
  const price = candles[i].close;
  // ① 낙폭 백분위 (확장)
  state.ath = Math.max(state.ath, candles[i].high);
  const dd = price / state.ath - 1; // ≤ 0
  state.ddHist.push(dd);
  const sorted = [...state.ddHist].sort((x, y) => x - y); // 깊은 순
  const rank = sorted.findIndex((v) => v >= dd) / sorted.length; // 0=가장 깊음
  let vCheap = 0, vExp = 0;
  if (rank <= 0.3) vCheap++; else if (rank >= 0.7) vExp++;
  // ② 200D MA
  let s = 0;
  for (let k = i - 199; k <= i; k++) s += candles[k].close;
  const ma = s / 200;
  if (price < ma) vCheap++; else if (price > ma * 1.3) vExp++;
  // ③ 365D VP
  const vp = volumeProfile(candles.slice(i - 364, i + 1));
  if (vp) {
    if (price <= vp.val) vCheap++; else if (price >= vp.vah) vExp++;
  }
  if (vCheap >= 2) return "cheap";
  if (vExp >= 2) return "expensive";
  return "neutral";
}

function simulate(candles) {
  const strat = {
    A: { pool: 0, cash: 0, coins: 0, spent: 0, buys: 0, yearly: {} },
    B: { pool: 0, coins: 0, spent: 0, buys: 0, yearly: {}, idleWeeks: 0, maxIdle: 0 },
    C: { pool: 0, coins: 0, spent: 0, buys: 0, yearly: {} },
    D: { pool: 0, coins: 0, spent: 0, buys: 0, yearly: {} }, // cheap 2x / neutral 1x / expensive 0.5x
  };
  const verdictCount = { cheap: 0, neutral: 0, expensive: 0 };
  const state = { ath: 0, ddHist: [] };
  for (let i = 0; i < WARMUP; i++) {
    state.ath = Math.max(state.ath, candles[i].high);
    state.ddHist.push(candles[i].close / state.ath - 1);
  }

  const buy = (st, amt, price, year) => {
    if (amt <= 0) return;
    st.coins += amt / price;
    st.spent += amt;
    st.buys++;
    const y = (st.yearly[year] ??= { spent: 0, coins: 0 });
    y.spent += amt;
    y.coins += amt / price;
  };

  for (let i = WARMUP; i < candles.length; i++) {
    const dow = new Date(candles[i].openTime).getUTCDay();
    if (dow !== 1) continue; // 매주 월요일
    const price = candles[i].close;
    const year = new Date(candles[i].openTime).getUTCFullYear();
    const v = verdictAt(candles, i, state);
    verdictCount[v]++;

    // A: 무조건
    buy(strat.A, WEEKLY, price, year);
    // B: cheap일 때만 풀 전액
    strat.B.pool += WEEKLY;
    if (v === "cheap") {
      buy(strat.B, strat.B.pool, price, year);
      strat.B.pool = 0;
      strat.B.idleWeeks = 0;
    } else {
      strat.B.idleWeeks++;
      strat.B.maxIdle = Math.max(strat.B.maxIdle, strat.B.idleWeeks);
    }
    // C: cheap 2배 / neutral 1배 / expensive 0
    strat.C.pool += WEEKLY;
    const want = v === "cheap" ? WEEKLY * 2 : v === "neutral" ? WEEKLY : 0;
    const amt = Math.min(strat.C.pool, want);
    if (amt > 0) { buy(strat.C, amt, price, year); strat.C.pool -= amt; }
    // D: 항상 사되 기울임 — cheap 2배 / neutral 1배 / expensive 0.5배 (현금 방치 최소화)
    strat.D.pool += WEEKLY;
    const wantD = v === "cheap" ? WEEKLY * 2 : v === "neutral" ? WEEKLY : WEEKLY * 0.5;
    const amtD = Math.min(strat.D.pool, wantD);
    if (amtD > 0) { buy(strat.D, amtD, price, year); strat.D.pool -= amtD; }
  }
  const last = candles[candles.length - 1].close;
  const firstBuyTs = candles[WARMUP].openTime;
  return { strat, verdictCount, last, firstBuyTs };
}

function pct(x) { return `${(x * 100).toFixed(1)}%`; }

for (const sym of SYMBOLS) {
  const candles = await fetchDaily(sym);
  if (candles.length < WARMUP + 120) {
    console.log(`\n=== ${sym}: 데이터 부족 (${candles.length}일) — 스킵`);
    continue;
  }
  const { strat, verdictCount, last, firstBuyTs } = simulate(candles);
  const from = new Date(firstBuyTs).toISOString().slice(0, 10);
  const vTotal = verdictCount.cheap + verdictCount.neutral + verdictCount.expensive;
  console.log(`\n=== ${sym} — ${candles.length}일 데이터, 매수 시작 ${from}, 현재가 ${last.toLocaleString()}`);
  console.log(
    `밸류존 분포: cheap ${pct(verdictCount.cheap / vTotal)} · neutral ${pct(verdictCount.neutral / vTotal)} · expensive ${pct(verdictCount.expensive / vTotal)} (주간 판정 ${vTotal}회)`,
  );
  const aAvg = strat.A.spent / strat.A.coins;
  console.log(`B 최장 무매수: ${strat.B.maxIdle}주`);
  console.log(`전략     매수  투입        평단        vs A평단   최종가치(현금포함)  ROI`);
  for (const k of ["A", "B", "C", "D"]) {
    const s = strat[k];
    const avg = s.coins > 0 ? s.spent / s.coins : NaN;
    const cash = s.pool ?? 0;
    const value = s.coins * last + cash;
    const totalIn = s.spent + cash;
    const roi = totalIn > 0 ? value / totalIn - 1 : 0;
    console.log(
      `${k}      ${String(s.buys).padStart(4)}  ${String(Math.round(s.spent)).padStart(7)}+${String(Math.round(cash)).padStart(5)}현금  ${avg.toFixed(avg > 100 ? 0 : 2).padStart(9)}  ${(((avg - aAvg) / aAvg) * 100).toFixed(1).padStart(6)}%   ${Math.round(value).toLocaleString().padStart(10)}  ${pct(roi).padStart(7)}`,
    );
  }
  // 연도별 평단 vs A
  console.log(`연도별 평단 (vs A, − = B/C가 더 쌈):`);
  const years = Object.keys(strat.A.yearly).sort();
  for (const y of years) {
    const row = [y];
    const aY = strat.A.yearly[y];
    const aAvgY = aY.spent / aY.coins;
    for (const k of ["B", "C", "D"]) {
      const sy = strat[k].yearly[y];
      if (!sy || sy.coins === 0) { row.push(`${k}: 매수없음`); continue; }
      const avgY = sy.spent / sy.coins;
      row.push(`${k}: ${(((avgY - aAvgY) / aAvgY) * 100).toFixed(1)}%`);
    }
    console.log(`  ${row.join("   ")}`);
  }
}
