// Technical-signal snapshot per coin — Binance spot klines + perp funding.
// All endpoints free, no auth.
//
// Per symbol we compute:
//  - Latest close (USD + KRW conversion)
//  - 1D EMA21    → trend (price vs EMA21)
//  - 1D RSI(14)  → momentum
//  - 200DMA      → long-term bias
//  - Funding rate (perpetual) → leverage skew
//
// Then a rule-based one-line read so the row scans in 2 seconds.

import { fetchUsdKrwRate } from "./fx";

export type Trend = "up" | "down" | "flat";

export type TechnicalRow = {
  symbol: string;          // "BTC"
  pair: string;            // "BTCUSDT"
  close: number;           // latest 1D close (USD)
  closeKrw: number;        // close * USD/KRW rate
  ema21: number | null;
  rsi14: number | null;
  ma200: number | null;
  fundingPct: number | null; // funding rate * 100 (per 8h)
  trend: Trend;
  rsiLabel: string;          // "과매도" | "중립" | "과매수"
  ma200Position: "above" | "below" | "unknown";
  takeaway: string;          // one-line rule-based summary
};

type Kline = (string | number)[];

const PAIRS: { symbol: string; pair: string }[] = [
  { symbol: "BTC", pair: "BTCUSDT" },
  { symbol: "ETH", pair: "ETHUSDT" },
  { symbol: "SOL", pair: "SOLUSDT" },
  { symbol: "BNB", pair: "BNBUSDT" },
  { symbol: "XRP", pair: "XRPUSDT" },
  { symbol: "ADA", pair: "ADAUSDT" },
];

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

function rsiLabelKo(v: number | null): string {
  if (v == null) return "—";
  if (v >= 70) return "과매수";
  if (v >= 55) return "강세";
  if (v >= 45) return "중립";
  if (v >= 30) return "약세";
  return "과매도";
}

function buildTakeaway(row: Omit<TechnicalRow, "takeaway">): string {
  const bits: string[] = [];
  if (row.trend === "up") bits.push("단기 상승");
  else if (row.trend === "down") bits.push("단기 하락");
  else bits.push("횡보");

  if (row.rsi14 != null) {
    if (row.rsi14 >= 70) bits.push("과열 — 추격보단 익절");
    else if (row.rsi14 <= 30) bits.push("과매도 — 단기 바운스 후보");
  }

  if (row.ma200Position === "above") bits.push("200DMA 위 (장기 강세 유지)");
  else if (row.ma200Position === "below") bits.push("200DMA 아래 (장기 약세)");

  if (row.fundingPct != null) {
    if (row.fundingPct > 0.05) bits.push("롱 과열");
    else if (row.fundingPct < -0.05) bits.push("숏 과열");
  }

  return bits.join(" · ");
}

async function fetchKlines(pair: string): Promise<number[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1d&limit=250`;
  const res = await fetch(url, { next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`klines ${pair} ${res.status}`);
  const raw = (await res.json()) as Kline[];
  return raw.map((row) => Number(row[4])); // close
}

async function fetchFunding(pair: string): Promise<number | null> {
  try {
    const url = `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${pair}`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json = (await res.json()) as { lastFundingRate?: string };
    const r = Number(json.lastFundingRate);
    return Number.isFinite(r) ? r * 100 : null;
  } catch {
    return null;
  }
}

async function buildRow(
  p: { symbol: string; pair: string },
  usdKrw: number,
): Promise<TechnicalRow> {
  try {
    const [closes, fundingPct] = await Promise.all([
      fetchKlines(p.pair),
      fetchFunding(p.pair),
    ]);
    const close = closes[closes.length - 1] ?? 0;
    const closeKrw = close * usdKrw;
    const ema21 = ema(closes, 21);
    const rsi14 = rsi(closes, 14);
    const ma200 = sma(closes, 200);

    let trend: Trend = "flat";
    if (ema21 != null) {
      const diff = (close - ema21) / ema21;
      if (diff > 0.005) trend = "up";
      else if (diff < -0.005) trend = "down";
    }
    const ma200Position: TechnicalRow["ma200Position"] =
      ma200 == null ? "unknown" : close > ma200 ? "above" : "below";

    const partial: Omit<TechnicalRow, "takeaway"> = {
      symbol: p.symbol,
      pair: p.pair,
      close,
      closeKrw,
      ema21,
      rsi14,
      ma200,
      fundingPct,
      trend,
      rsiLabel: rsiLabelKo(rsi14),
      ma200Position,
    };
    return { ...partial, takeaway: buildTakeaway(partial) };
  } catch {
    return {
      symbol: p.symbol,
      pair: p.pair,
      close: 0,
      closeKrw: 0,
      ema21: null,
      rsi14: null,
      ma200: null,
      fundingPct: null,
      trend: "flat",
      rsiLabel: "—",
      ma200Position: "unknown",
      takeaway: "데이터 없음",
    };
  }
}

export async function fetchTechnicalsSnapshot(): Promise<TechnicalRow[]> {
  const usdKrw = await fetchUsdKrwRate();
  return Promise.all(PAIRS.map((p) => buildRow(p, usdKrw)));
}
