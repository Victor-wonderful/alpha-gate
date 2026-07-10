/**
 * 진입 즉시화 수정 — 과거 데이터 반사실(counterfactual) 백테스트. LLM/토큰 0.
 *
 * 질문: 6/28 수정("강한 추세는 되돌림 대기 말고 현재가 즉시 진입")이 있었다면,
 *       그동안 "가격이 안 와서 만료된(진입 실패)" 시나리오들이 실제로 돈이 됐을까?
 *
 * 방법: 만료건마다 생성 시점 현재가에 즉시 진입했다고 가정(손절·목표는 원본 유지),
 *       Binance 과거 봉으로 손절/목표 중 먼저 닿은 것 판정 → 실제 R 계산.
 *       즉시 진입은 100% 체결되지만 진입가가 나빠져 RR이 낮아짐 → 그 트레이드오프를 그대로 측정.
 *
 * 실행: node scripts/sim-immediate-entry.mjs
 */
import { readFileSync } from "node:fs";

const t = readFileSync("D:/web01/.env.local", "utf8");
const env = {};
for (const l of t.split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const base = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!base || !key) { console.error("Supabase 키 누락"); process.exit(1); }

// 스타일별 시뮬 봉 간격 (해상도 vs 요청수 균형)
const INTERVAL = { scalp: "5m", day: "15m", swing: "1h", position: "4h" };
const MS = { "5m": 3e5, "15m": 9e5, "1h": 36e5, "4h": 144e5 };

async function fetchAll() {
  const out = []; let off = 0;
  for (;;) {
    const u = `${base}/rest/v1/scenario_outcomes?select=symbol,style,strategy_primary,direction,entry_price,stop_price,target_price,status,created_at,expires_at&status=eq.expired&order=created_at.asc&limit=1000&offset=${off}`;
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
  for (let guard = 0; guard < 6 && cur < end; guard++) {
    const u = `https://fapi.binance.com/fapi/v1/klines?symbol=${s}&interval=${interval}&startTime=${cur}&endTime=${end}&limit=1500`;
    const r = await fetch(u); if (!r.ok) break;
    const k = await r.json(); if (!Array.isArray(k) || !k.length) break;
    out.push(...k);
    if (k.length < 1500) break;
    cur = k[k.length - 1][0] + 1;
    await new Promise((z) => setTimeout(z, 40));
  }
  return out; // [openTime, o, h, l, c, ...]
}

// 한 시나리오를 즉시진입으로 시뮬 → { r, exit } | null
function simulate(sc, bars) {
  if (!bars.length) return null;
  const dir = sc.direction === "short" ? -1 : 1;
  const entry = +bars[0][1]; // 생성 시점 현재가 ≈ 첫 봉 시가
  const stop = +sc.stop_price, target = +sc.target_price;
  if (!entry || !stop || !target) return null;
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return null;
  // 즉시 진입이 이미 손절/목표 반대편이면(가격이 이미 지나감) 스킵 — 무효 셋업
  if (dir === 1 && (stop >= entry || target <= entry)) return null;
  if (dir === -1 && (stop <= entry || target >= entry)) return null;

  for (const b of bars) {
    const hi = +b[2], lo = +b[3];
    const hitStop = dir === 1 ? lo <= stop : hi >= stop;
    const hitTgt = dir === 1 ? hi >= target : lo <= target;
    if (hitStop && hitTgt) return { r: -1, exit: "stop(동봉·보수)" }; // 보수적: 손절 우선
    if (hitStop) return { r: -1, exit: "stop" };
    if (hitTgt) return { r: Math.abs(target - entry) / risk, exit: "target" };
  }
  // 만기까지 미도달 → 마지막 종가에서 시간청산
  const last = +bars[bars.length - 1][4];
  return { r: (dir === 1 ? last - entry : entry - last) / risk, exit: "timeout" };
}

const stat = (arr) => {
  if (!arr.length) return null;
  const n = arr.length, wins = arr.filter((r) => r > 0).length;
  const sum = arr.reduce((a, b) => a + b, 0);
  const gp = arr.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const gl = -arr.filter((r) => r < 0).reduce((a, b) => a + b, 0);
  return { n, win: wins / n, exp: sum / n, pf: gl > 0 ? gp / gl : Infinity };
};
const fmt = (s) => s ? `n=${String(s.n).padStart(3)} 승률=${(s.win * 100).toFixed(0).padStart(3)}% 기대값=${s.exp >= 0 ? "+" : ""}${s.exp.toFixed(3)}R PF=${s.pf === Infinity ? "∞" : s.pf.toFixed(2)}` : "n=0";

async function main() {
  const rows = await fetchAll();
  console.log(`만료 시나리오: ${rows.length}건 — 각각 "즉시진입 했다면?" 시뮬 중...\n`);
  const results = [];
  let done = 0, skipped = 0;
  for (const sc of rows) {
    const interval = INTERVAL[sc.style] || "1h";
    const start = new Date(sc.created_at).getTime();
    const end = Math.min(new Date(sc.expires_at).getTime(), start + 1500 * MS[interval] * 6);
    if (!(end > start)) { skipped++; continue; }
    let bars;
    try { bars = await klines(sc.symbol, interval, start, end); } catch { skipped++; continue; }
    const sim = simulate(sc, bars);
    if (!sim) { skipped++; continue; }
    results.push({ ...sc, ...sim });
    done++;
    if (done % 40 === 0) process.stdout.write(`  ...${done}건 완료\n`);
  }
  console.log(`\n시뮬 완료: ${done}건 (스킵 ${skipped}건 — 데이터없음/무효셋업)\n`);

  const R = results.map((x) => x.r);
  console.log("════ 반사실 결과: '만료건을 전부 즉시진입 했다면' ════");
  console.log("전체     :", fmt(stat(R)));
  console.log("  (실제로는 이 거래들 전부 진입 실패=미실현. 즉시진입=100% 체결 가정)\n");

  console.log("[청산 사유 분포]");
  const byExit = {};
  for (const x of results) { const k = x.exit.startsWith("stop") ? "stop" : x.exit; byExit[k] = (byExit[k] || 0) + 1; }
  for (const [k, v] of Object.entries(byExit)) console.log(`  ${k.padEnd(14)}: ${v}건 (${(v / done * 100).toFixed(0)}%)`);

  console.log("\n[스타일별]");
  for (const s of ["scalp", "day", "swing", "position"]) console.log(`  ${s.padEnd(9)}:`, fmt(stat(results.filter((x) => x.style === s).map((x) => x.r))));
  console.log("\n[전략별]");
  for (const s of [...new Set(results.map((x) => x.strategy_primary))]) console.log(`  ${String(s).padEnd(18)}:`, fmt(stat(results.filter((x) => x.strategy_primary === s).map((x) => x.r))));
  console.log("\n[방향별]");
  for (const d of ["long", "short"]) console.log(`  ${d.padEnd(9)}:`, fmt(stat(results.filter((x) => x.direction === d).map((x) => x.r))));

  console.log("\n해석:");
  console.log("  • 기대값 > 0 → 즉시진입이 '놓친 기회'를 실제 수익으로 바꿨음 = 수정이 옳음.");
  console.log("  • 기대값 < 0 → 되돌림 대기가 사실은 손실을 걸러준 것 = 즉시진입은 위험.");
  console.log("  주의: gross R(수수료 미차감), 트렌드 강도 미저장이라 strong만 필터 불가(전략별로 대리 관찰).");
}
main().catch((e) => { console.error(e); process.exit(1); });
