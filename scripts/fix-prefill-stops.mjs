// 과거 예약주문(역지정/지정가) 정산 오염 보정 — 두 갈래.
//
//  무리A) 체결된 적 없는데 정산됨 (order_status in canceled/expired/pending, entry_actual NULL):
//         0e6c660(미체결 필터) 이전 옛 cron 잔재. 포지션이 없었으므로 결과를 무효화한다.
//         (result_r/exit_reason/exit_* → NULL). 가짜로 반영된 지갑 PnL은 회수.
//
//  무리B) 실제 체결됨 (order_status='filled'): 체결 봉을 트리거 첫 돌파로 재구성하고,
//         그 봉부터(포함) 재정산. production 고친 cron과 동일 기준. 결과가 바뀌면 교정,
//         체결 후 손절/목표 둘 다 미도달이면 재오픈.
//
//  지갑: 영향받은 유저는 used_margin 을 "열린 체결 포지션 합"으로 재계산(권위값),
//        usdt_balance 는 PnL 차액 누계만큼 보정 (admin_adjust 원장 기록).
//
// 사용: node scripts/fix-prefill-stops.mjs [--apply]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const INTERVAL = { "15m": "15m", "1h": "1h", "4h": "4h", "1D": "1d" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function klines(sym, interval, startMs, endMs) {
  const out = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${interval}&limit=1500&startTime=${cursor}&endTime=${endMs}`;
    let arr;
    try { arr = await fetch(url).then((r) => r.json()); } catch { break; }
    if (!Array.isArray(arr) || arr.length === 0) break;
    for (const k of arr) out.push({ openTime: k[0], high: +k[2], low: +k[3], closeTime: k[6] });
    if (arr.length < 1500) break;
    cursor = arr[arr.length - 1][0] + 1;
    await sleep(110);
  }
  return out;
}

// 트리거 첫 돌파 봉. STOP 롱:high>=trig|숏:low<=trig  LIMIT 롱:low<=trig|숏:high>=trig
function findFillBar(candles, kind, direction, trigger) {
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const hit = kind === "stop"
      ? direction === "long" ? c.high >= trigger : c.low <= trigger
      : direction === "long" ? c.low <= trigger : c.high >= trigger;
    if (hit) return i;
  }
  return -1;
}

// route.ts resolveTrade 와 동일 (동봉 시 손절 우선). candles 는 체결 봉 포함 이후 구간.
function resolveTrade({ entryActual, stop, target, direction, feesPct }, candles) {
  const stopDist = Math.abs(entryActual - stop);
  if (stopDist === 0) return null;
  const feesR = (entryActual * (feesPct / 100)) / stopDist;
  for (const c of candles) {
    if (direction === "long") {
      if (c.low <= stop) return mk(stop, (stop - entryActual) / stopDist - feesR, "stop", c);
      if (c.high >= target) return mk(target, (target - entryActual) / stopDist - feesR, "target", c);
    } else {
      if (c.high >= stop) return mk(stop, (entryActual - stop) / stopDist - feesR, "stop", c);
      if (c.low <= target) return mk(target, (entryActual - target) / stopDist - feesR, "target", c);
    }
  }
  return null;
  function mk(px, r, reason, c) { return { exitPrice: px, exitActual: px, resultR: r, exitReason: reason, closedAt: new Date(c.closeTime).toISOString() }; }
}

const pnlOf = (dir, entry, exit, qty, feesPct) =>
  (dir === "long" ? exit - entry : entry - exit) * qty - entry * (feesPct / 100) * qty;

// ── 후보 조회 ────────────────────────────────────────────────────────────────
const { data: trades, error } = await sb
  .from("trades")
  .select("id, user_id, symbol, direction, timeframe, entry, entry_actual, stop, target, fees_pct, position_quantity, paper_margin, is_paper, created_at, closed_at, order_type, order_status, exit_reason, result_r, paper_realized_pnl")
  .neq("mode", "backtest")
  .in("order_type", ["limit", "stop"])
  .in("exit_reason", ["stop", "target"])
  .not("closed_at", "is", null)
  .order("created_at", { ascending: true });
if (error) { console.error("쿼리 실패:", error.message); process.exit(1); }

const walletDelta = {};   // userId -> usdt_balance 보정 누계
const touchedUsers = new Set();
let voided = 0, changed = 0, reopened = 0, unchanged = 0, skipped = 0;

console.log(`후보 ${trades.length}건\n=== 무리A: 미체결인데 정산된 행 (무효화) ===`);
for (const t of trades) {
  if (t.order_status === "filled") continue;
  touchedUsers.add(t.user_id);
  const oldPnl = Number(t.paper_realized_pnl ?? 0);
  console.log(`  ⌫ ${t.symbol} ${t.direction} ${t.id.slice(0,8)} status=${t.order_status} : ${t.exit_reason}(${Number(t.result_r).toFixed(2)}R) 무효화${t.is_paper ? `  지갑 PnL 회수 ${(-oldPnl).toFixed(2)}` : ""}`);
  voided++;
  if (t.is_paper) walletDelta[t.user_id] = (walletDelta[t.user_id] ?? 0) - oldPnl;
  if (APPLY) {
    await sb.from("trades").update({
      exit_price: null, exit_actual: null, result_r: null, exit_reason: null,
      paper_realized_pnl: null,
      note: "과거 보정: 체결된 적 없는 주문의 가짜 정산 무효화",
    }).eq("id", t.id);
  }
}

// ⚠️ 무리B는 현재 "보고만" 한다 (--apply 로도 DB/지갑 미반영).
// 이유: 표본 검증 결과 일부 filled 행의 기록된 result_r 이 저장된 stop/target/entry 로
// 재현되지 않음(예: 목표 +4.55R 이어야 할 행이 +1.37R 로 기록). 진입가 사후수정·수동청산
// 등 미상의 경로로 결과가 박힌 것으로 보여, resolveTrade 로 덮어쓰면 위험. 수동 검토 대상.
console.log(`\n=== 무리B: 실제 체결 행 (보고 전용 — 미적용) ===`);
for (const t of trades) {
  if (t.order_status !== "filled") continue;
  const tf = INTERVAL[t.timeframe];
  if (!tf) { skipped++; continue; }
  const { data: plo } = await sb.from("pending_limit_orders").select("limit_price, order_kind").eq("trade_id", t.id).maybeSingle();
  const createdMs = new Date(t.created_at).getTime();
  const candles = await klines(t.symbol, tf, createdMs - 60_000, Date.now());
  if (candles.length === 0) { console.log(`  ? ${t.id.slice(0,8)} 캔들 없음`); skipped++; continue; }

  const kind = plo?.order_kind ?? (t.order_type === "stop" ? "stop" : "limit");
  const trigger = plo?.limit_price != null ? Number(plo.limit_price) : Number(t.entry_actual ?? t.entry);
  const fillIdx = findFillBar(candles, kind, t.direction, trigger);
  if (fillIdx < 0) { console.log(`  ? ${t.id.slice(0,8)} 트리거 ${trigger} 미발견`); skipped++; continue; }

  const fillBar = candles[fillIdx];
  const fromFill = candles.slice(fillIdx); // 체결 봉 포함 (고친 cron 과 동일)
  const entryActual = Number(t.entry_actual ?? t.entry);
  const feesPct = Number(t.fees_pct ?? 0.12);
  const res = resolveTrade({ entryActual, stop: +t.stop, target: +t.target, direction: t.direction, feesPct }, fromFill);
  const tag = `${t.symbol} ${t.direction} [${t.timeframe}] ${t.id.slice(0,8)}`;
  const oldR = Number(t.result_r);
  const filledAtIso = new Date(fillBar.openTime).toISOString();

  // 보고 전용: walletDelta/touchedUsers/DB 미반영.
  if (res && res.exitReason === t.exit_reason) { unchanged++; continue; }
  const oldPnl = Number(t.paper_realized_pnl ?? 0);
  if (res) {
    const newPnl = pnlOf(t.direction, entryActual, res.exitActual, Number(t.position_quantity ?? 0), feesPct);
    console.log(`  ✎ ${tag}: 기록 ${t.exit_reason}(${oldR.toFixed(2)}R) vs 재계산 ${res.exitReason}(${res.resultR.toFixed(2)}R)${t.is_paper ? `  PnL ${oldPnl.toFixed(2)}→${newPnl.toFixed(2)}` : ""}`);
    changed++;
  } else {
    console.log(`  ↻ ${tag}: 기록 ${t.exit_reason}(${oldR.toFixed(2)}R) vs 재계산 체결 후 미도달(재오픈 후보)`);
    reopened++;
  }
}

// ── 지갑 정합화: 영향 유저별 used_margin 재계산 + balance PnL 차액 ─────────────
console.log(`\n=== 지갑 정합화 ===`);
for (const userId of touchedUsers) {
  const delta = walletDelta[userId] ?? 0;
  // 열린 체결 포지션(현재 상태) 마진 합 — 무리B 재오픈 반영 위해 APPLY 후 다시 읽음
  const { data: openPos } = await sb.from("trades")
    .select("paper_margin")
    .eq("user_id", userId).eq("is_paper", true).eq("order_status", "filled").is("closed_at", null);
  const recomputedUsed = (openPos ?? []).reduce((s, r) => s + Number(r.paper_margin ?? 0), 0);
  const { data: w } = await sb.from("paper_wallets").select("usdt_balance, used_margin").eq("user_id", userId).maybeSingle();
  if (!w) { console.log(`  user ${userId.slice(0,8)} 지갑 없음`); continue; }
  const newBal = Number(w.usdt_balance) + delta;
  console.log(`  user ${userId.slice(0,8)}: balance ${Number(w.usdt_balance).toFixed(2)}${delta>=0?"+":""}${delta.toFixed(2)}=${newBal.toFixed(2)}  used_margin ${Number(w.used_margin).toFixed(2)}→${recomputedUsed.toFixed(2)}`);
  if (APPLY) {
    await sb.from("paper_wallets").update({ usdt_balance: newBal, used_margin: recomputedUsed, updated_at: new Date().toISOString() }).eq("user_id", userId);
    if (Math.abs(delta) > 1e-9) await sb.from("wallet_transactions").insert({ user_id: userId, kind: "admin_adjust", amount: delta, balance_after: newBal, meta: { reason: "prefill-stop 과거 보정" } });
  }
}

console.log(`\n무리A(적용대상): 무효화 ${voided}`);
console.log(`무리B(보고전용): 결과상이 ${changed} · 재오픈후보 ${reopened} · 동일 ${unchanged} · 건너뜀 ${skipped}`);
console.log(APPLY ? "✅ 무리A 적용 완료 (무리B는 수동 검토)" : "ℹ️ 읽기 전용 — --apply 로 무리A만 적용");
