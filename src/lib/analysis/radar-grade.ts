import "server-only";
import { buildSnapshot } from "./analyze";
import { buildCodeReport } from "./code-scenario";
import { gradeTrade } from "@/lib/grading";
import {
  TRIGGER_CHECK_KEYS,
  TOTAL_RISK_BUDGET_PCT,
  type TradeInput,
  type Timeframe,
  type MoneyContext,
} from "@/types/trade";
import type { TradingStyle } from "./style";
import type { RadarCandidate } from "./radar";

/**
 * 레이더 후보의 "예상 등급" 계산 — 봇과 완전히 같은 경로
 * (buildSnapshot → buildCodeReport → gradeTrade). 단 **사용자 무관 중립 컨텍스트**로,
 * 위험예산·보유 포지션 같은 개인 상태는 빼고 "이 셋업 본연의 품질"만 잰다.
 * (레이더는 모든 사용자가 공유하는 스캔이므로.) 실패는 null — 스캔을 막지 않는다.
 */

const STYLE_TF: Record<"day" | "swing", Timeframe> = { day: "1h", swing: "4h" };

/** 레이더 bestStyle → 봇이 지원하는 2종. scalp→day, position→swing. */
function normalizeStyle(s: TradingStyle): "day" | "swing" {
  return s === "swing" || s === "position" ? "swing" : "day";
}

// 위험예산 가득·포지션 없음 → risk_budget/중복노출 감점이 걸리지 않는 중립 상태.
const NEUTRAL_MONEY: MoneyContext = {
  todayCumulativeR: 0,
  todayClosedCount: 0,
  openPositions: [],
  openExposurePct: 0,
  longExposurePct: 0,
  shortExposurePct: 0,
  usedRiskPct: 0,
  riskBudgetPct: TOTAL_RISK_BUDGET_PCT,
  remainingRiskPct: TOTAL_RISK_BUDGET_PCT,
};

async function gradeOne(symbol: string, bestStyle: TradingStyle): Promise<string | null> {
  try {
    const style = normalizeStyle(bestStyle);
    const snapshot = await buildSnapshot(symbol, style);
    const { report } = buildCodeReport(snapshot);
    const sc = report.scenarios[0];
    if (!sc) return null;

    const price = snapshot.ticker.last;
    const now = Date.now();
    const input = {
      symbol,
      direction: sc.direction,
      timeframe: STYLE_TF[style],
      entry: (sc.entryZone.low + sc.entryZone.high) / 2,
      stop: sc.invalidation,
      target: sc.target,
      accountSize: 10000,
      allowedLossPct: 1,
      market: sc.marketAssessment,
      trigger: Object.fromEntries(TRIGGER_CHECK_KEYS.map((k) => [k, false])),
      money: NEUTRAL_MONEY,
      marketCtx: {
        btcPrice: null,
        btc24hChangePct: null,
        symbolPrice: price,
        fundingRate: snapshot.funding?.rate ?? null,
        minutesToFunding: snapshot.funding?.nextFundingTime
          ? Math.max(0, Math.round((snapshot.funding.nextFundingTime - now) / 60_000))
          : null,
      },
    } as TradeInput;

    return gradeTrade(input, style, sc.strategyHint).grade;
  } catch {
    return null; // best-effort — 한 코인 실패가 스캔 전체를 막지 않는다.
  }
}

/** 후보들에 예상 등급을 병렬로 채운 새 배열 반환. */
export async function attachRadarGrades(candidates: RadarCandidate[]): Promise<RadarCandidate[]> {
  const grades = await Promise.all(candidates.map((c) => gradeOne(c.symbol, c.bestStyle)));
  return candidates.map((c, i) => ({ ...c, grade: grades[i] }));
}
