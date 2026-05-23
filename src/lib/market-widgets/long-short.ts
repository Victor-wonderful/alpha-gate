// Binance global long/short account ratio (BTC perp).
// Free endpoint, no auth.
//
// Response shape: array of snapshots, oldest → newest.
// {
//   "symbol":"BTCUSDT",
//   "longShortRatio":"1.4342",
//   "longAccount":"0.5891",
//   "shortAccount":"0.4109",
//   "timestamp":...
// }

export type LongShortPoint = {
  longPct: number;   // 0..1, share of accounts net long
  shortPct: number;  // 0..1
  ratio: number;     // long / short
  timestamp: number;
};

export type LongShortResult = {
  latest: LongShortPoint | null;
  twentyFourHourAgo: LongShortPoint | null;
  deltaLongPct: number; // latest.longPct - 24h-ago longPct, in percentage POINTS
  series: LongShortPoint[];
};

type Raw = {
  longAccount?: string;
  shortAccount?: string;
  longShortRatio?: string;
  timestamp?: number;
};

export async function fetchLongShortRatio(
  symbol = "BTCUSDT",
): Promise<LongShortResult> {
  const empty: LongShortResult = {
    latest: null,
    twentyFourHourAgo: null,
    deltaLongPct: 0,
    series: [],
  };
  try {
    // period=1h, limit=25 → 25 hourly snapshots covering ~24h + current
    const url = `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=25`;
    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) throw new Error(`binance ${res.status}`);
    const raw = (await res.json()) as Raw[];

    const series: LongShortPoint[] = raw
      .map((r) => ({
        longPct: Number(r.longAccount) || 0,
        shortPct: Number(r.shortAccount) || 0,
        ratio: Number(r.longShortRatio) || 0,
        timestamp: r.timestamp ?? 0,
      }))
      .filter((p) => p.longPct > 0 && p.shortPct > 0);

    if (series.length === 0) return empty;
    const latest = series[series.length - 1];
    const twentyFourHourAgo = series[0];
    const deltaLongPct = (latest.longPct - twentyFourHourAgo.longPct) * 100;
    return { latest, twentyFourHourAgo, deltaLongPct, series };
  } catch {
    return empty;
  }
}
