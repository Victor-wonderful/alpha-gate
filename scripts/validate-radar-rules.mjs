import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = {};
for (const line of readFileSync("D:/web01/.env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await sb.from("analyses").select("strategy_direction,snapshot,report").not("strategy_direction","is",null);
const rows = data.filter(a => a.strategy_direction==="long"||a.strategy_direction==="short");
const N = rows.length;

// marketTrend.direction 분포
const dist = {};
for (const a of rows) { const d=a.report?.marketTrend?.direction ?? "null"; dist[d]=(dist[d]||0)+1; }
console.log("marketTrend.direction 분포:", JSON.stringify(dist));
// trendMetrics.classification 분포
const dist2 = {};
for (const a of rows) { const d=a.snapshot?.trendMetrics?.classification ?? "null"; dist2[d]=(dist2[d]||0)+1; }
console.log("trendMetrics.classification 분포:", JSON.stringify(dist2), "\n");

function trendDir(a){ const d=a.report?.marketTrend?.direction; return d==="up"?"up":d==="down"?"down":"range"; }
function topT(a){ const p=a.snapshot?.topTraderRatio?.longAccountPct; if(p==null)return null; return p>55?"short":p<45?"long":null; }

const RULES = {
  "R0 무조건 숏(기준선)": () => "short",
  "R1 추세만 (range=중립)": (a) => { const t=trendDir(a); return t==="up"?"long":t==="down"?"short":null; },
  "R2 추세 (range=숏폴백)": (a) => { const t=trendDir(a); return t==="up"?"long":"short"; },
  "R3 추세, range→topTrader": (a) => { const t=trendDir(a); if(t==="up")return"long"; if(t==="down")return"short"; return topT(a); },
  "R4 추세, range→숏(다수)": (a) => { const t=trendDir(a); if(t==="up")return"long"; if(t==="down")return"short"; return "short"; },
  "R5 옛 inferBias(틀린것)": (a) => oldBias(a),
};
function oldBias(a){
  let v=0; const t=trendDir(a); if(t==="up")v+=2; else if(t==="down")v-=2;
  const sw=a.snapshot?.liquiditySweeps||[]; if(sw.length){const f=sw[sw.length-1]; v+= f.side==="bullish"?3:f.side==="bearish"?-3:0;}
  const fr=a.snapshot?.funding?.rate; if(fr!=null&&Math.abs(fr)>=0.0004) v+= fr<0?1:-1;
  return v>=2?"long":v<=-2?"short":null;
}

console.log("규칙별 성능 (decisive=중립아닌 호출, acc=호출중적중, 전체정확도=중립은 오답취급):");
console.log("─".repeat(80));
for (const [name,fn] of Object.entries(RULES)) {
  let cover=0, correctCovered=0, correctAll=0;
  for (const a of rows) {
    const call = fn(a);
    if (call) { cover++; if (call===a.strategy_direction){correctCovered++; correctAll++;} }
  }
  const decAcc = cover? 100*correctCovered/cover : 0;
  const allAcc = 100*correctAll/N;
  console.log(`${name.padEnd(26)} cover=${(100*cover/N).toFixed(0).padStart(3)}%  decisive-acc=${decAcc.toFixed(1).padStart(5)}%  전체정확도=${allAcc.toFixed(1).padStart(5)}%`);
}
