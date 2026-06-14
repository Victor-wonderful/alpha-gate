// 무효화된 미체결 행 정합화: order_status in (canceled,expired) AND result_r IS NULL
// AND closed_at NOT NULL → closed_at=null (정상 만료 주문 상태와 일치, 거래일지 유령행 제거).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env={};for(const l of readFileSync(new URL("../.env.local",import.meta.url),"utf8").split(/\r?\n/)){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)env[m[1]]=m[2].replace(/^"(.*)"$/,"$1");}
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const APPLY=process.argv.includes("--apply");
const {data,error}=await sb.from("trades")
  .select("id,symbol,direction,order_status,result_r,closed_at,exit_reason")
  .in("order_status",["canceled","expired"])
  .is("result_r",null)
  .not("closed_at","is",null);
if(error){console.error(error.message);process.exit(1);}
console.log(`대상 ${data.length}건 (canceled/expired + result_r null + closed_at 있음):`);
for(const t of data) console.log(`  ${t.symbol} ${t.direction} ${t.id.slice(0,8)} status=${t.order_status} closed=${t.closed_at?.slice(0,16)} exit=${t.exit_reason}`);
if(APPLY){
  for(const t of data){await sb.from("trades").update({closed_at:null}).eq("id",t.id);}
  console.log(`✅ ${data.length}건 closed_at=null 적용`);
}else console.log("ℹ️ --apply 로 적용");
