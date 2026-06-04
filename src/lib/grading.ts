import type { GradeResult, ScoreReason, TradeInput } from "@/types/trade";
import { DAILY_LOSS_LIMIT_R, SAME_DIRECTION_EXPOSURE_PCT } from "@/types/trade";

export function calcRR(entry: number, stop: number, target: number, direction: "long" | "short") {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  if (risk === 0) return 0;
  if (direction === "long" && (stop >= entry || target <= entry)) return 0;
  if (direction === "short" && (stop <= entry || target >= entry)) return 0;
  return reward / risk;
}

export function gradeTrade(input: TradeInput): GradeResult {
  const reasons: ScoreReason[] = [];
  const rr = calcRR(input.entry, input.stop, input.target, input.direction);

  // ─── R:R ──────────────────────────────────────────────
  if (rr >= 3) reasons.push({ code: "rr_great", label: `손익비 ${rr.toFixed(2)}R로 우수`, points: 3 });
  else if (rr >= 2) reasons.push({ code: "rr_good", label: `손익비 ${rr.toFixed(2)}R로 양호함`, points: 2 });
  // R:R 1.5~2.0 = 손익분기 + 마진 — 정당한 +1점 (수수료 차감해도 양수 기대값)
  else if (rr >= 1.5) reasons.push({ code: "rr_fair", label: `손익비 ${rr.toFixed(2)}R로 보통`, points: 1 });
  else if (rr > 0) reasons.push({ code: "rr_low", label: `손익비 ${rr.toFixed(2)}R로 낮음`, points: 0 });
  else reasons.push({ code: "rr_invalid", label: "진입/손절/목표 구조가 잘못됨", points: -2 });

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

  // ─── 손절폭/목표 현실성 ───────────────────────────────
  const stopPctOfEntry = input.entry > 0 ? Math.abs(input.entry - input.stop) / input.entry : 0;
  if (stopPctOfEntry > 0.03)
    reasons.push({
      code: "stop_too_wide",
      label: `진입가 대비 손절폭이 ${(stopPctOfEntry * 100).toFixed(1)}%로 큼`,
      points: -1,
    });
  const targetPct = input.entry > 0 ? Math.abs(input.target - input.entry) / input.entry : 0;
  if (targetPct > 0.15 || rr > 4)
    reasons.push({ code: "target_unrealistic", label: "목표가가 현실적이지 않음", points: -1 });

  // ─── 자금 관리 자동 감지 ──────────────────────────────
  const { todayCumulativeR, openPositions, openExposurePct } = input.money;
  // 일일 손실 한도 — 2단계:
  // - 한도 도달(≤ -2R): -2점 (강한 자제 신호)
  // - 한도 근접(≤ -1.5R, 한도 0.5R 이내): -1점 (경고)
  if (todayCumulativeR <= DAILY_LOSS_LIMIT_R) {
    reasons.push({
      code: "daily_loss_limit",
      label: `오늘 누적 ${todayCumulativeR.toFixed(2)}R — 일일 손실 한도(${DAILY_LOSS_LIMIT_R}R) 도달`,
      points: -2,
    });
  } else if (todayCumulativeR <= DAILY_LOSS_LIMIT_R + 0.5) {
    reasons.push({
      code: "daily_loss_near",
      label: `오늘 누적 ${todayCumulativeR.toFixed(2)}R — 일일 손실 한도(${DAILY_LOSS_LIMIT_R}R) 근접`,
      points: -1,
    });
  }
  const duplicateSymbol = openPositions.some((p) => p.symbol === input.symbol);
  if (duplicateSymbol) {
    reasons.push({
      code: "duplicate_symbol",
      label: `${input.symbol} 포지션이 이미 진행 중 (중복 노출)`,
      points: -1,
    });
  }
  if (openExposurePct >= SAME_DIRECTION_EXPOSURE_PCT) {
    reasons.push({
      code: "overexposed",
      label: `진행 중 포지션 노출 ${openExposurePct.toFixed(0)}% — 과노출`,
      points: -2,
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
  const actions: string[] = [];
  if (grade === "D") {
    if (accountStop)
      actions.push(
        "오늘은 보류하세요 — 셋업과 무관하게 누적 손실/노출이 한도입니다. 워치리스트에 저장하고 다음 기회를 노리세요.",
      );
    else
      actions.push(
        "고위험 자리입니다. 막진 않지만, 굳이 한다면 권장 리스크의 10% 축소 사이즈로만. 더 좋은 진입을 기다리는 걸 권장합니다.",
      );
  }
  if (rr > 0 && rr < 1.5) actions.push("손익비가 낮습니다. 목표가를 조정하거나 거래를 취소하세요.");
  if (rr === 0) actions.push("진입가/손절가/목표가 방향이 어긋났습니다. 다시 입력하세요.");
  if (!input.market.not_box_middle)
    actions.push("박스권 중간입니다. 눌림 대기 또는 포지션을 절반으로 줄이세요.");
  if (!isBtcPair && !input.market.aligned_with_btc)
    actions.push("현재 시장 국면(BTC.D/USDT.D/총시총)과 다른 방향. 알트 디버전스 셋업이 아니면 추가 확인 필요.");
  if (input.marketCtx.minutesToFunding !== null && input.marketCtx.minutesToFunding <= 10)
    actions.push("펀딩 정산이 임박합니다. 슬리피지/펀딩비 부담을 감안하세요.");

  if (actions.length === 0 && grade === "A") actions.push("계획대로 진입하세요. 손절가는 반드시 지키세요.");
  if (actions.length === 0 && grade === "B")
    actions.push("진입 가능하지만 포지션을 평소의 절반으로 시작하는 것을 고려하세요.");
  if (actions.length === 0 && grade === "C")
    actions.push("조건이 부족합니다. 눌림 대기를 권장합니다.");

  return { grade, score, reasons, actions, rr, dCause };
}
