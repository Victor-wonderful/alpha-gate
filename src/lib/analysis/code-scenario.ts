import type { AnalysisSnapshot } from "./analyze";
import type { AnalysisReport } from "./synthesize";
import type { StrategyResult, StrategyId } from "./strategy";
import { STYLE_STANDARDS } from "./standards";
import { computeMarketAssessment } from "./market-assessment";

/**
 * 코드 전용 시나리오 생성기 — AI(Strategy/Scenario) 미가용 시 폴백.
 *
 * 목적: Anthropic 잔액 소진·한도·장애 등 어떤 이유로든 AI가 안 될 때도 분석이 죽지 않도록,
 * 결정론 스냅샷 + 스타일 표준으로 진입/손절/목표/방향을 코드로 생성한다.
 * (레이더 preview와 동일 논리: 방향=추세[검증 98.4%], 손절≈MTF ATR을 표준밴드로 clamp, 목표=손절×RR.)
 * 손익비·등급·사이징은 다운스트림(UI)이 entry/stop/target에서 계산하므로 여기선 그 3+방향만 만든다.
 *
 * ⚠️ AI 대비 잃는 것: 레벨 정밀도(스윙/OB 대신 ATR 추정) + 서술 품질(템플릿). warnings로 명시.
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

export function buildCodeReport(snapshot: AnalysisSnapshot): {
  strategy: StrategyResult;
  report: AnalysisReport;
} {
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
  const stopPct = clamp(atrPct > 0 ? atrPct : std.stopPct.min, std.stopPct.min, std.stopPct.max);
  const targetPct = stopPct * std.rr.min;

  const stop = direction === "long" ? price * (1 - stopPct / 100) : price * (1 + stopPct / 100);
  const target = direction === "long" ? price * (1 + targetPct / 100) : price * (1 - targetPct / 100);

  const keyLevels = [
    { label: "POC", price: vp.poc, note: "거래량 중심" },
    { label: "VAH", price: vp.vah, note: "밸류 상단" },
    { label: "VAL", price: vp.val, note: "밸류 하단" },
  ].filter((l) => Number.isFinite(l.price) && l.price > 0);

  const scenario: AnalysisReport["scenarios"][number] = {
    name: direction === "long" ? "추세 추종 롱 (코드 추정)" : "추세 추종 숏 (코드 추정)",
    direction,
    strategyHint: "trend_pullback" as StrategyId,
    entryType: "immediate",
    orderHint: "market",
    qualityIssues: clearTrend ? undefined : ["추세 불명확 — 방향 신뢰도 낮음. 진입 신중."],
    trigger:
      "AI 미가용 — 규칙 기반 현재가 부근 즉시 진입 추정. 실제 진입 전 차트 구조(스윙·매물대)를 직접 확인하세요.",
    entryZone: { low: round(price * 0.999), high: round(price * 1.001) },
    invalidation: round(stop),
    target: round(target),
    note: "코드 규칙 기반 추정 시나리오 — 레벨 정밀도가 AI보다 낮을 수 있습니다.",
    // 등급 입력(marketAssessment)은 스냅샷 사실로 계산 — AI 경로와 동일 기준.
    marketAssessment: computeMarketAssessment(snapshot, direction, price),
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
      "AI 분석 미가용 상태입니다. 규칙 기반 추정 시나리오를 참고하되, 진입 전 차트 구조를 직접 확인하세요.",
    warnings: [
      "⚙️ AI 분석 미가용 — 코드 규칙 기반 추정 결과입니다. 레벨 정밀도·설명 품질이 AI보다 낮습니다.",
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
