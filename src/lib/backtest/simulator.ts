import "server-only";
import { fetchKlines, type Interval, type Candle } from "@/lib/analysis/binance";
import { STYLE_PRESETS, type TradingStyle } from "@/lib/analysis/style";

/** 시뮬레이션 결과 */
export interface BacktestSimResult {
  /** 진입가 (체결가 — 실제로 어느 봉에서 entry 가격을 터치했는지 기반) */
  entryFillPrice: number;
  /** 청산가 */
  exitPrice: number;
  /** 실현 R (수수료 반영 안 한 기본 R, gross). 청산 사유 + 방향에 따라 부호 결정. */
  resultR: number;
  /** 청산 사유 */
  exitReason: "target" | "stop" | "time" | "no_entry";
  /** 청산 시각 (ISO) */
  closedAt: string;
  /** 메타 정보 — DB simulation_meta 컬럼에 저장 */
  meta: {
    entryCandleTime: string | null;
    exitCandleTime: string | null;
    barsHeld: number;
    /** 진입 이후 최대 유리 변동 (% of entry) */
    mfePct: number;
    /** 진입 이후 최대 불리 변동 (% of entry) */
    maePct: number;
    /** 사용한 봉 interval */
    interval: Interval;
    /** 시뮬에 사용한 캔들 수 */
    candleCount: number;
    /** 진입 전 대기 봉 수 (-1이면 미체결) */
    barsToEntry: number;
  };
}

/** 트레이딩 스타일별 시뮬 시간 한도(시간 단위) */
const TIME_LIMIT_HOURS: Record<TradingStyle, number> = {
  scalp: 8,
  day: 48,
  swing: 24 * 10,    // 10일
  position: 24 * 30, // 30일
};

/** 진입 체결 허용 범위 (entry 가격 ± N%) — 너무 좁으면 미체결 빈번 */
const ENTRY_TOLERANCE_PCT = 0.3;

/** 시뮬에 사용할 봉 단위 — 너무 작으면 봉 수 과다, 너무 크면 정밀도↓ */
function intervalForStyle(style: TradingStyle): Interval {
  const preset = STYLE_PRESETS[style];
  return preset.ltf;
}

/**
 * Walk-forward 시뮬레이션
 *
 * - simulatedAt 시점부터 시작해서 forward 봉을 가져옴
 * - 각 봉에서 진입 → 손절/목표 도달 여부 체크
 * - 같은 봉에서 손절과 목표가 모두 봉 범위 안에 있으면 보수적으로 손절 가정
 * - 시간 한도 초과 시 마지막 종가로 강제 청산
 *
 * @param args
 *   - symbol: BTCUSDT 등
 *   - direction: long | short
 *   - entry/stop/target: 가격
 *   - simulatedAt: 시뮬 시작 시각 (ISO 또는 Date)
 *   - style: 시간 한도 산정용 (옵션 — 기본 swing)
 */
export async function simulateTrade(args: {
  symbol: string;
  direction: "long" | "short";
  entry: number;
  stop: number;
  target: number;
  simulatedAt: string | Date;
  style?: TradingStyle;
}): Promise<BacktestSimResult> {
  const {
    symbol,
    direction,
    entry,
    stop,
    target,
    simulatedAt,
    style = "swing",
  } = args;

  const interval = intervalForStyle(style);
  const limitHours = TIME_LIMIT_HOURS[style];

  const startMs =
    simulatedAt instanceof Date ? simulatedAt.getTime() : new Date(simulatedAt).getTime();
  const endMs = Math.min(startMs + limitHours * 60 * 60 * 1000, Date.now());

  // 한 번에 충분히 많은 봉을 받기 위해 limit 계산
  const intervalMinutes = intervalToMinutes(interval);
  const estBars = Math.ceil(((endMs - startMs) / 60_000) / intervalMinutes) + 5;
  const limit = Math.min(Math.max(estBars, 50), 1500); // Binance max 1500

  const candles = await fetchKlines(symbol, interval, limit, {
    startTime: startMs,
    endTime: endMs,
  });

  if (candles.length === 0) {
    return {
      entryFillPrice: entry,
      exitPrice: entry,
      resultR: 0,
      exitReason: "no_entry",
      closedAt: new Date(endMs).toISOString(),
      meta: {
        entryCandleTime: null,
        exitCandleTime: null,
        barsHeld: 0,
        mfePct: 0,
        maePct: 0,
        interval,
        candleCount: 0,
        barsToEntry: -1,
      },
    };
  }

  const isLong = direction === "long";
  const riskPerUnit = Math.abs(entry - stop);
  const tolerance = entry * (ENTRY_TOLERANCE_PCT / 100);

  // Step 1: 진입 체결 시점 찾기 — 봉의 [low, high]가 entry ± tolerance 범위를 터치하면 체결
  let entryIdx = -1;
  let entryFillPrice = entry;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const lo = c.low;
    const hi = c.high;
    if (lo <= entry + tolerance && hi >= entry - tolerance) {
      entryIdx = i;
      // 체결가는 entry로 가정 (보수적). 봉이 entry로 시작했으면 시가 사용.
      if (c.open >= entry - tolerance && c.open <= entry + tolerance) {
        entryFillPrice = c.open;
      } else {
        entryFillPrice = entry;
      }
      break;
    }
  }

  if (entryIdx === -1) {
    // 미체결 — 시간 만료
    const last = candles[candles.length - 1];
    return {
      entryFillPrice: entry,
      exitPrice: last.close,
      resultR: 0,
      exitReason: "no_entry",
      closedAt: new Date(last.closeTime).toISOString(),
      meta: {
        entryCandleTime: null,
        exitCandleTime: new Date(last.closeTime).toISOString(),
        barsHeld: 0,
        mfePct: 0,
        maePct: 0,
        interval,
        candleCount: candles.length,
        barsToEntry: -1,
      },
    };
  }

  // Step 2: 진입 이후 봉별로 손절/목표 체크
  let exitIdx = -1;
  let exitPrice = entryFillPrice;
  let exitReason: BacktestSimResult["exitReason"] = "time";
  let mfe = 0;
  let mae = 0;

  for (let i = entryIdx; i < candles.length; i++) {
    const c = candles[i];

    // MFE/MAE 추적 (진입 이후만)
    if (i > entryIdx) {
      const favorable = isLong ? c.high - entryFillPrice : entryFillPrice - c.low;
      const adverse = isLong ? entryFillPrice - c.low : c.high - entryFillPrice;
      if (favorable > mfe) mfe = favorable;
      if (adverse > mae) mae = adverse;
    }

    // 손절·목표 둘 다 봉 범위 안: 보수적으로 손절 가정
    const hitStop = isLong ? c.low <= stop : c.high >= stop;
    const hitTarget = isLong ? c.high >= target : c.low <= target;

    if (hitStop && hitTarget && i > entryIdx) {
      exitIdx = i;
      exitPrice = stop;
      exitReason = "stop";
      break;
    }
    if (hitStop && i > entryIdx) {
      exitIdx = i;
      exitPrice = stop;
      exitReason = "stop";
      break;
    }
    if (hitTarget && i > entryIdx) {
      exitIdx = i;
      exitPrice = target;
      exitReason = "target";
      break;
    }
  }

  // 시간 만료 — 마지막 종가로 청산
  if (exitIdx === -1) {
    exitIdx = candles.length - 1;
    exitPrice = candles[exitIdx].close;
    exitReason = "time";
  }

  // R 계산 (gross, 수수료 미반영 — UI/저장 단에서 별도 처리)
  const pnlPerUnit = isLong ? exitPrice - entryFillPrice : entryFillPrice - exitPrice;
  const resultR = riskPerUnit > 0 ? pnlPerUnit / riskPerUnit : 0;

  const entryCandle = candles[entryIdx];
  const exitCandle = candles[exitIdx];

  return {
    entryFillPrice,
    exitPrice,
    resultR,
    exitReason,
    closedAt: new Date(exitCandle.closeTime).toISOString(),
    meta: {
      entryCandleTime: new Date(entryCandle.openTime).toISOString(),
      exitCandleTime: new Date(exitCandle.closeTime).toISOString(),
      barsHeld: exitIdx - entryIdx,
      mfePct: entryFillPrice > 0 ? (mfe / entryFillPrice) * 100 : 0,
      maePct: entryFillPrice > 0 ? (mae / entryFillPrice) * 100 : 0,
      interval,
      candleCount: candles.length,
      barsToEntry: entryIdx,
    },
  };
}

/** Interval 문자열 → 분 단위 */
function intervalToMinutes(i: Interval): number {
  const map: Record<Interval, number> = {
    "1m": 1,
    "3m": 3,
    "5m": 5,
    "15m": 15,
    "1h": 60,
    "4h": 240,
    "1d": 60 * 24,
  };
  return map[i] ?? 60;
}

// avoid unused import warning if Candle type changes
export type { Candle };
