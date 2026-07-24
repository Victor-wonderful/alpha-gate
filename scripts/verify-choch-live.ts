/**
 * 배선 스모크 테스트 — buildStructureReversal의 라이브 감지부를 그대로 재현.
 * snapshot.mtfChart.candles(250봉, {time초}) → openTime 변환 → detectStructureBreaks(50)
 * → 최근 CHoCH_RECENT_BARS 내 CHoCH면 ACTIVE(봇이 structure_reversal 발주할 상태).
 * 봇 실동작을 건드리지 않고 "지금 어떤 코인이 트리거되나"만 확인한다.
 *
 * 실행: pnpm exec tsx scripts/verify-choch-live.ts
 */
import { detectStructureBreaks } from "../src/lib/analysis/smc";

const COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "TRXUSDT", "LTCUSDT", "DOTUSDT"];
const TFS: Record<string, string> = { day: "1h", swing: "4h" };
const CHOCH_RECENT_BARS = 3, STRUCTURE_RETRACE_ATR = 0.3;

async function klines(sym: string, interval: string, limit = 300) {
  const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${interval}&limit=${limit}`);
  const raw = (await res.json()) as number[][];
  return raw.map((k) => ({ time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4] }));
}
function atrPct(c: { high: number; low: number; close: number }[], period = 14) {
  if (c.length < period + 1) return 0;
  let s = 0;
  for (let i = c.length - period; i < c.length; i++) s += Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
  const last = c[c.length - 1].close;
  return last > 0 ? (s / period / last) * 100 : 0;
}
const round = (x: number) => (x >= 100 ? Math.round(x * 100) / 100 : Math.round(x * 10000) / 10000);

async function main() {
  for (const [style, tf] of Object.entries(TFS)) {
    console.log(`\n== ${style} (${tf}) ==`);
    let active = 0, detected = 0;
    for (const sym of COINS) {
      let chart;
      try { chart = (await klines(sym, tf, 300)).slice(-250); } catch { console.log(`   ${sym}: fetch 실패`); continue; }
      const candles = chart.map((c) => ({ openTime: c.time * 1000, high: c.high, low: c.low, close: c.close }));
      const chochs = detectStructureBreaks(candles, 50).filter((b) => b.type === "CHoCH");
      detected += chochs.length;
      const last = chochs[chochs.length - 1];
      if (!last) { console.log(`   ${sym}: CHoCH 없음`); continue; }
      const isActive = last.index >= candles.length - 1 - CHOCH_RECENT_BARS;
      if (isActive) {
        active++;
        const price = candles[candles.length - 1].close;
        const dir = last.side === "bullish" ? "롱" : "숏";
        const atrAbs = (atrPct(candles) / 100) * price;
        const entry = style === "day" ? last.level : (last.side === "bullish" ? price - STRUCTURE_RETRACE_ATR * atrAbs : price + STRUCTURE_RETRACE_ATR * atrAbs);
        console.log(`   ${sym}: ★ACTIVE ${dir} CHoCH · 전환레벨 ${round(last.level)} · 진입후보 ${round(entry)} (현재가 ${round(price)}, ${chochs.length}개 감지)`);
      } else {
        console.log(`   ${sym}: 대기 (마지막 CHoCH ${chochs.length}개 중 idx ${last.index}/${candles.length - 1}, ${candles.length - 1 - last.index}봉 전)`);
      }
    }
    console.log(`   → ${style}: ${COINS.length}코인 중 ACTIVE ${active}건, 총 CHoCH 감지 ${detected}개`);
  }
  console.log("\n검증: 총 CHoCH가 다수 감지되면 차트캔들 변환·감지 정상. ACTIVE는 '지금 막 전환한' 코인(드물게 발생).");
}

main().catch((e) => { console.error(e); process.exit(1); });
