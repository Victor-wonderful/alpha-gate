// READ-ONLY — dump recent analyses incl. drop reasons + noEntry to verify the filter.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await sb
  .from("analyses")
  .select("created_at, symbol, style, primary_strategy, strategy_direction, strategy_confidence, scenarios_count, current_price, report")
  .order("created_at", { ascending: false })
  .limit(10);

if (error) { console.error(error.message); process.exit(1); }

for (const a of data) {
  const r = a.report || {};
  const scns = r.scenarios || [];
  const dropWarns = (r.warnings || []).filter((w) => w.startsWith("시나리오 제외"));
  console.log("─".repeat(74));
  console.log(`${a.created_at}  ${a.symbol} [${a.style}]  price=${a.current_price}`);
  console.log(`  strategy : ${a.primary_strategy} ${a.strategy_direction ?? ""} conf=${a.strategy_confidence}  → kept=${scns.length}`);
  if (r.noEntry) console.log(`  noEntry  : kind=${r.noEntry.kind} dir=${r.noEntry.direction}`);
  if (dropWarns.length) {
    console.log(`  DROPPED (${dropWarns.length}):`);
    for (const w of dropWarns) console.log(`     ✗ ${w.replace("시나리오 제외: ", "")}`);
  } else if (scns.length === 0) {
    console.log(`  ⚠ kept=0 BUT no drop warnings → LLM produced 0 scenarios itself (genuine wait?)`);
  }
  scns.forEach((s, i) => {
    const stopPct = ((Math.abs((s.entryZone.low + s.entryZone.high) / 2 - s.invalidation) / ((s.entryZone.low + s.entryZone.high) / 2)) * 100).toFixed(2);
    console.log(`     ✓ S${i + 1} ${s.direction} entryType=${s.entryType} stop≈${stopPct}% issues=${(s.qualityIssues || []).length}`);
  });
}
