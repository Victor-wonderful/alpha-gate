// READ-ONLY 진단 — "분석 후 거래하면 손실이 많다"의 원인 추적.
// 종료된 trades를 등급/방향/스타일/청산사유/주문유형/모드별로 분해해 승률·기대값R·PF 출력.
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const base = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!base || !key) { console.error("Supabase URL/Service key 누락"); process.exit(1); }

async function fetchAll() {
  const out = [];
  let offset = 0;
  for (;;) {
    const url = `${base}/rest/v1/trades?select=*&result_r=not.is.null&order=created_at.asc&limit=1000&offset=${offset}`;
    const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) { console.error("조회 실패", res.status, (await res.text()).slice(0, 300)); process.exit(1); }
    const batch = await res.json();
    out.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  return out;
}

const num = (x) => (x == null ? null : Number(x));
function stats(rows) {
  const rs = rows.map((r) => num(r.result_r)).filter((x) => x != null && !Number.isNaN(x));
  if (!rs.length) return null;
  const wins = rs.filter((r) => r > 0).length;
  const sum = rs.reduce((a, b) => a + b, 0);
  const grossWin = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(rs.filter((r) => r < 0).reduce((a, b) => a + b, 0));
  return {
    n: rs.length,
    win: wins / rs.length,
    exp: sum / rs.length,
    total: sum,
    pf: grossLoss ? grossWin / grossLoss : Infinity,
  };
}
function line(name, rows) {
  const s = stats(rows);
  if (!s) { console.log(`  ${name.padEnd(22)} 0건`); return; }
  console.log(
    `  ${name.padEnd(22)} n=${String(s.n).padStart(4)}  승률 ${(s.win * 100).toFixed(0).padStart(3)}%  기대값 ${s.exp >= 0 ? "+" : ""}${s.exp.toFixed(3)}R  누적 ${s.total >= 0 ? "+" : ""}${s.total.toFixed(1)}R  PF ${s.pf === Infinity ? "∞" : s.pf.toFixed(2)}`
  );
}
function group(rows, keyFn) {
  const m = new Map();
  for (const r of rows) { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
}

const all = await fetchAll();
console.log(`\n종료된 거래(result_r 있음) 총 ${all.length}건\n`);

// 모드 분리 — 백테스트는 자동시뮬이라 "실제로 넣은 거래"와 성격 다름
for (const [mode, rows] of group(all, (r) => r.mode ?? "?")) {
  console.log(`\n════════ mode=${mode} (${rows.length}건) ════════`);
  line("전체", rows);
  console.log("\n[등급별]");
  for (const g of ["A", "B", "C", "D"]) line(`등급 ${g}`, rows.filter((r) => r.pre_grade === g));
  console.log("\n[방향별]");
  for (const d of ["long", "short"]) line(d, rows.filter((r) => r.direction === d));
  console.log("\n[청산사유별]");
  for (const [k, v] of group(rows, (r) => r.exit_reason ?? "?")) line(`exit=${k}`, v);
  console.log("\n[주문유형별]");
  for (const [k, v] of group(rows, (r) => r.order_type ?? "?")) line(`order=${k}`, v);
  console.log("\n[스타일별(있으면)]");
  for (const [k, v] of group(rows, (r) => r.style ?? r.timeframe ?? "?")) line(String(k), v);
}

// 실제로 "넣은" 거래에 집중: live 모드만
const live = all.filter((r) => (r.mode ?? "live") === "live");
console.log(`\n\n════════ LIVE(수동/실거래 기록)만 상세 ${live.length}건 ════════`);
line("live 전체", live);

// 등급×방향 교차
console.log("\n[등급 × 방향]");
for (const g of ["A", "B", "C", "D"])
  for (const d of ["long", "short"]) {
    const sub = live.filter((r) => r.pre_grade === g && r.direction === d);
    if (sub.length) line(`${g} · ${d}`, sub);
  }

// R:R 계획 대비 실현 — 손절 폭이 계획보다 나빴나 (슬리피지/수수료)
console.log("\n[슬리피지·수수료 흔적] entry_slippage / exit_slippage / fees (평균 %)");
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);
const eslip = live.map((r) => num(r.entry_slippage_pct)).filter((x) => x != null);
const xslip = live.map((r) => num(r.exit_slippage_pct)).filter((x) => x != null);
const fees = live.map((r) => num(r.fees_pct)).filter((x) => x != null);
console.log(`  진입슬립 평균 ${avg(eslip).toFixed(4)}% (n=${eslip.length}) · 청산슬립 평균 ${avg(xslip).toFixed(4)}% (n=${xslip.length}) · 수수료 평균 ${avg(fees).toFixed(4)}% (n=${fees.length})`);

// 최근 20건 원장
console.log("\n[최근 20건 원장]");
for (const r of live.slice(-20)) {
  console.log(
    `  ${(r.closed_at ?? r.created_at ?? "").slice(0, 16)}  ${String(r.symbol).padEnd(10)} ${String(r.direction).padEnd(5)} ${r.pre_grade} order=${String(r.order_type ?? "?").padEnd(6)} exit=${String(r.exit_reason ?? "?").padEnd(6)} R=${num(r.result_r)?.toFixed(2)}`
  );
}
