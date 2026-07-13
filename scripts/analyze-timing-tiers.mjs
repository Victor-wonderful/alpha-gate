// 시간대(유동성 구간)별 시나리오 성과 검증 — analysis-timing-hint의 구간 정의가
// 실제 데이터와 맞는지 확인. (2026-07-13, 세션 휴리스틱 → 데이터 검증)
//
// 구간 정의 (sessions.ts와 동일, KST):
//   golden 22:30~01:00 / active 16:00~22:30 + 01:00~05:00 / quiet 09:00~16:00 / dead 05:00~09:00
//   funding ±10분 (01/09/17시) 별도 플래그.
//
// 실행: node scripts/analyze-timing-tiers.mjs

import { readFileSync } from "node:fs";

// .env.local — 중복 키(첫 줄 빈 값) 함정 대응: 마지막 비어있지 않은 값 사용.
function loadEnv() {
  const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (!m) continue;
    const v = m[2].replace(/^["']|["']$/g, "").trim();
    if (v) out[m[1]] = v;
  }
  return out;
}

const env = loadEnv();
const URL_BASE = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error("SUPABASE URL / SERVICE_ROLE_KEY 없음");
  process.exit(1);
}

async function fetchAll() {
  const rows = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const r = await fetch(
      `${URL_BASE}/rest/v1/scenario_outcomes?select=created_at,status,result_r,style,direction,strategy_primary,symbol&order=created_at.asc`,
      {
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          Range: `${from}-${from + page - 1}`,
        },
      },
    );
    if (!r.ok) throw new Error(`fetch ${r.status}: ${await r.text()}`);
    const batch = await r.json();
    rows.push(...batch);
    if (batch.length < page) break;
  }
  return rows;
}

function kstMinute(iso) {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600_000);
  return { min: kst.getUTCHours() * 60 + kst.getUTCMinutes(), hour: kst.getUTCHours() };
}

function inRange(t, a, b) {
  return a < b ? t >= a && t < b : t >= a || t < b;
}

function tierOf(totalMin) {
  if (inRange(totalMin, 22 * 60 + 30, 60)) return "golden";
  if (inRange(totalMin, 5 * 60, 9 * 60)) return "dead";
  if (inRange(totalMin, 16 * 60, 22 * 60 + 30) || inRange(totalMin, 60, 5 * 60)) return "active";
  return "quiet";
}

function inFunding(totalMin) {
  return [60, 540, 1020].some((fm) => {
    const d = Math.min(Math.abs(totalMin - fm), Math.abs(totalMin - fm - 1440), Math.abs(totalMin - fm + 1440));
    return d <= 10;
  });
}

function agg(rows) {
  const s = { n: 0, target: 0, stop: 0, expired: 0, pending: 0, triggered: 0, rSum: 0, rN: 0 };
  for (const r of rows) {
    s.n++;
    s[r.status] = (s[r.status] ?? 0) + 1;
    if ((r.status === "target" || r.status === "stop") && r.result_r != null) {
      s.rSum += Number(r.result_r);
      s.rN++;
    }
  }
  const decided = s.target + s.stop;
  return {
    n: s.n,
    decided,
    winRate: decided ? s.target / decided : null,
    avgR: s.rN ? s.rSum / s.rN : null,
    trigRate: s.n ? (decided + s.triggered) / s.n : null,
    expired: s.expired,
  };
}

function fmt(a) {
  const pct = (x) => (x == null ? "  —  " : `${(x * 100).toFixed(0).padStart(3)}%`);
  const r = (x) => (x == null ? "   —  " : `${x >= 0 ? "+" : ""}${x.toFixed(3)}`);
  return `n=${String(a.n).padStart(4)}  결정=${String(a.decided).padStart(4)}  승률=${pct(a.winRate)}  평균R=${r(a.avgR)}  트리거율=${pct(a.trigRate)}  만료=${a.expired}`;
}

const rows = await fetchAll();
console.log(`전체 시나리오: ${rows.length}건\n`);

const enriched = rows.map((r) => {
  const { min, hour } = kstMinute(r.created_at);
  return { ...r, tier: tierOf(min), funding: inFunding(min), hour };
});

console.log("── 유동성 구간별 (전체 스타일) ──────────────────────────────");
for (const tier of ["golden", "active", "quiet", "dead"]) {
  console.log(`${tier.padEnd(7)} ${fmt(agg(enriched.filter((r) => r.tier === tier)))}`);
}
console.log(`funding ${fmt(agg(enriched.filter((r) => r.funding)))}   (±10분, 구간과 중복)`);

console.log("\n── 스캘핑만 (타이밍 민감 스타일) ────────────────────────────");
const scalp = enriched.filter((r) => r.style === "scalp");
for (const tier of ["golden", "active", "quiet", "dead"]) {
  console.log(`${tier.padEnd(7)} ${fmt(agg(scalp.filter((r) => r.tier === tier)))}`);
}

console.log("\n── 스타일별 전체 (참고: 표본 분포) ──────────────────────────");
for (const st of ["scalp", "day", "swing", "position"]) {
  console.log(`${st.padEnd(8)} ${fmt(agg(enriched.filter((r) => r.style === st)))}`);
}

console.log("\n── KST 시간대 히스토그램 (2시간 버킷, 전체) ─────────────────");
for (let h = 0; h < 24; h += 2) {
  const bucket = enriched.filter((r) => r.hour >= h && r.hour < h + 2);
  const a = agg(bucket);
  const bar = "█".repeat(Math.round((a.decided / Math.max(1, rows.length)) * 200));
  console.log(
    `${String(h).padStart(2, "0")}~${String(h + 2).padStart(2, "0")}시  n=${String(a.n).padStart(4)} 결정=${String(a.decided).padStart(3)} 승률=${a.winRate == null ? " — " : (a.winRate * 100).toFixed(0) + "%"} 평균R=${a.avgR == null ? "  —  " : (a.avgR >= 0 ? "+" : "") + a.avgR.toFixed(2)} ${bar}`,
  );
}
