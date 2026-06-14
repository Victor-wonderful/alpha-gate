// Track B 4건 정정 (1분봉 정밀 검증 결과 반영). 지갑 변동 없음(전부 paper_margin null).
//  cf8a494f: 진입 전 목표선 스침으로 가짜 목표승 → 실제 체결(13:30) 후 손절(13:34). 손절로 정정.
//  6cbf0057/63a6aa9f/57f3367d: 시세가 트리거 미도달 = 미체결. 가짜 목표승 무효화.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env={};for(const l of readFileSync(new URL("../.env.local",import.meta.url),"utf8").split(/\r?\n/)){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)env[m[1]]=m[2].replace(/^"(.*)"$/,"$1");}
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const APPLY=process.argv.includes("--apply");
const {data:rows}=await sb.from("trades").select("*").in("order_type",["limit","stop"]).eq("symbol","BTCUSDT").order("created_at",{ascending:false}).limit(200);
const get=p=>rows.find(r=>r.id.startsWith(p));

// 1) cf8a494f → 손절
const t=get("cf8a494f");
const ea=Number(t.entry_actual),stop=+t.stop,fee=Number(t.fees_pct??0.12),qty=Number(t.position_quantity??0);
const dist=Math.abs(ea-stop),feesR=ea*(fee/100)/dist;
const resultR=(stop-ea)/dist-feesR; // long
const pnl=(stop-ea)*qty-ea*(fee/100)*qty;
console.log(`cf8a494f → stop  resultR=${resultR.toFixed(2)} pnl=${pnl.toFixed(2)} (기록 target ${Number(t.result_r).toFixed(2)}R)`);
if(APPLY){const{error}=await sb.from("trades").update({
  filled_at:"2026-05-22T13:30:00.000Z", closed_at:"2026-05-22T13:34:00.000Z",
  exit_price:stop, exit_actual:stop, result_r:resultR, exit_reason:"stop",
  paper_realized_pnl: t.paper_margin!=null?pnl:t.paper_realized_pnl!=null?pnl:null,
  note:"수동 보정(1m검증): 진입 전 목표선 스침→가짜 목표승. 실제 체결 13:30 후 13:34 손절."
}).eq("id",t.id);console.log(error?`  실패 ${error.message}`:"  ✅ 손절로 정정");}

// 2) 미체결 3건 → 무효화
for(const pre of ["6cbf0057","63a6aa9f","57f3367d"]){
  const x=get(pre);
  console.log(`${pre} → 무효화 (미체결, 기록 ${x.exit_reason} ${Number(x.result_r).toFixed(2)}R)`);
  if(APPLY){const{error}=await sb.from("trades").update({
    order_status:"expired", exit_price:null, exit_actual:null, result_r:null, exit_reason:null,
    paper_realized_pnl:null,
    note:"수동 보정(1m검증): 시세가 트리거 미도달=미체결. 가짜 목표승 무효화."
  }).eq("id",x.id);console.log(error?`  실패 ${error.message}`:"  ✅ 무효화");}
}
console.log(APPLY?"\n✅ 적용 완료 (지갑 변동 없음)":"\nℹ️ --apply 로 적용");
