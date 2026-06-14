// READ-ONLY: 각 방향성 신호가 실제 Strategy Agent 방향(strategy_direction)을 얼마나 맞히는지 측정.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = {};
for (const line of readFileSync("D:/web01/.env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await sb.from("analyses")
  .select("symbol,style,strategy_direction,snapshot,report")
  .not("strategy_direction", "is", null);
if (error) { console.error(error.message); process.exit(1); }

const rows = data.filter(a => a.strategy_direction === "long" || a.strategy_direction === "short");
const N = rows.length;
const nLong = rows.filter(r => r.strategy_direction === "long").length;
const nShort = N - nLong;
console.log(`표본 N=${N}  (long=${nLong} ${(100*nLong/N).toFixed(0)}% / short=${nShort} ${(100*nShort/N).toFixed(0)}%)`);
console.log(`기준선(다수결=무조건 ${nShort>=nLong?"숏":"롱"}) 정확도 = ${(100*Math.max(nLong,nShort)/N).toFixed(1)}%\n`);

// 각 후보 신호 → "long"|"short"|null(중립) 함수
function near(a,b,pct){ return a>0&&b>0&&Math.abs(a-b)/b<=pct; }
const FEATURES = {
  "추세(marketTrend.dir)": (s,r) => r?.marketTrend?.direction==="up"?"long":r?.marketTrend?.direction==="down"?"short":null,
  "trendMetrics.class": (s) => { const c=s?.trendMetrics?.classification||""; if(/up|상승|bull/i.test(c))return"long"; if(/down|하락|bear/i.test(c))return"short"; return null; },
  "sweep(freshest side)": (s) => { const sw=(s?.liquiditySweeps||[]); if(!sw.length)return null; const f=sw[sw.length-1]; return f.side==="bullish"?"long":f.side==="bearish"?"short":null; },
  "funding(역프=롱/과열=숏)": (s) => { const r=s?.funding?.rate; if(r==null||Math.abs(r)<0.0004)return null; return r<0?"long":"short"; },
  "fundingSqueeze.dir": (s) => { const f=s?.fundingSqueeze; if(!f?.active)return null; return f.direction==="long"?"long":f.direction==="short"?"short":null; },
  "sessionOpenDrive.dir": (s) => { const f=s?.sessionOpenDrive; if(!f?.active)return null; return f.direction==="long"?"long":f.direction==="short"?"short":null; },
  "topTrader(군중 역추세)": (s) => { const p=s?.topTraderRatio?.longAccountPct; if(p==null)return null; return p>55?"short":p<45?"long":null; },
  "vwap(위=롱/아래=숏)": (s) => { const d=s?.vwap?.distancePct; if(d==null||Math.abs(d)<0.1)return null; return d>0?"long":"short"; },
  "VAH도달=숏/VAL도달=롱": (s) => { const last=s?.ticker?.last,vp=s?.volumeProfile; if(!last||!vp)return null; if(near(last,vp.vah,0.006))return"short"; if(near(last,vp.val,0.006))return"long"; return null; },
  "24h고가=숏/저가=롱": (s) => { const t=s?.ticker; if(!t)return null; if(near(t.last,t.high24h,0.01))return"short"; if(near(t.last,t.low24h,0.01))return"long"; return null; },
  "oiDelta.1h(증가+가격↑)": (s,r) => { const oi=s?.oiDelta?.hourChangePct,dir=r?.marketTrend?.direction; if(oi==null||Math.abs(oi)<1||!dir)return null; return dir==="up"?"long":"short"; },
  "basis.premium(고프=숏)": (s) => { const p=s?.basis?.premiumPct; if(p==null||Math.abs(p)<0.05)return null; return p>0?"short":"long"; },
};

console.log("신호별 예측력 (cover=신호발생률, acc=발생시 방향적중률, lift=acc−기준선):");
console.log("─".repeat(78));
const base = Math.max(nLong,nShort)/N;
for (const [name,fn] of Object.entries(FEATURES)) {
  let cover=0, correct=0, callLong=0, callShort=0;
  for (const a of rows) {
    const call = fn(a.snapshot||{}, a.report||{});
    if (!call) continue;
    cover++;
    if (call==="long") callLong++; else callShort++;
    if (call === a.strategy_direction) correct++;
  }
  const acc = cover? correct/cover : 0;
  const coverPct = 100*cover/N;
  const lift = (acc-base)*100;
  console.log(`${name.padEnd(26)} cover=${coverPct.toFixed(0).padStart(3)}%  acc=${(100*acc).toFixed(1).padStart(5)}%  lift=${lift>=0?"+":""}${lift.toFixed(1)}  (예측 롱${callLong}/숏${callShort})`);
}
