import type { GradeResult, ScoreReason, TradeInput } from "@/types/trade";

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

  if (rr >= 3) reasons.push({ code: "rr_great", label: `손익비 ${rr.toFixed(2)}R로 우수`, points: 3 });
  else if (rr >= 2) reasons.push({ code: "rr_good", label: `손익비 ${rr.toFixed(2)}R로 양호함`, points: 2 });
  else if (rr > 0)
    reasons.push({ code: "rr_low", label: `손익비 ${rr.toFixed(2)}R로 낮음`, points: 0 });
  else reasons.push({ code: "rr_invalid", label: "진입/손절/목표 구조가 잘못됨", points: -2 });

  // 손절 기준 명확함: 주요 레벨 근처 + 구조(고점·저점)
  const stopClear = input.market.near_key_level && input.market.higher_highs_lows;
  if (stopClear)
    reasons.push({ code: "stop_clear", label: "손절 기준이 구조적으로 타당함", points: 2 });

  if (input.market.aligned_with_btc)
    reasons.push({ code: "btc_aligned", label: "BTC 방향과 정렬됨", points: 1 });
  if (input.market.not_box_middle)
    reasons.push({ code: "structure_clear", label: "구조적 위치 양호 (박스 중간 회피)", points: 1 });
  if (input.market.volume_confirm)
    reasons.push({ code: "volume_ok", label: "거래량 동반", points: 1 });

  // 심리 안정 보너스
  const psychPasses = (Object.values(input.psych) as boolean[]).filter(Boolean).length;
  if (psychPasses === 4)
    reasons.push({ code: "psych_stable", label: "심리 체크 전부 통과", points: 2 });

  // 손절폭 과도
  const stopPctOfEntry = input.entry > 0 ? Math.abs(input.entry - input.stop) / input.entry : 0;
  if (stopPctOfEntry > 0.03)
    reasons.push({
      code: "stop_too_wide",
      label: `진입가 대비 손절폭이 ${(stopPctOfEntry * 100).toFixed(1)}%로 큼`,
      points: -1,
    });

  // 목표가 비현실적: 목표까지 변동률이 손절폭의 5배 이상이고 손익비 4 초과
  const targetPct = input.entry > 0 ? Math.abs(input.target - input.entry) / input.entry : 0;
  if (targetPct > 0.15 || rr > 4)
    reasons.push({
      code: "target_unrealistic",
      label: "목표가가 현실적이지 않음",
      points: -1,
    });

  if (!input.market.aligned_with_btc)
    reasons.push({ code: "btc_conflict", label: "BTC 방향과 충돌하는 매매", points: -2 });

  if (!input.market.not_box_middle)
    reasons.push({ code: "box_middle", label: "박스권 중간 진입", points: -2 });

  if (input.flags.newsRecent)
    reasons.push({ code: "news_recent", label: "뉴스 직후 진입", points: -1 });

  if (input.flags.losingStreak)
    reasons.push({ code: "losing_streak", label: "연속 손실 후 진입", points: -2 });

  // Psych: 모두 만족하지 않으면 마이너스
  const psychFails = (Object.values(input.psych) as boolean[]).filter((v) => !v).length;
  if (psychFails >= 2)
    reasons.push({
      code: "psych_unstable",
      label: `심리 점검 ${psychFails}개 미충족`,
      points: -1,
    });

  const score = reasons.reduce((s, r) => s + r.points, 0);
  const grade = score >= 8 ? "A" : score >= 5 ? "B" : score >= 2 ? "C" : "D";

  const actions: string[] = [];
  if (grade === "D") actions.push("이 거래는 하지 마세요. 조건이 너무 나쁩니다.");
  if (input.flags.losingStreak && grade !== "A")
    actions.push("연속 손실 상태입니다. 오늘은 거래를 멈추는 것을 권장합니다.");
  if (rr > 0 && rr < 1.5) actions.push("손익비가 낮습니다. 목표가를 조정하거나 거래를 취소하세요.");
  if (rr === 0) actions.push("진입가/손절가/목표가 방향이 어긋났습니다. 다시 입력하세요.");
  if (!input.market.not_box_middle)
    actions.push("박스권 중간입니다. 눌림 대기 또는 포지션을 절반으로 줄이세요.");
  if (!input.market.aligned_with_btc)
    actions.push("BTC 방향과 반대 매매입니다. 추가 검증 없이는 비추천.");
  if (input.flags.newsRecent) actions.push("뉴스 직후 진입은 슬리피지 위험이 큽니다.");
  if (psychFails >= 2) actions.push("심리 상태가 흔들립니다. 거래보다 휴식이 우선입니다.");
  if (actions.length === 0 && grade === "A") actions.push("계획대로 진입하세요. 손절가는 반드시 지키세요.");
  if (actions.length === 0 && grade === "B")
    actions.push("진입 가능하지만 포지션을 평소의 절반으로 시작하는 것을 고려하세요.");
  if (actions.length === 0 && grade === "C")
    actions.push("추격 가능성이 있습니다. 눌림 대기를 권장합니다.");

  return { grade, score, reasons, actions, rr };
}
