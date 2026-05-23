// Capital flow snapshot — synthesizes BTC, ETH, Stablecoin, and total market
// cap into a single "where is the money moving" view, plus a regime classifier.
//
// Data sources (all free, no key):
//  - CoinGecko /global               → total mcap (now), BTC.D / ETH.D / Stables.D / Others.D, 24h total change
//  - CoinGecko /coins/{id}/market_chart?days=7 → BTC + ETH mcap 7 days back
//  - fetchStablecoinMcap()           → reuse — total stables + 7d delta
//
// 7-day "alt mcap" change is derived. Total 7d ago is approximated by
// dividing BTC 7d-ago mcap by *current* BTC.D — exact only if dominance
// is unchanged, which is roughly true over a week (typical drift < 1pp).

import { fetchStablecoinMcap } from "./stablecap";

export type Regime =
  | "alt_season_entry"        // 자금 유입 + BTC.D ↓ + alts strong
  | "btc_led_rally"           // 자금 유입 + BTC leads
  | "rotation_alts_to_btc"    // alts → BTC rotation, alt-season ending
  | "deleveraging"            // capital exiting crypto
  | "liquidity_tightening"    // stables ↓ + total flat
  | "stables_deploying"       // stables ↓ + alts ↑ (peak alt season)
  | "neutral";                // ±1% all around

export type CapitalFlowSnapshot = {
  // Market caps (current)
  totalMcap: number;
  btcMcap: number;
  ethMcap: number;
  stableMcap: number;
  altMcap: number;            // total − BTC − ETH − stables

  // 24h change
  total24hPct: number;

  // 7d changes (%)
  btc7dPct: number;
  eth7dPct: number;
  stable7dPct: number;
  alt7dPct: number;
  total7dPct: number;         // derived sum

  // Dominance (current)
  btcDominance: number;
  ethDominance: number;
  stableDominance: number;
  altDominance: number;

  regime: Regime;
};

type GlobalResp = {
  data: {
    total_market_cap: { usd: number };
    market_cap_percentage: Record<string, number>;
    market_cap_change_percentage_24h_usd: number;
  };
};

type ChartResp = {
  market_caps?: [number, number][]; // [ts_ms, mcap]
};

const STABLES = new Set([
  "usdt", "usdc", "dai", "busd", "tusd", "fdusd", "usdp", "usdd",
  "frax", "gusd", "lusd", "pyusd", "usde", "usds",
]);

async function fetchGlobal(): Promise<{
  total: number;
  btcD: number;
  ethD: number;
  stableD: number;
  total24h: number;
} | null> {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/global", {
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as GlobalResp;
    const pct = json.data.market_cap_percentage;
    const btcD = pct.btc ?? 0;
    const ethD = pct.eth ?? 0;
    const stableD = Object.entries(pct)
      .filter(([k]) => STABLES.has(k.toLowerCase()))
      .reduce((s, [, v]) => s + v, 0);
    return {
      total: json.data.total_market_cap.usd,
      btcD,
      ethD,
      stableD,
      total24h: json.data.market_cap_change_percentage_24h_usd,
    };
  } catch {
    return null;
  }
}

async function fetchCoinChart(id: string): Promise<{
  current: number;
  weekAgo: number;
} | null> {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=7&interval=daily`;
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const json = (await res.json()) as ChartResp;
    const caps = json.market_caps ?? [];
    if (caps.length < 2) return null;
    return {
      current: caps[caps.length - 1][1] ?? 0,
      weekAgo: caps[0][1] ?? 0,
    };
  } catch {
    return null;
  }
}

function classifyRegime({
  btc7d,
  eth7d,
  stable7d,
  alt7d,
  total7d,
  btcDDelta,
}: {
  btc7d: number;
  eth7d: number;
  stable7d: number;
  alt7d: number;
  total7d: number;
  btcDDelta: number;
}): Regime {
  // All flat
  if (
    Math.abs(btc7d) < 1.5 &&
    Math.abs(stable7d) < 0.5 &&
    Math.abs(alt7d) < 2
  )
    return "neutral";

  // Capital exiting
  if (total7d <= -3 && stable7d <= -0.5) return "deleveraging";
  if (stable7d <= -1 && Math.abs(total7d) < 2) return "liquidity_tightening";

  // Capital entering + alts leading
  if (stable7d >= 0.5 && btcDDelta < -0.5 && alt7d > btc7d && alt7d > 3)
    return "alt_season_entry";

  // Capital entering + BTC leading
  if (stable7d >= 0.5 && btc7d > 3 && btc7d >= alt7d)
    return "btc_led_rally";

  // Stables decreasing while alts rising = stables deploying
  if (stable7d <= -0.5 && alt7d > 3) return "stables_deploying";

  // Money flowing from alts to BTC (alt season ending)
  if (alt7d < -2 && btc7d > 0) return "rotation_alts_to_btc";

  return "neutral";
}

export async function fetchCapitalFlow(): Promise<CapitalFlowSnapshot | null> {
  const [globalData, btcChart, ethChart, stableData] = await Promise.all([
    fetchGlobal(),
    fetchCoinChart("bitcoin"),
    fetchCoinChart("ethereum"),
    fetchStablecoinMcap(),
  ]);

  if (!globalData || !btcChart || !ethChart) return null;

  const totalMcap = globalData.total;
  const btcMcap = btcChart.current;
  const ethMcap = ethChart.current;
  const stableMcap = stableData.total;
  const altMcap = Math.max(0, totalMcap - btcMcap - ethMcap - stableMcap);

  // 7d ago — approximate total by dividing BTC 7d-ago mcap by *current* BTC.D
  const btc7dAgo = btcChart.weekAgo;
  const eth7dAgo = ethChart.weekAgo;
  const stable7dAgo = stableData.coins.reduce(
    (s, c) => s + c.marketCap7dAgo,
    0,
  );
  // If current BTC.D is 0 (broken), fall back to summing the parts.
  const total7dAgo =
    globalData.btcD > 0
      ? (btc7dAgo / globalData.btcD) * 100
      : btc7dAgo + eth7dAgo + stable7dAgo;
  const alt7dAgo = Math.max(
    0,
    total7dAgo - btc7dAgo - eth7dAgo - stable7dAgo,
  );

  const btc7dPct = btc7dAgo > 0 ? ((btcMcap - btc7dAgo) / btc7dAgo) * 100 : 0;
  const eth7dPct = eth7dAgo > 0 ? ((ethMcap - eth7dAgo) / eth7dAgo) * 100 : 0;
  const stable7dPct = stableData.total7dDeltaPct;
  const alt7dPct =
    alt7dAgo > 0 ? ((altMcap - alt7dAgo) / alt7dAgo) * 100 : 0;
  const total7dPct =
    total7dAgo > 0 ? ((totalMcap - total7dAgo) / total7dAgo) * 100 : 0;

  // BTC.D 7d ago approximation: btc7dAgo / total7dAgo * 100
  const btcD7dAgo =
    total7dAgo > 0 ? (btc7dAgo / total7dAgo) * 100 : globalData.btcD;
  const btcDDelta = globalData.btcD - btcD7dAgo;

  const regime = classifyRegime({
    btc7d: btc7dPct,
    eth7d: eth7dPct,
    stable7d: stable7dPct,
    alt7d: alt7dPct,
    total7d: total7dPct,
    btcDDelta,
  });

  const others = Math.max(
    0,
    100 - globalData.btcD - globalData.ethD - globalData.stableD,
  );

  return {
    totalMcap,
    btcMcap,
    ethMcap,
    stableMcap,
    altMcap,
    total24hPct: globalData.total24h,
    btc7dPct,
    eth7dPct,
    stable7dPct,
    alt7dPct,
    total7dPct,
    btcDominance: globalData.btcD,
    ethDominance: globalData.ethD,
    stableDominance: globalData.stableD,
    altDominance: others,
    regime,
  };
}
