import type { AnalysisSnapshot } from "./analyze";
import type { AnalysisReport, ScenarioEntry } from "./synthesize";
import { MAX_LADDER_TIERS } from "@/lib/ladder";
import type { StrategyResult, StrategyId } from "./strategy";
import { STYLE_STANDARDS } from "./standards";
import { computeMarketAssessment } from "./market-assessment";
import { detectStructureBreaks } from "./smc";

/**
 * 코드 전용 시나리오 생성기 — AI(Strategy/Scenario) 미가용 시 폴백.
 *
 * 목적: Anthropic 잔액 소진·한도·장애 등 어떤 이유로든 AI가 안 될 때도 분석이 죽지 않도록,
 * 결정론 스냅샷 + 스타일 표준으로 진입/손절/목표/방향을 코드로 생성한다.
 * (레이더 preview와 동일 논리: 방향=추세[검증 98.4%], 손절≈MTF ATR을 표준밴드로 clamp, 목표=손절×RR.)
 * 손익비·등급·사이징은 다운스트림(UI)이 entry/stop/target에서 계산하므로 여기선 그 3+방향만 만든다.
 *
 * 진입가·손절은 실제 구조 레벨(스윙·OB·유동성·FVG·매물대, 전부 Stage1 코드 산출)에 놓으므로
 * AI 유무와 무관하게 품질 유지. AI 대비 잃는 것은 서술 품질 + 다중 레벨 중 선택의 미묘한 판단뿐.
 */

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round = (x: number) => {
  // 가격 자릿수 보존: 큰 값은 정수 근처, 작은 값은 유효숫자 유지.
  if (x >= 100) return Math.round(x * 100) / 100;
  if (x >= 1) return Math.round(x * 10000) / 10000;
  return Math.round(x * 1e8) / 1e8;
};

const STRENGTH_LABEL: Record<"strong" | "moderate" | "weak", string> = {
  strong: "강",
  moderate: "중",
  weak: "약",
};

/** 방향의 지지(롱)/저항(숏) 후보 레벨 — 스윙·OB·유동성·FVG·매물대. 전부 Stage1 코드 산출(AI 무관). */
function collectStructuralLevels(snapshot: AnalysisSnapshot, direction: "long" | "short"): number[] {
  const out: number[] = [];
  const want = direction === "long" ? "bullish" : "bearish";
  const liqSide = direction === "long" ? "buy" : "sell";
  for (const tf of snapshot.multiTf ?? []) {
    const sw = direction === "long" ? tf.lastSwingLow : tf.lastSwingHigh;
    if (sw != null) out.push(sw);
    for (const ob of tf.orderBlocks ?? []) if (ob.side === want) out.push(ob.top, ob.bottom);
    for (const l of tf.liquidity ?? []) if (l.side === liqSide) out.push(l.price);
    for (const f of tf.unfilledFVGs ?? []) if (f.side === want) out.push(f.top, f.bottom);
  }
  const vp = snapshot.volumeProfile;
  out.push(vp.poc, vp.vah, vp.val);
  return out.filter((x) => Number.isFinite(x) && x > 0);
}

// 검증된 구조 전환 셋업 파라미터 — 백테스트(backtest-choch-retest*)에 정확히 맞춤.
const CHOCH_RECENT_BARS = 3; // 이 봉 수 이내에 발생한 CHoCH만 "활성"(막 전환).
const STRUCTURE_STOP_MULT = 1.5; // 손절폭 = clamp(1.5×ATR%, 스타일밴드).
const STRUCTURE_RETRACE_ATR = 0.3; // 얕은 되돌림 = 0.3×ATR (4h/swing에서 최적).
const CHOCH_MIN_GAP_PCT = 0.15; // 되돌림 최소 갭(즉시체결·트리거 가드 회피).

/**
 * 스윙 구조 전환(CHoCH) 전용 시나리오 — 백테스트로 검증된 유일한 신호(1h·4h).
 * 최근 CHoCH가 있으면 trend_pullback보다 우선한다. 진입 되돌림 깊이는 검증 결과대로:
 *   day(1h) = 돌파레벨 재테스트(+0.118R), swing(4h) = 얕은 ATR 되돌림(+0.109R).
 * scalp(15m 전멸)·position(미검증)은 대상 아님 → null 반환(trend_pullback로 폴백).
 */
function buildStructureReversal(
  snapshot: AnalysisSnapshot,
): { strategy: StrategyResult; report: AnalysisReport } | null {
  const style = snapshot.style;
  if (style !== "day" && style !== "swing") return null;

  const raw = snapshot.mtfChart?.candles;
  if (!raw || raw.length < 60) return null;
  const candles = raw.map((c) => ({ openTime: c.time * 1000, high: c.high, low: c.low, close: c.close }));
  const chochs = detectStructureBreaks(candles, 50).filter((b) => b.type === "CHoCH");
  const last = chochs[chochs.length - 1];
  if (!last) return null;
  // 너무 오래된 전환은 무시(막 전환한 신호만 진입 자격).
  if (last.index < candles.length - 1 - CHOCH_RECENT_BARS) return null;

  const std = STYLE_STANDARDS[style];
  const price = snapshot.ticker.last;
  const direction: "long" | "short" = last.side === "bullish" ? "long" : "short";
  const atrPct =
    snapshot.atr?.find((a) => a.role === "MTF")?.pctOfPrice ??
    snapshot.atr?.find((a) => a.role === "LTF")?.pctOfPrice ??
    snapshot.atr?.[0]?.pctOfPrice ??
    0;
  const atrAbs = (atrPct / 100) * price;

  // 진입 되돌림: day=돌파레벨 재테스트, swing=얕은 ATR 되돌림. (검증된 TF별 최적)
  let entry: number;
  if (style === "day") {
    entry = last.level;
    const correctSide = direction === "long" ? entry < price : entry > price;
    if (!correctSide) entry = direction === "long" ? price - STRUCTURE_RETRACE_ATR * atrAbs : price + STRUCTURE_RETRACE_ATR * atrAbs;
  } else {
    entry = direction === "long" ? price - STRUCTURE_RETRACE_ATR * atrAbs : price + STRUCTURE_RETRACE_ATR * atrAbs;
  }
  // 되돌림 폭이 너무 얕으면(즉시체결 위험) 최소 갭 강제.
  if ((Math.abs(entry - price) / price) * 100 < CHOCH_MIN_GAP_PCT) {
    entry = direction === "long" ? price * (1 - CHOCH_MIN_GAP_PCT / 100) : price * (1 + CHOCH_MIN_GAP_PCT / 100);
  }

  const stopPct = clamp(STRUCTURE_STOP_MULT * atrPct, std.stopPct.min, std.stopPct.max);
  const stop = direction === "long" ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100);
  const targetPct = stopPct * std.rr.min;
  const target = direction === "long" ? entry * (1 + targetPct / 100) : entry * (1 - targetPct / 100);

  const vp = snapshot.volumeProfile;
  const keyLevels = [
    { label: "POC", price: vp.poc, note: "거래량 중심" },
    { label: "VAH", price: vp.vah, note: "밸류 상단" },
    { label: "VAL", price: vp.val, note: "밸류 하단" },
  ].filter((l) => Number.isFinite(l.price) && l.price > 0);

  const dirWord = direction === "long" ? "롱" : "숏";
  const chWord = direction === "long" ? "상승 전환(CHoCH)" : "하락 전환(CHoCH)";
  const entryNote = style === "day" ? "돌파 레벨 재테스트" : "얕은 되돌림(ATR×0.3)";
  const gapPct = ((Math.abs(entry - price) / price) * 100).toFixed(2);

  const scenario: AnalysisReport["scenarios"][number] = {
    name: `구조 전환 ${dirWord} (CHoCH · 코드)`,
    direction,
    strategyHint: "structure_reversal" as StrategyId,
    entryType: "pending",
    orderHint: "limit",
    trigger: `스윙 구조 ${chWord} 확정 — ${entryNote} ${round(entry)}(현재가 대비 ${gapPct}%) 도달 시 지정가 진입. 시장가 추격 대신 되돌림을 기다립니다. 반대 방향 CHoCH 발생 시 예약을 취소하세요.`,
    entryZone: { low: round(entry * 0.999), high: round(entry * 1.001) },
    invalidation: round(stop),
    target: round(target),
    note: `코드 분석 — 스윙 구조(50봉) ${chWord} 후 ${entryNote} 진입. 손절 ATR×${STRUCTURE_STOP_MULT} 밴드, 목표 R:R ${std.rr.min}. 백테스트 검증된 셋업(1h·4h swing/CHoCH).`,
    marketAssessment: computeMarketAssessment(snapshot, direction, entry),
  };

  const report: AnalysisReport = {
    summary: `코드 분석: ${snapshot.symbol} ${snapshot.styleLabel} — 스윙 구조 ${chWord}. 백테스트로 검증된 구조 전환 셋업입니다.`,
    marketTrend: { direction: direction === "long" ? "up" : "down", strength: "moderate", note: chWord },
    structure: {
      htf: `스윙 구조 ${chWord}`,
      ltf: `현재가 ${round(price)} · 전환 레벨 ${round(last.level)}`,
      alignment: direction === "long" ? "aligned_up" : "aligned_down",
    },
    keyLevels,
    flow: { bias: "neutral", note: `구조 전환 ${dirWord} 방향` },
    scenarios: [scenario],
    actionNow: `스윙 구조 ${chWord}이 확정됐습니다. 시장가 추격 대신 ${entryNote} ${round(entry)} 되돌림 지정가로 대기하고, 반대 CHoCH가 뜨면 취소하세요.`,
    warnings: ["⚙️ 코드 시나리오(구조 전환) — 진입가·손절은 검증된 규칙 기반입니다. AI 서술은 없습니다."],
  };

  const strategy: StrategyResult = {
    primary: "structure_reversal",
    direction,
    confidence: 0.6,
    reasoning: `스윙 구조 ${chWord} 확정 → 되돌림 진입. 백테스트로 검증된 셋업(1h·4h).`,
    rejected: [],
  };

  return { strategy, report };
}

export function buildCodeReport(snapshot: AnalysisSnapshot): {
  strategy: StrategyResult;
  report: AnalysisReport;
} {
  // 검증된 구조 전환(CHoCH) 신호가 최근이면 전용 시나리오 우선 (day/swing만).
  const sr = buildStructureReversal(snapshot);
  if (sr) return sr;

  const price = snapshot.ticker.last;
  const style = snapshot.style;
  const std = STYLE_STANDARDS[style];
  const tm = snapshot.trendMetrics;
  const cls = tm?.classification;
  const strength = tm?.strength ?? "weak";
  const vp = snapshot.volumeProfile;

  // 방향 — 추세 기반(검증 98.4%). 횡보/혼조면 POC 대비 위치로 약하게 추정.
  let direction: "long" | "short";
  let dirNote: string;
  let clearTrend: boolean;
  if (cls === "up") {
    direction = "long";
    dirNote = "상승 추세";
    clearTrend = true;
  } else if (cls === "down") {
    direction = "short";
    dirNote = "하락 추세";
    clearTrend = true;
  } else {
    direction = price >= vp.poc ? "long" : "short";
    dirNote = "추세 불명확 — POC 대비 위치로 추정 (신뢰도 낮음)";
    clearTrend = false;
  }

  // 손절폭 — MTF ATR%를 스타일 표준 밴드로 clamp. ATR 없으면 밴드 최소값.
  const atrPct =
    snapshot.atr?.find((a) => a.role === "MTF")?.pctOfPrice ??
    snapshot.atr?.find((a) => a.role === "LTF")?.pctOfPrice ??
    snapshot.atr?.[0]?.pctOfPrice ??
    0;
  const stopPctBand = clamp(atrPct > 0 ? atrPct : std.stopPct.min, std.stopPct.min, std.stopPct.max);

  // ── 진입·손절을 "실제 구조 레벨"에 놓는다 (AI 무관) ──────────────────────────
  // 스윙·오더블록·유동성·FVG·매물대는 전부 Stage1(코드)이 계산 → AI 미가용이어도 동일 품질.
  // 실거래 66건: 시장가 −0.41R vs 지정가 되돌림 +0.28R. 진입가를 가까운 지지/저항에 건다.
  const MIN_GAP_PCT = 0.15; // 즉시체결·트리거 가드 회피
  const levels = collectStructuralLevels(snapshot, direction);
  // 되돌림 진입 후보 — 올바른 쪽(롱=아래/숏=위), [MIN_GAP, 손절밴드] 안, 가까운 순.
  const cands = levels
    .filter((l) => (direction === "long" ? l < price : l > price))
    .map((l) => ({ level: l, gap: (Math.abs(l - price) / price) * 100 }))
    .filter((c) => c.gap >= MIN_GAP_PCT && c.gap <= stopPctBand)
    .sort((a, b) => a.gap - b.gap);

  // ── 분할 진입 차수(1~3) — 구조 레벨을 단계적으로 (AI 무관) ──────────────────
  // 규칙은 AI 프롬프트(synthesize.ts "다단 진입 규칙")와 동일하게 맞춘다:
  //   · 1차가 현재가에 가장 가깝고 2·3차는 더 깊은 되돌림
  //   · 1차~마지막 간격 ≤ 손절폭 절반 (평균 진입가가 손절에 붙는 것 방지)
  //   · 서로 너무 가까운 레벨은 병합(사실상 같은 자리에 두 번 걸지 않음)
  //   · 1차 비중 최대. 레벨이 하나뿐이면 단일 진입(기존 동작 그대로)
  // cf. docs/분할진입-설계.md D6
  const TIER_MIN_SEP_PCT = 0.1;
  const picked: typeof cands = [];
  for (const c of cands) {
    if (picked.length >= MAX_LADDER_TIERS) break;
    if (picked.some((p) => Math.abs(p.gap - c.gap) < TIER_MIN_SEP_PCT)) continue;
    if (picked.length > 0 && c.gap - picked[0].gap > stopPctBand / 2) break;
    picked.push(c);
  }
  const TIER_WEIGHTS: Record<number, number[]> = { 1: [100], 2: [55, 45], 3: [40, 35, 25] };
  const tierWeights = TIER_WEIGHTS[picked.length] ?? [];
  const entryCand = picked[0];

  // 구조 레벨 없으면 ATR 되돌림(추세 강할수록 얕게).
  const pullbackScale = strength === "strong" ? 0.35 : strength === "moderate" ? 0.5 : 0.7;
  const pullbackPct = entryCand
    ? entryCand.gap
    : clamp(atrPct * pullbackScale, MIN_GAP_PCT, stopPctBand);
  const entryFromLevel = !!entryCand;
  const singleEntry =
    direction === "long" ? price * (1 - pullbackPct / 100) : price * (1 + pullbackPct / 100);

  // 차수가 2개 이상이면 진입가 = 비중 가중평균. 사이징·손절·등급이 전부 이 값을 기준으로
  // 계산되므로, 분할로 실제 잡히는 평균 단가와 어긋나지 않게 여기서 맞춘다.
  const isLadder = picked.length >= 2;
  const entry = isLadder
    ? picked.reduce((a, p, i) => a + p.level * (tierWeights[i] / 100), 0)
    : singleEntry;
  // 공유 손절은 "가장 깊은 차수 너머"에 놓아야 한다 (D2).
  const deepest = isLadder ? picked[picked.length - 1].level : entry;

  // 손절 — 진입 "너머"(더 먼 쪽) 구조 레벨에 놓고 이탈 확인 여유 0.1%. 없으면 ATR 밴드.
  const stopCand = levels
    .filter((l) => (direction === "long" ? l < deepest : l > deepest))
    .map((l) => ({ level: l, gap: (Math.abs(entry - l) / entry) * 100 }))
    .filter((c) => c.gap >= std.stopPct.min && c.gap <= std.stopPct.max)
    .sort((a, b) => a.gap - b.gap)[0];
  const stopFromLevel = !!stopCand;
  const stopPct = stopCand ? clamp(stopCand.gap + 0.1, std.stopPct.min, std.stopPct.max) : stopPctBand;
  const targetPct = stopPct * std.rr.min;

  // 진입가 기준으로 손절·목표 산출 → RR = std.rr.min 보존.
  const stop = direction === "long" ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100);
  const target = direction === "long" ? entry * (1 + targetPct / 100) : entry * (1 - targetPct / 100);

  const keyLevels = [
    { label: "POC", price: vp.poc, note: "거래량 중심" },
    { label: "VAH", price: vp.vah, note: "밸류 상단" },
    { label: "VAL", price: vp.val, note: "밸류 하단" },
  ].filter((l) => Number.isFinite(l.price) && l.price > 0);

  const dirWord = direction === "long" ? "롱" : "숏";
  // 차수 목록 — 2개 이상일 때만 채운다(1개면 단일 진입과 같아 의미 없음).
  const TIER_NOTES = ["가장 가까운 구조 레벨", "다음 구조 레벨", "가장 깊은 되돌림"];
  const entries: ScenarioEntry[] | undefined = isLadder
    ? picked.map((p, i) => ({
        tier: i + 1,
        label: `${i + 1}차`,
        price: round(p.level),
        weight: tierWeights[i],
        note: TIER_NOTES[i] ?? `${i + 1}차 되돌림`,
        distancePct: Number(p.gap.toFixed(2)),
      }))
    : undefined;

  const scenario: AnalysisReport["scenarios"][number] = {
    name: `추세 되돌림 ${dirWord} (코드 추정)`,
    direction,
    strategyHint: "trend_pullback" as StrategyId,
    entryType: "pending",
    orderHint: "limit",
    qualityIssues: clearTrend ? undefined : ["추세 불명확 — 방향 신뢰도 낮음. 진입 신중."],
    trigger: `${dirNote} 방향 되돌림 대기 — ${entryFromLevel ? "구조 레벨(스윙/OB/유동성/매물대)" : "현재가 되돌림"} ${round(entry)}(현재가 대비 ${pullbackPct.toFixed(2)}%) 도달 시 지정가 진입. 시장가 추격 대신 유리한 진입가를 기다립니다. 진입 전 캔들 확정을 확인하세요.`,
    entries,
    entryZone: isLadder
      ? {
          low: round(Math.min(picked[0].level, deepest) * 0.999),
          high: round(Math.max(picked[0].level, deepest) * 1.001),
        }
      : { low: round(entry * 0.999), high: round(entry * 1.001) },
    invalidation: round(stop),
    target: round(target),
    note: `코드 분석 — 진입가 ${entryFromLevel ? "구조 레벨" : "ATR 되돌림"} · 손절 ${stopFromLevel ? "구조 레벨" : "ATR 밴드"} 기반.${isLadder ? ` 구조 레벨이 ${picked.length}개라 ${picked.length}단 분할 진입으로 제시합니다 (표시 진입가는 비중 가중평균).` : ""} 스윙·OB·유동성·매물대 전부 코드 계산이라 AI 유무와 무관.`,
    // 등급 입력(marketAssessment)은 스냅샷 사실로 계산 — AI 경로와 동일 기준. (진입가 기준)
    marketAssessment: computeMarketAssessment(snapshot, direction, entry),
  };

  const report: AnalysisReport = {
    summary: `코드 분석: ${snapshot.symbol} ${snapshot.styleLabel} — ${dirNote} (강도 ${STRENGTH_LABEL[strength]}). AI 미가용으로 규칙 기반 시나리오를 제공합니다.`,
    marketTrend: {
      direction: cls === "up" ? "up" : cls === "down" ? "down" : "range",
      strength,
      note: dirNote,
    },
    structure: {
      htf: `HTF ${dirNote}`,
      ltf: `현재가 ${round(price)} · POC ${round(vp.poc)}`,
      alignment: cls === "up" ? "aligned_up" : cls === "down" ? "aligned_down" : "range",
    },
    keyLevels,
    flow: { bias: "neutral", note: "코드 폴백 — 오더플로우 종합은 AI 복구 후 제공" },
    scenarios: [scenario],
    actionNow:
      "AI 리서치 미가용 — 규칙 기반 되돌림 지정가 시나리오입니다. 시장가로 추격하지 말고 진입가 도달을 기다리되, 진입 전 차트 구조를 직접 확인하세요.",
    warnings: [
      "⚙️ AI 리서치 미가용 — 진입가·손절은 실제 구조 레벨(스윙·OB·유동성·매물대) 기반이라 정밀합니다. 서술·미묘한 판단만 AI보다 간략합니다.",
    ],
  };

  const strategy: StrategyResult = {
    primary: "trend_pullback",
    // 시나리오가 단일 방향을 트레이드하므로 그 방향을 그대로 표기. 불확실성은 confidence로 표현.
    direction,
    confidence: strength === "strong" ? 0.6 : strength === "moderate" ? 0.45 : 0.3,
    reasoning: `코드 폴백: ${dirNote}. AI 미가용으로 추세 기반 규칙 시나리오를 생성했습니다.`,
    rejected: [],
  };

  return { strategy, report };
}
