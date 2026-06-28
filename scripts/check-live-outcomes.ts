/**
 * 라이브 시나리오 성적표 — scenario_outcomes(실제 AI 시나리오 결과)를 metrics로 측정.
 * "그동안 나온 시나리오가 진짜로 먹혔나?"의 답.
 *
 * 실행: pnpm exec tsx scripts/check-live-outcomes.ts
 */
import { readFileSync } from "node:fs";
import { type Trade, winRate, expectancyR, profitFactor, evaluateGate, walkForwardGate } from "../src/lib/backtest/metrics";

// .env.local 파싱 (시크릿 출력 안 함). 워크트리엔 없고 메인 체크아웃에 있음.
const ENV_PATHS = ["D:/web01/.env.local", ".env.local"];
let envText = "";
for (const p of ENV_PATHS) { try { envText = readFileSync(p, "utf8"); break; } catch { /* next */ } }
if (!envText) { console.error(".env.local 못 찾음"); process.exit(1); }
const env: Record<string, string> = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const base = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!base || !key) { console.error("Supabase URL/Service key 누락"); process.exit(1); }

interface Row { status: string; result_r: number | null; style: string | null; strategy_primary: string | null; direction: string | null; symbol: string | null; entry_price: number | null; triggered_at: string | null; created_at: string | null; }

async function fetchAll(): Promise<Row[]> {
  const out: Row[] = [];
  let offset = 0;
  for (;;) {
    const url = `${base}/rest/v1/scenario_outcomes?select=status,result_r,style,strategy_primary,direction,symbol,entry_price,triggered_at,created_at&order=created_at.asc&limit=1000&offset=${offset}`;
    const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) { console.error("조회 실패", res.status, (await res.text()).slice(0, 200)); process.exit(1); }
    const batch = (await res.json()) as Row[];
    out.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  return out;
}

function toTrades(rows: Row[]): Trade[] {
  return rows
    .filter((r) => (r.status === "target" || r.status === "stop") && r.result_r != null)
    .map((r) => ({ rMultiple: Number(r.result_r), retPct: 0, barsHeld: 0, entryTs: r.triggered_at ?? r.created_at ?? "" }));
}

function report(name: string, t: Trade[]) {
  if (t.length < 1) { console.log(`  ${name}: 0건`); return; }
  const g = evaluateGate(t), wf = walkForwardGate(t);
  const pass = t.length >= 20 ? (g.passed && wf.passed ? "✅" : "❌") : "(표본부족)";
  console.log(`  ${name}: n=${t.length} 승률=${((winRate(t) ?? 0) * 100).toFixed(0)}% 기대값=${(expectancyR(t) ?? 0).toFixed(3)}R PF=${(profitFactor(t) ?? 0).toFixed(2)} ${pass}`);
}

async function main() {
  const rows = await fetchAll();
  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  console.log(`총 시나리오: ${rows.length}건`);
  console.log("상태 분포:", Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(" · "));

  const resolved = rows.filter((r) => r.status === "target" || r.status === "stop");
  console.log(`\n해결된(목표/손절) 시나리오: ${resolved.length}건 — 아래는 실제 result_r 기준 (수수료 미차감 gross)`);
  if (resolved.length === 0) { console.log("\n⚠️ 아직 해결된 시나리오가 없음 → 표본 0. 더 써서 쌓아야 판단 가능."); return; }

  report("전체", toTrades(rows));
  console.log("\n[스타일별]");
  for (const s of ["scalp", "day", "swing", "position"]) report(s.padEnd(9), toTrades(rows.filter((r) => r.style === s)));
  console.log("\n[전략별]");
  const strats = Array.from(new Set(rows.map((r) => r.strategy_primary).filter(Boolean)));
  for (const s of strats) report(String(s).padEnd(18), toTrades(rows.filter((r) => r.strategy_primary === s)));
  console.log("\n[방향별]");
  for (const d of ["long", "short"]) report(d.padEnd(9), toTrades(rows.filter((r) => r.direction === d)));
  console.log("\n주의: 라이브 추적은 5분 스냅샷·단일 entry·gross R(수수료 미차감). 백테스트와 직접 비교 시 감안.");

  // ── 만료 분석 — "왜 진입 안 됐나" ──
  const nonPending = rows.filter((r) => r.status !== "pending");
  const expired = rows.filter((r) => r.status === "expired");
  console.log(`\n\n════ 만료 분석 (진입 못 한 시나리오) ════`);
  console.log(`트리거율: ${nonPending.length ? ((1 - expired.length / nonPending.length) * 100).toFixed(0) : "?"}% (대기제외 ${nonPending.length}건 중 ${nonPending.length - expired.length}건만 진입, ${expired.length}건 만료)`);

  const grp = (rows2: Row[], key: keyof Row) => {
    const m: Record<string, { exp: number; tot: number }> = {};
    for (const r of rows2) { const k = String(r[key] ?? "?"); m[k] = m[k] ?? { exp: 0, tot: 0 }; m[k].tot++; if (r.status === "expired") m[k].exp++; }
    return m;
  };
  for (const key of ["style", "strategy_primary", "direction"] as (keyof Row)[]) {
    console.log(`\n[${key} 별 만료율]`);
    const m = grp(nonPending, key);
    for (const [k, v] of Object.entries(m)) console.log(`  ${k.padEnd(18)}: 만료 ${v.exp}/${v.tot} (${((v.exp / v.tot) * 100).toFixed(0)}%)`);
  }

  // 진입가가 생성 시점 시세에서 얼마나 멀었나 (만료건만, Binance 과거 시세 조회)
  console.log(`\n[만료건 진입가 거리 — 생성 시점 시세 대비]`);
  const distByStyle: Record<string, number[]> = {};
  for (const r of expired) {
    if (!r.symbol || !r.entry_price || !r.created_at) continue;
    const sym = r.symbol.endsWith("USDT") ? r.symbol : `${r.symbol}USDT`;
    const t = new Date(r.created_at).getTime();
    try {
      const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=1h&startTime=${t}&limit=1`);
      if (!res.ok) continue;
      const k = (await res.json()) as number[][];
      if (!k.length) continue;
      const mkt = +k[0][4]; // 생성 시점 1h 종가 ≈ 당시 시세
      if (mkt > 0) { const d = ((r.entry_price - mkt) / mkt) * 100; (distByStyle[r.style ?? "?"] ??= []).push(d); }
    } catch { /* skip */ }
    await new Promise((rr) => setTimeout(rr, 50));
  }
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  for (const [st, arr] of Object.entries(distByStyle)) {
    const absMed = med(arr.map(Math.abs));
    console.log(`  ${st.padEnd(9)}: n=${arr.length} 진입가 거리 중앙값 ${absMed.toFixed(2)}% (부호중앙 ${med(arr).toFixed(2)}% — 음수=하락대기/양수=상승대기)`);
  }
  console.log("\n해석: 진입가 거리가 그 스타일의 도달 한도(스캘프 ±0.4%/스윙 ±4~5%)보다 크면 → 가격이 안 와서 만료.");
}
main().catch((e) => { console.error(e); process.exit(1); });
