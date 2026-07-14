/**
 * 시장가(즉시진입) 수익 구조 탐색 — 반사실 백테스트. LLM/토큰 0.
 *
 * 질문: "시장가 진입은 지는가"가 아니라 "어떤 필터를 걸면 시장가가 이기는가?"
 *   - sim-immediate-entry.mjs 는 만료건만·무필터 → ≈본전(-0.013R) 확인했음.
 *   - 여기선 방향 있는 전체 시나리오에 즉시진입 가정 + 진입 시점 봉에서
 *     모멘텀 지표를 직접 계산해(저장된 trend_strength는 40건뿐이라 못 씀) 필터별로 슬라이스.
 *
 * 필터(표준 지표, 각각 독립 검증 — 임의 가중치 없음):
 *   - EMA20 정렬: 롱=진입가>EMA20, 숏=진입가<EMA20 (추세 방향)
 *   - 최근 모멘텀: 직전 10봉 수익률 부호가 방향과 일치
 *   - 돌파 확정: 롱=진입가≥직전20봉 고가, 숏=진입가≤직전20봉 저가
 *   - 콤보: EMA정렬 + 모멘텀
 *
 * gross R + 수수료차감 R(왕복 0.075%) 둘 다 출력.
 * 실행: node scripts/backtest-market-entry-filter.mjs
 */
import { readFileSync } from "node:fs";

const env = {};
for (const l of readFileSync("D:/web01/.env.local", "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const base = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!base || !key) { console.error("Supabase 키 누락"); process.exit(1); }

const INTERVAL = { scalp: "5m", day: "15m", swing: "1h", position: "4h" };
const MS = { "5m": 3e5, "15m": 9e5, "1h": 36e5, "4h": 144e5 };
const LOOKBACK = 30;           // 모멘텀 계산용 직전 봉 수
const FLAT_ROUND_TRIP = 0.00075; // 구 단일 가정 0.075% (비교용)
// VIP0 실제 요율 — 시장가 진입=항상 테이커. 청산: 목표=지정가(메이커) / 손절·타임아웃=시장가(테이커).
const TAKER = 0.0005; // 0.05%
const MAKER = 0.0002; // 0.02%

async function fetchAll() {
  const out = []; let off = 0;
  for (;;) {
    const u = `${base}/rest/v1/scenario_outcomes?select=symbol,style,strategy_primary,direction,entry_price,stop_price,target_price,status,created_at,expires_at&or=(direction.eq.long,direction.eq.short)&order=created_at.asc&limit=1000&offset=${off}`;
    const r = await fetch(u, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) { console.error("조회 실패", r.status); process.exit(1); }
    const b = await r.json(); out.push(...b);
    if (b.length < 1000) break; off += 1000;
  }
  return out;
}

async function klines(sym, interval, start, end) {
  const s = sym.endsWith("USDT") ? sym : `${sym}USDT`;
  const out = []; let cur = start;
  for (let g = 0; g < 8 && cur < end; g++) {
    const u = `https://fapi.binance.com/fapi/v1/klines?symbol=${s}&interval=${interval}&startTime=${cur}&endTime=${end}&limit=1500`;
    const r = await fetch(u); if (!r.ok) break;
    const k = await r.json(); if (!Array.isArray(k) || !k.length) break;
    out.push(...k);
    if (k.length < 1500) break;
    cur = k[k.length - 1][0] + 1;
    await new Promise((z) => setTimeout(z, 35));
  }
  return out;
}

function ema(vals, period) {
  if (vals.length < period) return null;
  const k = 2 / (period + 1);
  let e = vals.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < vals.length; i++) e = vals[i] * k + e * (1 - k);
  return e;
}

// 즉시진입 시뮬 + 진입시점 모멘텀 필터 계산
function analyze(sc, bars) {
  const start = new Date(sc.created_at).getTime();
  let ei = bars.findIndex((b) => b[0] >= start);
  if (ei < 0) ei = 0;
  const pre = bars.slice(0, ei);          // 진입 전(모멘텀용)
  const fwd = bars.slice(ei);              // 진입 후(시뮬용)
  if (fwd.length < 2) return null;

  const dir = sc.direction === "short" ? -1 : 1;
  const entry = +fwd[0][1];                // 진입 = 신호 봉 시가(시장가 즉시)
  const stop = +sc.stop_price, target = +sc.target_price;
  if (!entry || !stop || !target) return null;
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return null;
  if (dir === 1 && (stop >= entry || target <= entry)) return null;
  if (dir === -1 && (stop <= entry || target >= entry)) return null;

  // 시뮬 (손절/목표 먼저 닿은 것; 동봉은 보수적 손절)
  let r = null, exit = null;
  for (const b of fwd) {
    const hi = +b[2], lo = +b[3];
    const hitStop = dir === 1 ? lo <= stop : hi >= stop;
    const hitTgt = dir === 1 ? hi >= target : lo <= target;
    if (hitStop) { r = -1; exit = "stop"; break; }
    if (hitTgt) { r = Math.abs(target - entry) / risk; exit = "target"; break; }
  }
  if (r === null) { const last = +fwd[fwd.length - 1][4]; r = (dir === 1 ? last - entry : entry - last) / risk; exit = "timeout"; }

  // 수수료 차감(R):
  //  flat = 구 단일 0.075% 가정 (비교용)
  //  split = 진입 테이커 고정 + 청산(목표=메이커 / 손절·타임아웃=테이커) — VIP0 실제
  const rNet = r - (FLAT_ROUND_TRIP * entry) / risk;
  const exitFee = exit === "target" ? MAKER : TAKER;
  const rNetSplit = r - ((TAKER + exitFee) * entry) / risk;

  // 진입 시점 모멘텀 필터 (pre 봉 필요)
  let emaAligned = null, momAligned = null, breakout = null;
  if (pre.length >= 20) {
    const closes = pre.map((b) => +b[4]);
    const e20 = ema(closes, 20);
    if (e20) emaAligned = dir === 1 ? entry > e20 : entry < e20;
    const c10 = +pre[pre.length - 10][4];
    const ret = (entry - c10) / c10;
    momAligned = dir === 1 ? ret > 0 : ret < 0;
    const last20 = pre.slice(-20);
    const hh = Math.max(...last20.map((b) => +b[2]));
    const ll = Math.min(...last20.map((b) => +b[3]));
    breakout = dir === 1 ? entry >= hh : entry <= ll;
  }
  return { r, rNet, rNetSplit, exit, emaAligned, momAligned, breakout, hasFilters: pre.length >= 20 };
}

const stat = (arr) => {
  if (!arr.length) return null;
  const n = arr.length, wins = arr.filter((x) => x > 0).length;
  const sum = arr.reduce((a, b) => a + b, 0);
  const gp = arr.filter((x) => x > 0).reduce((a, b) => a + b, 0);
  const gl = -arr.filter((x) => x < 0).reduce((a, b) => a + b, 0);
  return { n, win: wins / n, exp: sum / n, pf: gl > 0 ? gp / gl : Infinity };
};
const e = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`;
const fmt = (s) => s ? `n=${String(s.n).padStart(3)} 승률 ${(s.win * 100).toFixed(0).padStart(3)}% 기대값 ${e(s.exp)}R PF ${s.pf === Infinity ? "∞" : s.pf.toFixed(2)}` : "n=0";
// gross / flat0.075 / split(taker-maker 실제) 세 값
const both = (rows) => {
  if (!rows.length) return "n=0";
  const g = stat(rows.map((x) => x.r)), fl = stat(rows.map((x) => x.rNet)), sp = stat(rows.map((x) => x.rNetSplit));
  return `${fmt(g)}\n      → 순기대값  flat0.075%: ${e(fl.exp)}R   실제taker/maker: ${e(sp.exp)}R`;
};

async function main() {
  const rows = await fetchAll();
  console.log(`방향 있는 시나리오: ${rows.length}건 — 각각 즉시진입 시뮬 + 모멘텀 필터 계산 중...\n`);
  const res = [];
  let done = 0, skip = 0;
  for (const sc of rows) {
    const interval = INTERVAL[sc.style] || "1h";
    const start = new Date(sc.created_at).getTime();
    const fetchStart = start - LOOKBACK * MS[interval];
    const end = Math.min(new Date(sc.expires_at).getTime(), start + 1500 * MS[interval] * 6);
    if (!(end > start)) { skip++; continue; }
    let bars;
    try { bars = await klines(sc.symbol, interval, fetchStart, end); } catch { skip++; continue; }
    const a = analyze(sc, bars);
    if (!a) { skip++; continue; }
    res.push({ ...sc, ...a });
    if (++done % 50 === 0) process.stdout.write(`  ...${done}건\n`);
  }
  console.log(`\n시뮬 완료 ${done}건 (스킵 ${skip}건). 필터계산 가능(pre≥20봉): ${res.filter((x) => x.hasFilters).length}건\n`);

  console.log("════ 시장가(즉시진입) 필터별 성적 ════");
  console.log("• 무필터 전체        :", both(res));
  const f = res.filter((x) => x.hasFilters);
  console.log("• (필터가능 표본)전체 :", both(f));
  console.log("");
  console.log("• EMA20 정렬          :", both(f.filter((x) => x.emaAligned)));
  console.log("• EMA20 역행          :", both(f.filter((x) => x.emaAligned === false)));
  console.log("• 최근모멘텀 정렬     :", both(f.filter((x) => x.momAligned)));
  console.log("• 최근모멘텀 역행     :", both(f.filter((x) => x.momAligned === false)));
  console.log("• 돌파 확정           :", both(f.filter((x) => x.breakout)));
  console.log("• 돌파 아님           :", both(f.filter((x) => x.breakout === false)));
  console.log("");
  console.log("• 콤보 EMA+모멘텀     :", both(f.filter((x) => x.emaAligned && x.momAligned)));
  console.log("• 콤보 EMA+모멘텀+돌파:", both(f.filter((x) => x.emaAligned && x.momAligned && x.breakout)));
  console.log("• 콤보 반대(다 역행)  :", both(f.filter((x) => x.emaAligned === false && x.momAligned === false)));

  console.log("\n[콤보 EMA+모멘텀 — 스타일별]");
  for (const s of ["scalp", "day", "swing", "position"]) console.log(`  ${s.padEnd(9)}:`, both(f.filter((x) => x.style === s && x.emaAligned && x.momAligned)));

  console.log("\n해석: 어떤 필터의 '수수료차감 기대값'이 뚜렷이 +면 그게 시장가 수익 구조 후보.");
  console.log("      단 워크포워드/표본충분(n≥30) 확인 후에만 코드 반영. gross만 +고 차감 후 -면 무효.");
}
main().catch((e) => { console.error(e); process.exit(1); });
