// 열린 페이퍼 포지션 진입가 슬리피지 정정 (옵션 1 — 최소 개입).
//
// 배경: 예전 로직은 시장가 체결 시 인위적 슬리피지(±0.05%)를 entry_actual 에 얹었다.
//       슬리피지 제거 이후, 이미 열려 있는 포지션의 entry_actual 을 실제 시장가로 되돌린다.
//
//   실제_시장가 = entry_actual ÷ (1 + entry_slippage_pct / 100)
//
// 대상: is_paper=true, closed_at IS NULL, order_status='filled',
//       entry_actual NOT NULL, entry_slippage_pct ∉ {0, null}
//
// 손대지 않는 것: paper_margin / 지갑 lock (차이 0.05%, 무시). 종료된 거래(옵션 2 영역).
//
// 사용: node scripts/fix-open-position-slippage.mjs          (dry-run, 미리보기만)
//       node scripts/fix-open-position-slippage.mjs --apply  (실제 반영)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: rows, error } = await sb
  .from("trades")
  .select("id, symbol, direction, entry_actual, entry_slippage_pct, created_at")
  .eq("is_paper", true)
  .is("closed_at", null)
  .eq("order_status", "filled")
  .not("entry_actual", "is", null);

if (error) {
  console.error("조회 실패:", error.message);
  process.exit(1);
}

const targets = (rows ?? []).filter((r) => {
  const slip = Number(r.entry_slippage_pct);
  return Number.isFinite(slip) && slip !== 0;
});

console.log(`열린 체결 포지션 ${rows?.length ?? 0}건 중 슬리피지 정정 대상 ${targets.length}건\n`);

if (targets.length === 0) {
  console.log("정정할 포지션이 없습니다.");
  process.exit(0);
}

let applied = 0;
for (const r of targets) {
  const slip = Number(r.entry_slippage_pct);
  const stored = Number(r.entry_actual);
  const corrected = stored / (1 + slip / 100);
  const deltaPct = ((corrected - stored) / stored) * 100;

  console.log(
    `${r.symbol} ${r.direction} · ${stored} → ${corrected.toFixed(4)} ` +
      `(slip ${slip > 0 ? "+" : ""}${slip}% 제거, Δ${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(4)}%) ` +
      `[${r.id.slice(0, 8)}]`,
  );

  if (APPLY) {
    const { error: upErr } = await sb
      .from("trades")
      .update({ entry_actual: corrected, entry_slippage_pct: 0 })
      .eq("id", r.id);
    if (upErr) console.error(`  ✗ 실패: ${upErr.message}`);
    else applied++;
  }
}

console.log(
  APPLY
    ? `\n완료: ${applied}/${targets.length}건 정정됨.`
    : `\n(dry-run) 위 ${targets.length}건이 정정 대상입니다. 실제 반영하려면 --apply 를 붙여 다시 실행하세요.`,
);
