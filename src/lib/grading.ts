import type { ActionItem, GradeResult, ScoreReason, TradeInput } from "@/types/trade";
import { DAILY_LOSS_LIMIT_R, TOTAL_EXPOSURE_WARN_PCT } from "@/types/trade";
import { resolveStandard } from "@/lib/analysis/standards";
import type { TradingStyle } from "@/lib/analysis/style";
import type { StrategyId } from "@/lib/analysis/strategy";

export function calcRR(entry: number, stop: number, target: number, direction: "long" | "short") {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  if (risk === 0) return 0;
  if (direction === "long" && (stop >= entry || target <= entry)) return 0;
  if (direction === "short" && (stop <= entry || target >= entry)) return 0;
  return reward / risk;
}

export function gradeTrade(
  input: TradeInput,
  style: TradingStyle = "swing",
  strategy?: StrategyId,
): GradeResult {
  const reasons: ScoreReason[] = [];
  const rr = calcRR(input.entry, input.stop, input.target, input.direction);
  // 스타일 + 전략 예외를 반영한 표준(손절/목표 상한, 최소 R:R). 전략 미지정 시 스타일 기본.
  const std = resolveStandard(style, strategy);

  // ─── R:R (스타일·전략 표준 대비) ──────────────────────────
  // 절대 상수(3/2/1.5)가 아니라 standards.ts의 (스타일,전략) rrMin에 앵커한다.
  // 스윙(rrMin 2)은 기존 상수와 동일 → 하위 동작 불변. 임펄스(1.5)·liquidity_grab(2.5) 등은
  // 그 전략이 요구하는 손익비 기준에 맞춰 자동 이동한다.
  const rrStr = rr.toFixed(2);
  const rrMin = std.rrMin;
  if (rr <= 0) reasons.push({ code: "rr_invalid", label: "진입/손절/목표 구조가 잘못됨", points: -2 });
  else if (rr >= rrMin + 1) reasons.push({ code: "rr_great", label: `손익비 ${rrStr}R로 우수`, points: 3, params: { rr: rrStr } });
  else if (rr >= rrMin) reasons.push({ code: "rr_good", label: `손익비 ${rrStr}R로 양호함`, points: 2, params: { rr: rrStr } });
  // 표준 근접(rrMin의 75%~) = 손익분기 + 얇은 마진 — 정당한 +1점.
  else if (rr >= rrMin * 0.75) reasons.push({ code: "rr_fair", label: `손익비 ${rrStr}R로 보통`, points: 1, params: { rr: rrStr } });
  else reasons.push({ code: "rr_low", label: `손익비 ${rrStr}R로 낮음 (표준 ${rrMin}+ 미달)`, points: 0, params: { rr: rrStr, min: String(rrMin) } });

  // ─── 시장 구조 ────────────────────────────────────────
  const stopClear = input.market.near_key_level && input.market.higher_highs_lows;
  if (stopClear) reasons.push({ code: "stop_clear", label: "손절 기준이 구조적으로 타당함", points: 2 });
  // BTC 자체 매매는 alignment 체크 의미 없음(자기 자신과 정렬). 알트만 체크.
  const isBtcPair = input.symbol.toUpperCase().startsWith("BTC");
  if (!isBtcPair && input.market.aligned_with_btc)
    reasons.push({ code: "btc_aligned", label: "시장 국면(도미넌스)과 정렬됨", points: 1 });
  if (input.market.not_box_middle)
    reasons.push({ code: "structure_clear", label: "구조적 위치 양호 (박스 중간 회피)", points: 1 });
  if (input.market.volume_confirm) reasons.push({ code: "volume_ok", label: "거래량 동반", points: 1 });

  if (!isBtcPair && !input.market.aligned_with_btc)
    reasons.push({ code: "btc_conflict", label: "시장 국면(도미넌스)과 충돌", points: -1 });
  if (!input.market.not_box_middle)
    reasons.push({ code: "box_middle", label: "박스권 중간 진입", points: -2 });

  // ─── 손절폭/목표 현실성 (스타일 표준 대비) ───────────────
  // 스타일마다 정상 손절/목표 범위가 다르다(임펄스 vs 모멘텀). standards.ts의 표준 상한을
  // 넘을 때만 감점 — 예전엔 3%/15% 고정이라 모멘텀(스윙) 정상 손절(2~5%)이 부당 감점됐다.
  // (전략 예외는 손절/목표 하한과 rrMin만 조정하고 상한은 그대로라, 상한 기준 감점은 전략 무관.)
  const stopPct = input.entry > 0 ? (Math.abs(input.entry - input.stop) / input.entry) * 100 : 0;
  if (stopPct > std.stopPct.max)
    reasons.push({
      code: "stop_too_wide",
      label: `진입가 대비 손절폭이 ${stopPct.toFixed(1)}%로 큼 (표준 ${std.stopPct.max}% 초과)`,
      points: -1,
      params: { pct: stopPct.toFixed(1), max: String(std.stopPct.max) },
    });
  const targetPct = input.entry > 0 ? (Math.abs(input.target - input.entry) / input.entry) * 100 : 0;
  if (targetPct > std.targetPct.max)
    reasons.push({
      code: "target_unrealistic",
      label: `목표폭이 ${targetPct.toFixed(1)}%로 과도함 (표준 ${std.targetPct.max}% 초과)`,
      points: -1,
      params: { pct: targetPct.toFixed(1), max: String(std.targetPct.max) },
    });

  // ─── 자금 관리 자동 감지 ──────────────────────────────
  const { todayCumulativeR, openPositions, openExposurePct, usedRiskPct, riskBudgetPct } = input.money;
  // 일일 손실 한도 — 2단계:
  // - 한도 도달(≤ -2R): -2점 (강한 자제 신호)
  // - 한도 근접(≤ -1.5R, 한도 0.5R 이내): -1점 (경고)
  if (todayCumulativeR <= DAILY_LOSS_LIMIT_R) {
    reasons.push({
      code: "daily_loss_limit",
      label: `오늘 누적 ${todayCumulativeR.toFixed(2)}R — 일일 손실 한도(${DAILY_LOSS_LIMIT_R}R) 도달`,
      points: -2,
      params: { r: todayCumulativeR.toFixed(2), limit: DAILY_LOSS_LIMIT_R },
    });
  } else if (todayCumulativeR <= DAILY_LOSS_LIMIT_R + 0.5) {
    reasons.push({
      code: "daily_loss_near",
      label: `오늘 누적 ${todayCumulativeR.toFixed(2)}R — 일일 손실 한도(${DAILY_LOSS_LIMIT_R}R) 근접`,
      points: -1,
      params: { r: todayCumulativeR.toFixed(2), limit: DAILY_LOSS_LIMIT_R },
    });
  }
  const duplicateSymbol = openPositions.some((p) => p.symbol === input.symbol);
  if (duplicateSymbol) {
    reasons.push({
      code: "duplicate_symbol",
      label: `${input.symbol} 포지션이 이미 진행 중 (중복 노출)`,
      points: -1,
      params: { symbol: input.symbol },
    });
  }
  // 총 노출 과다 (방향 무관 — 마진/청산 관점)
  if (openExposurePct >= TOTAL_EXPOSURE_WARN_PCT) {
    reasons.push({
      code: "overexposed",
      label: `진행 중 총 노출 ${openExposurePct.toFixed(0)}% — 과노출`,
      points: -2,
      params: { pct: openExposurePct.toFixed(0) },
    });
  }
  // 위험 예산 — 오픈+예약 포지션의 손절 손실 합이 예산을 넘었으면 신규 진입 자제.
  // 크립토는 대부분 BTC와 동조하므로 방향 무관 합산(전체가 사실상 한 베팅).
  const budget = riskBudgetPct ?? 0;
  const used = usedRiskPct ?? 0;
  if (budget > 0 && used >= budget) {
    reasons.push({
      code: "risk_budget_exhausted",
      label: `위험 예산 소진 — 오픈·예약 포지션이 이미 ${used.toFixed(1)}% / 예산 ${budget}% 사용 중. 신규 진입은 예산 초과(동시 손절 시 한도 초과 손실).`,
      points: -2,
      params: { used: used.toFixed(1), budget: String(budget) },
    });
  } else if (budget > 0 && used >= budget * 0.75) {
    reasons.push({
      code: "risk_budget_near",
      label: `위험 예산 ${used.toFixed(1)}% / ${budget}% 사용 — 남은 예산 부족, 신규 진입은 작게.`,
      points: -1,
      params: { used: used.toFixed(1), budget: String(budget) },
    });
  }

  // ─── 시장 컨텍스트 자동 감지 ──────────────────────────
  if (
    input.marketCtx.minutesToFunding !== null &&
    input.marketCtx.minutesToFunding <= 10
  )
    reasons.push({
      code: "funding_imminent",
      label: `펀딩 정산 ${input.marketCtx.minutesToFunding}분 전`,
      points: -1,
      params: { min: input.marketCtx.minutesToFunding },
    });

  // 펀딩비 극단치 (±0.05% 이상)는 군집 포지션 신호
  if (input.marketCtx.fundingRate !== null) {
    const fr = input.marketCtx.fundingRate;
    const extreme = Math.abs(fr) >= 0.0005;
    if (extreme) {
      const crowded =
        (fr > 0 && input.direction === "long") || (fr < 0 && input.direction === "short");
      if (crowded)
        reasons.push({
          code: "funding_crowded",
          label: `펀딩비 ${(fr * 100).toFixed(3)}% — 같은 방향에 군집`,
          points: -1,
          params: { rate: (fr * 100).toFixed(3) },
        });
    }
  }

  const score = reasons.reduce((s, r) => s + r.points, 0);
  const grade = score >= 8 ? "A" : score >= 5 ? "B" : score >= 2 ? "C" : "D";

  // D의 주된 원인: 계좌 상태(한도 도달/과노출 = 행동 자제 필요) vs 셋업 약함.
  // 사이즈 축소로 해결되는 셋업 문제와, "오늘은 멈춤"이 필요한 계좌 문제를 구분.
  const accountStop = reasons.some(
    (r) => r.code === "daily_loss_limit" || r.code === "overexposed",
  );
  const dCause: GradeResult["dCause"] =
    grade === "D" ? (accountStop ? "account" : "setup") : undefined;

  // ─── 행동 권고 ────────────────────────────────────────
  // 한국어 폴백(actions) + 코드 기반(actionItems)을 동시에 채운다.
  const actions: string[] = [];
  const actionItems: ActionItem[] = [];
  const pushAction = (code: string, label: string) => {
    actions.push(label);
    actionItems.push({ code });
  };
  if (grade === "D") {
    if (accountStop)
      pushAction(
        "d_account",
        "오늘은 보류하세요 — 셋업과 무관하게 누적 손실/노출이 한도입니다. 워치리스트에 저장하고 다음 기회를 노리세요.",
      );
    else
      pushAction(
        "d_setup",
        "고위험 자리입니다. 막진 않지만, 굳이 한다면 권장 리스크의 10% 축소 사이즈로만. 더 좋은 진입을 기다리는 걸 권장합니다.",
      );
  }
  if (rr > 0 && rr < 1.5) pushAction("rr_low", "손익비가 낮습니다. 목표가를 조정하거나 거래를 취소하세요.");
  if (rr === 0) pushAction("rr_zero", "진입가/손절가/목표가 방향이 어긋났습니다. 다시 입력하세요.");
  if (!input.market.not_box_middle)
    pushAction("box_middle", "박스권 중간입니다. 눌림 대기 또는 포지션을 절반으로 줄이세요.");
  if (!isBtcPair && !input.market.aligned_with_btc)
    pushAction("btc_conflict", "현재 시장 국면(BTC.D/USDT.D/총시총)과 다른 방향. 알트 디버전스 셋업이 아니면 추가 확인 필요.");
  if (input.marketCtx.minutesToFunding !== null && input.marketCtx.minutesToFunding <= 10)
    pushAction("funding_imminent", "펀딩 정산이 임박합니다. 슬리피지/펀딩비 부담을 감안하세요.");

  if (actions.length === 0 && grade === "A") pushAction("grade_a", "계획대로 진입하세요. 손절가는 반드시 지키세요.");
  if (actions.length === 0 && grade === "B")
    pushAction("grade_b", "진입 가능하지만 포지션을 평소의 절반으로 시작하는 것을 고려하세요.");
  if (actions.length === 0 && grade === "C")
    pushAction("grade_c", "조건이 부족합니다. 눌림 대기를 권장합니다.");

  return { grade, score, reasons, actions, actionItems, rr, dCause };
}
