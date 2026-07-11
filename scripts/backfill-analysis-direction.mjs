/**
 * 기존 analyses의 strategy_direction 백필 — null(양방향)로 저장됐지만 시나리오가 단일 방향이면 그 방향으로.
 * (코드 폴백이 추세 불명확 시 direction=null로 저장하던 과거 행 정정.)
 * 실행: node scripts/backfill-analysis-direction.mjs
 */
import { readFileSync } from "node:fs";

const t = readFileSync("D:/web01/.env.local", "utf8");
const env = {};
for (const l of t.split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const base = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!base || !key) { console.error("Supabase 키 누락"); process.exit(1); }
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

function singleDir(report) {
  const scen = report?.scenarios;
  if (!Array.isArray(scen) || scen.length === 0) return null;
  const dirs = new Set(scen.map((s) => s?.direction).filter(Boolean));
  return dirs.size === 1 ? [...dirs][0] : null;
}

async function main() {
  // strategy_direction이 null인 행만, report 포함해서 조회.
  const url = `${base}/rest/v1/analyses?select=id,report&strategy_direction=is.null&limit=2000`;
  const res = await fetch(url, { headers: H });
  if (!res.ok) { console.error("조회 실패", res.status, (await res.text()).slice(0, 200)); process.exit(1); }
  const rows = await res.json();
  console.log(`strategy_direction=null 행: ${rows.length}건`);

  let updated = 0, skipped = 0;
  for (const r of rows) {
    const dir = singleDir(r.report);
    if (!dir) { skipped++; continue; } // 혼합/없음 = 진짜 양방향 → 유지
    const up = await fetch(`${base}/rest/v1/analyses?id=eq.${r.id}`, {
      method: "PATCH",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({ strategy_direction: dir }),
    });
    if (up.ok) updated++;
    else { console.error("업데이트 실패", r.id, up.status); }
  }
  console.log(`✅ 방향 복원: ${updated}건 · 양방향 유지(혼합/없음): ${skipped}건`);
}
main().catch((e) => { console.error(e); process.exit(1); });
