import type { Candle } from "./binance";

// ─────────────────────────────────────────────────────────────────────────────
// Funding Squeeze — extreme funding + persistent trend + OI surge = crowded
// one-sided positioning. A liquidation cascade in the opposite direction is
// the high-RR play.
// ─────────────────────────────────────────────────────────────────────────────

export interface FundingSqueezeSignal {
  active: boolean;
  /** Side of the crowd (the OVERloaded side). Reverse-trade this. */
  direction: "long" | "short" | null;
  /** 0..1 — strength of the squeeze signal. Combines funding magnitude,
   *  persistence, and OI change. */
  intensity: number;
  /** Human-readable reason for UI / logs. */
  reason: string;
  /** Underlying components (for debugging). */
  components: {
    fundingRate: number;
    avg24h: number;
    fundingTrend: "rising" | "falling" | "flat" | null;
    oiHourChangePct: number | null;
    oi4hChangePct: number | null;
  };
}

export interface FundingSqueezeInput {
  fundingRate: number;
  fundingHistory: {
    avg24h: number;
    trend: "rising" | "falling" | "flat";
  } | null;
  oiDelta: {
    hourChangePct: number | null;
    fourHourChangePct: number | null;
  } | null;
}

/** Decide whether a funding squeeze is actionable RIGHT NOW.
 *
 *  Heuristic (BTC/ETH calibrated, USDT-M perps):
 *  - |funding| ≥ 0.04% per 8h is "elevated"
 *  - |funding| ≥ 0.08% is "extreme"
 *  - Persistence: avg24h same sign + trend not "flat" toward zero
 *  - OI surge: |hourChange| ≥ 3% or |4hChange| ≥ 15% in the same direction
 *  All three must agree for active=true.
 */
export function detectFundingSqueeze(input: FundingSqueezeInput): FundingSqueezeSignal {
  const { fundingRate, fundingHistory, oiDelta } = input;
  const funding = fundingRate; // already in decimal form (e.g. 0.0005 = 0.05%)
  const absFund = Math.abs(funding);

  const components = {
    fundingRate: funding,
    avg24h: fundingHistory?.avg24h ?? 0,
    fundingTrend: fundingHistory?.trend ?? null,
    oiHourChangePct: oiDelta?.hourChangePct ?? null,
    oi4hChangePct: oiDelta?.fourHourChangePct ?? null,
  };

  // Convert percentage thresholds (funding is in decimal, 0.0004 = 0.04%)
  const ELEVATED = 0.0004;
  const EXTREME = 0.0008;
  if (absFund < ELEVATED) {
    return {
      active: false,
      direction: null,
      intensity: 0,
      reason: `펀딩 ${(funding * 100).toFixed(3)}% — 임계(±0.04%) 미달`,
      components,
    };
  }

  // Persistence — avg24h must be same sign and at least half of current.
  const avg = fundingHistory?.avg24h ?? 0;
  const persistent =
    Math.sign(avg) === Math.sign(funding) && Math.abs(avg) >= absFund * 0.4;
  if (!persistent) {
    return {
      active: false,
      direction: null,
      intensity: 0.2,
      reason: `펀딩 ${(funding * 100).toFixed(3)}% 극단이나 24h 평균(${(avg * 100).toFixed(3)}%)과 정합 부족 — 일시적 가능성`,
      components,
    };
  }

  // OI surge — must be present in same direction (positive when funding is positive
  // means longs are piling in, increasing crowdedness).
  const oi4h = oiDelta?.fourHourChangePct ?? null;
  const oi1h = oiDelta?.hourChangePct ?? null;
  const oiCrowd =
    (oi4h !== null && Math.abs(oi4h) >= 15 && Math.sign(oi4h) === Math.sign(funding)) ||
    (oi1h !== null && Math.abs(oi1h) >= 3 && Math.sign(oi1h) === Math.sign(funding));

  if (!oiCrowd) {
    return {
      active: false,
      direction: null,
      intensity: 0.4,
      reason: `펀딩 ${(funding * 100).toFixed(3)}% 극단·지속이나 OI 증가 미확인 — 군집 형성 신호 부족`,
      components,
    };
  }

  // All three agree. Direction is the crowd side (= sign of funding).
  // Reverse this when trading: funding > 0 → longs crowded → SHORT.
  const direction: "long" | "short" = funding > 0 ? "long" : "short";

  // Intensity 0..1: scales with funding magnitude (up to EXTREME) + OI surge.
  const fundingScore = Math.min(1, absFund / EXTREME);
  const oiScore = Math.min(
    1,
    Math.max(
      oi4h !== null ? Math.abs(oi4h) / 30 : 0,
      oi1h !== null ? Math.abs(oi1h) / 6 : 0,
    ),
  );
  const intensity = Math.min(1, 0.5 * fundingScore + 0.5 * oiScore);

  return {
    active: true,
    direction,
    intensity,
    reason: `펀딩 ${(funding * 100).toFixed(3)}% (24h 평균 ${(avg * 100).toFixed(3)}%) + OI ${oi4h !== null ? `4h ${oi4h.toFixed(1)}%` : `1h ${(oi1h ?? 0).toFixed(1)}%`} → ${direction === "long" ? "롱" : "숏"} 군집 형성. 반대 방향 진입 후보`,
    components,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Session Open Drive — first 30~60 minutes of the US session often set the
// daily directional bias (NYC ORB pattern). If the opening candle drives hard
// with above-average volume, the day trades in that direction more often than
// chance.
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionOpenDriveSignal {
  active: boolean;
  direction: "long" | "short" | null;
  /** 0..1 — intensity of the drive (% move × volume ratio). */
  intensity: number;
  reason: string;
  components: {
    sessionCurrent: string;
    minutesIntoSession: number;
    openPrice: number | null;
    currentPrice: number | null;
    movePct: number | null;
    volumeRatio: number | null;
  };
}

export interface SessionOpenDriveInput {
  session: {
    current: "Asia" | "EU" | "US" | "Off";
    minutesIntoSession: number;
  } | undefined;
  /** LTF candles (1m/5m/15m typical). Must be ordered oldest → newest. */
  ltfCandles: Candle[];
  /** Trading style — only scalp/day care about session open drive. */
  style: "scalp" | "day" | "swing" | "position";
}

/** Detect the US-session opening drive setup.
 *
 *  Activation conditions (all must hold):
 *  1. style is "scalp" or "day"
 *  2. session.current === "US" and minutesIntoSession ≤ 60
 *  3. Price has moved at least ±0.4% from the candle that opened nearest the
 *     session start
 *  4. Volume of recent bars is ≥ 1.5× the trailing average
 */
export function detectSessionOpenDrive(input: SessionOpenDriveInput): SessionOpenDriveSignal {
  const { session, ltfCandles, style } = input;

  const baseComponents = {
    sessionCurrent: session?.current ?? "Off",
    minutesIntoSession: session?.minutesIntoSession ?? 0,
    openPrice: null as number | null,
    currentPrice: null as number | null,
    movePct: null as number | null,
    volumeRatio: null as number | null,
  };

  if (style !== "scalp" && style !== "day") {
    return {
      active: false,
      direction: null,
      intensity: 0,
      reason: "스타일이 스캘프/데이가 아님 — 세션 오픈 드라이브 무관",
      components: baseComponents,
    };
  }

  if (!session || session.current !== "US") {
    return {
      active: false,
      direction: null,
      intensity: 0,
      reason: `현재 세션 "${session?.current ?? "Off"}" — 미국 개장 아님`,
      components: baseComponents,
    };
  }

  if (session.minutesIntoSession > 60) {
    return {
      active: false,
      direction: null,
      intensity: 0,
      reason: `미국 개장 후 ${session.minutesIntoSession}분 경과 — 윈도우(60분) 지남`,
      components: baseComponents,
    };
  }

  if (ltfCandles.length < 20) {
    return {
      active: false,
      direction: null,
      intensity: 0,
      reason: "LTF 캔들 데이터 부족",
      components: baseComponents,
    };
  }

  // Find the candle that contains the session-open moment.
  // session.minutesIntoSession says how far in we are; ltfCandles are recent.
  // Estimate by walking back N candles based on TF size.
  // Heuristic: assume each candle is ~ (60 / minutesIntoSession ratio) — but
  // we don't have TF here. Simpler: use last (minutesIntoSession / barMinutes)
  // candles. We can detect bar minutes from candle openTime gaps.
  const last = ltfCandles[ltfCandles.length - 1];
  const prev = ltfCandles[ltfCandles.length - 2];
  const barMs = last.openTime - prev.openTime;
  const barMin = Math.max(1, Math.round(barMs / 60_000));
  const barsBack = Math.max(1, Math.min(ltfCandles.length - 1, Math.round(session.minutesIntoSession / barMin)));
  const openCandle = ltfCandles[ltfCandles.length - 1 - barsBack];
  const openPrice = openCandle.open;
  const currentPrice = last.close;
  const movePct = ((currentPrice - openPrice) / openPrice) * 100;

  // Volume ratio: recent (last `barsBack`) avg volume vs trailing (prior 20 bars).
  const recentVols = ltfCandles.slice(-barsBack).map((c) => c.volume);
  const recentAvg = recentVols.reduce((a, b) => a + b, 0) / Math.max(1, recentVols.length);
  const trailingVols = ltfCandles
    .slice(Math.max(0, ltfCandles.length - barsBack - 20), ltfCandles.length - barsBack)
    .map((c) => c.volume);
  const trailingAvg = trailingVols.reduce((a, b) => a + b, 0) / Math.max(1, trailingVols.length);
  const volumeRatio = trailingAvg > 0 ? recentAvg / trailingAvg : 1;

  const components = {
    ...baseComponents,
    openPrice,
    currentPrice,
    movePct,
    volumeRatio,
  };

  const absMove = Math.abs(movePct);
  if (absMove < 0.4) {
    return {
      active: false,
      direction: null,
      intensity: absMove / 0.4,
      reason: `개장 후 ${absMove.toFixed(2)}% 이동 — 임계(0.4%) 미달, 방향성 약함`,
      components,
    };
  }

  if (volumeRatio < 1.5) {
    return {
      active: false,
      direction: null,
      intensity: 0.3,
      reason: `이동(${movePct.toFixed(2)}%)은 있으나 거래량 ${volumeRatio.toFixed(2)}× — 평균 대비 1.5× 미달`,
      components,
    };
  }

  const direction: "long" | "short" = movePct > 0 ? "long" : "short";
  // Intensity 0..1
  const moveScore = Math.min(1, absMove / 1.2); // 1.2% = max
  const volScore = Math.min(1, (volumeRatio - 1) / 2); // ratio of 3.0 → full score
  const intensity = Math.min(1, 0.6 * moveScore + 0.4 * volScore);

  return {
    active: true,
    direction,
    intensity,
    reason: `미국 개장 ${session.minutesIntoSession}분 — ${movePct >= 0 ? "+" : ""}${movePct.toFixed(2)}% 이동 + 거래량 ${volumeRatio.toFixed(2)}× → ${direction === "long" ? "롱" : "숏"} 추종`,
    components,
  };
}
