// READ-ONLY 후속 진단 — 아웃라이어 격리 + 시간분할(코드폴백 전후) + 최근 손실 집중.
import { readFileSync } from "node:fs";
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const base = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
async function fetchAll() {
  const out = []; let offset = 0;
  for (;;) {
    const url = `${base}/rest/v1/trades?select=*&result_r=not.is.null&mode=eq.live&order=created_at.asc&limit=1000&offset=${offset}`;
    const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const batch = await res.json(); out.push(...batch);
    if (batch.length < 1000) break; offset += 1000;
  }
  return out;
}
const num = (x) => (x == null ? null : Number(x));
function stats(rows) {
  const rs = rows.map((r) => num(r.result_r)).filter((x) => x != null && !Number.isNaN(x));
  if (!rs.length) return null;
  const wins = rs.filter((r) => r > 0).length, sum = rs.reduce((a, b) => a + b, 0);
  const gw = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const gl = Math.abs(rs.filter((r) => r < 0).reduce((a, b) => a + b, 0));
  return { n: rs.length, win: wins / rs.length, exp: sum / rs.length, total: sum, pf: gl ? gw / gl : Infinity };
}
function line(name, rows) {
  const s = stats(rows);
  if (!s) { console.log(`  ${name.padEnd(24)} 0건`); return; }
  console.log(`  ${name.padEnd(24)} n=${String(s.n).padStart(4)}  승률 ${(s.win*100).toFixed(0).padStart(3)}%  기대값 ${s.exp>=0?"+":""}${s.exp.toFixed(3)}R  누적 ${s.total>=0?"+":""}${s.total.toFixed(1)}R  PF ${s.pf===Infinity?"∞":s.pf.toFixed(2)}`);
}

const all = await fetchAll();

// 1) 아웃라이어 격리 — |R|>3 은 정상 거래에서 거의 안 나옴(계획 RR 대개 1.3~3)
console.log("═══ 1) |R|>3 아웃라이어 (데이터 오염 의심) ═══");
const outliers = all.filter((r) => Math.abs(num(r.result_r)) > 3);
for (const r of outliers) console.log(`  ${(r.closed_at??"").slice(0,16)} ${String(r.symbol).padEnd(9)} ${r.direction} ${r.pre_grade} order=${r.order_type} exit=${r.exit_reason} R=${num(r.result_r).toFixed(1)}  entry=${r.entry} exit=${r.exit_price} stop=${r.stop}`);
console.log(`  → ${outliers.length}건. 이걸 빼고 다시 집계하면 진짜 성적이 보임.`);

const clean = all.filter((r) => Math.abs(num(r.result_r)) <= 3);
console.log(`\n═══ 2) 아웃라이어 제외(|R|≤3) 정상 거래 ${clean.length}건 ═══`);
line("전체(clean)", clean);
console.log("\n[등급별]");
for (const g of ["A","B","C","D"]) line(`등급 ${g}`, clean.filter((r)=>r.pre_grade===g));
console.log("\n[주문유형별]");
for (const o of ["market","limit","stop"]) line(`order=${o}`, clean.filter((r)=>r.order_type===o));
console.log("\n[청산사유별]");
for (const e of ["target","stop","manual"]) line(`exit=${e}`, clean.filter((r)=>r.exit_reason===e));

// 3) 시간분할 — 7/10 = ANTHROPIC_API_KEY 무효화(코드 폴백 시작) 경계
console.log("\n═══ 3) 시간분할 (경계 2026-07-10 = AI키무효/코드폴백 시작) ═══");
const cut = new Date("2026-07-10T00:00:00Z").getTime();
const t = (r) => new Date(r.created_at).getTime();
line("폴백 이전 (~7/09, AI)", clean.filter((r)=>t(r)<cut));
line("폴백 이후 (7/10~, 코드)", clean.filter((r)=>t(r)>=cut));
console.log("\n  [폴백 이후만 등급별]");
for (const g of ["A","B","C","D"]) line(`  등급 ${g}`, clean.filter((r)=>t(r)>=cut && r.pre_grade===g));
console.log("  [폴백 이후만 주문유형별]");
for (const o of ["market","limit","stop"]) line(`  order=${o}`, clean.filter((r)=>t(r)>=cut && r.order_type===o));

// 4) 월별 추이
console.log("\n═══ 4) 월별 추이 (clean) ═══");
const bym = new Map();
for (const r of clean) { const k=(r.created_at??"").slice(0,7); if(!bym.has(k))bym.set(k,[]); bym.get(k).push(r); }
for (const [k,v] of [...bym.entries()].sort()) line(k, v);
