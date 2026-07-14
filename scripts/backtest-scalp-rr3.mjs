/**
 * "스캘프 손절 0.5% / 익절 1.5%(RR 3)" 반사실 백테스트. LLM/토큰 0.
 *
 * 질문: 손절 좁게(0.5%) 두고 익절만 높이면(1.5%, RR 3) 스캘프가 수익 나나?
 *   RR 3의 본전 승률 = 1/(1+3) = 25% (수수료 전). 실제 승률이 이걸 넘나?
 *
 * 방법: 방향 있는 과거 시나리오 진입점마다, 손절/목표를 고정 0.5%/1.5%로 덮어씌워
 *   5분봉으로 먼저 닿은 것 판정. 승률 + 수수료 차감 순기대값 측정.
 *   (동봉 동시터치 = 보수적 손절)
 *
 * 실행: node scripts/backtest-scalp-rr3.mjs
 */
import { readFileSync } from "node:fs";
const env = {};
for (const l of readFileSync("D:/web01/.env.local", "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const base = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY || "";

const STOP_PCT = 0.5, TARGET_PCT = 1.5;  // RR = 3
const RR = TARGET_PCT / STOP_PCT;
const WINDOW_BARS = 288;                  // 24h of 5m
// VIP0 요율. BNB 할인 시 ×0.9.
const TAKER = 0.05, MAKER = 0.02;

async function fetchAll() {
  const out = []; let off = 0;
  for (;;) {
    const u = `${base}/rest/v1/scenario_outcomes?select=symbol,style,direction,created_at&or=(direction.eq.long,direction.eq.short)&order=created_at.asc&limit=1000&offset=${off}`;
    const r = await fetch(u, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const b = await r.json(); out.push(...b);
    if (b.length < 1000) break; off += 1000;
  }
  return out;
}
async function klines(sym, start, end) {
  const s = sym.endsWith("USDT") ? sym : `${sym}USDT`;
  const u = `https://fapi.binance.com/fapi/v1/klines?symbol=${s}&interval=5m&startTime=${start}&endTime=${end}&limit=${WINDOW_BARS}`;
  const r = await fetch(u); if (!r.ok) return [];
  const k = await r.json(); return Array.isArray(k) ? k : [];
}

// 진입=첫 봉 시가, 손절/목표 고정 % → {r, exit} | null
function sim(dir, bars) {
  if (bars.length < 2) return null;
  const d = dir === "short" ? -1 : 1;
  const entry = +bars[0][1];
  if (!entry) return null;
  const stop = d === 1 ? entry * (1 - STOP_PCT / 100) : entry * (1 + STOP_PCT / 100);
  const tgt = d === 1 ? entry * (1 + TARGET_PCT / 100) : entry * (1 - TARGET_PCT / 100);
  for (const b of bars) {
    const hi = +b[2], lo = +b[3];
    const hitStop = d === 1 ? lo <= stop : hi >= stop;
    const hitTgt = d === 1 ? hi >= tgt : lo <= tgt;
    if (hitStop) return { r: -1, exit: "stop" };       // 보수적: 동봉이면 손절 우선
    if (hitTgt) return { r: RR, exit: "target" };
  }
  const last = +bars[bars.length - 1][4];
  return { r: ((d === 1 ? last - entry : entry - last) / entry) * 100 / STOP_PCT, exit: "timeout" };
}

// 순기대값: 진입(시장=taker/지정=maker) + 청산(목표=maker/손절·타임아웃=taker), 수수료를 R로 환산(÷STOP_PCT)
function netExp(results, { entryMaker, bnb }) {
  const disc = bnb ? 0.9 : 1;
  const inFee = (entryMaker ? MAKER : TAKER) * disc;
  return results.map((x) => {
    const outFee = (x.exit === "target" ? MAKER : TAKER) * disc;
    return x.r - (inFee + outFee) / STOP_PCT;
  });
}
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
function line(name, results) {
  if (!results.length) { console.log(`  ${name.padEnd(16)} 0건`); return; }
  const wins = results.filter((x) => x.exit === "target").length;
  const tos = results.filter((x) => x.exit === "timeout").length;
  const gross = mean(results.map((x) => x.r));
  const vip0mkt = mean(netExp(results, { entryMaker: false, bnb: false }));
  const vip0lim = mean(netExp(results, { entryMaker: true, bnb: false }));
  const bnblim = mean(netExp(results, { entryMaker: true, bnb: true }));
  console.log(`  ${name.padEnd(16)} n=${String(results.length).padStart(3)} 승률 ${(wins / results.length * 100).toFixed(0)}% (타임아웃 ${(tos / results.length * 100).toFixed(0)}%)  gross ${gross >= 0 ? "+" : ""}${gross.toFixed(3)}R`);
  console.log(`  ${" ".padEnd(16)}   순기대값 → 시장가진입 ${vip0mkt >= 0 ? "+" : ""}${vip0mkt.toFixed(3)}R · 지정가진입 ${vip0lim >= 0 ? "+" : ""}${vip0lim.toFixed(3)}R · 지정가+BNB ${bnblim >= 0 ? "+" : ""}${bnblim.toFixed(3)}R`);
}

const rows = await fetchAll();
console.log(`손절 ${STOP_PCT}% / 익절 ${TARGET_PCT}% (RR ${RR}) — 본전 승률 ${(100 / (1 + RR)).toFixed(0)}% (수수료 전)\n방향 시나리오 ${rows.length}개에 씌워 5분봉 시뮬 중...\n`);
const res = []; let done = 0, skip = 0;
for (const sc of rows) {
  const start = new Date(sc.created_at).getTime();
  const end = start + WINDOW_BARS * 3e5;
  let bars; try { bars = await klines(sc.symbol, start, end); } catch { skip++; continue; }
  const s = sim(sc.direction, bars);
  if (!s) { skip++; continue; }
  res.push({ ...sc, ...s });
  if (++done % 60 === 0) process.stdout.write(`  ...${done}\n`);
  await new Promise((z) => setTimeout(z, 30));
}
console.log(`\n시뮬 ${done}건 (스킵 ${skip})\n`);
console.log("════ 손절 0.5% / 익절 1.5% (RR 3) 성적 ════");
line("전체", res);
console.log("\n[스타일별]");
for (const st of ["scalp", "day", "swing", "position"]) line(st, res.filter((x) => x.style === st));
console.log(`\n해석: 승률이 25%(본전선)를 못 넘거나, 순기대값이 −면 → RR 높여도 안 됨(좁은 손절이 노이즈에 잘림).`);
