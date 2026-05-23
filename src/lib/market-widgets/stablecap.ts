// Stablecoin market-cap snapshot — real supply (mcap) change over 7 days.
//
// Stablecoins are price-pegged, so `price_change_percentage_7d_in_currency`
// is meaningless (it's just peg drift, basis points). What actually matters
// for liquidity context is supply expansion/contraction = mcap change.
//
// We pull each coin's daily market_caps series for the last 7 days and
// compare today vs ~7 days ago.

export type StableCoin = {
  symbol: string;
  name: string;
  marketCap: number;        // current $
  marketCap7dAgo: number;   // $ ~7d ago
  change7dPct: number;      // (now - then) / then × 100
};

const TARGETS: { id: string; symbol: string; name: string }[] = [
  { id: "tether", symbol: "USDT", name: "Tether" },
  { id: "usd-coin", symbol: "USDC", name: "USD Coin" },
  { id: "dai", symbol: "DAI", name: "Dai" },
  { id: "first-digital-usd", symbol: "FDUSD", name: "First Digital USD" },
];

type ChartResp = {
  market_caps?: [number, number][]; // [ts_ms, mcap]
};

async function fetchOne(id: string): Promise<{
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

export async function fetchStablecoinMcap(): Promise<{
  total: number;
  total7dDeltaPct: number;
  coins: StableCoin[];
}> {
  const empty = { total: 0, total7dDeltaPct: 0, coins: [] };
  try {
    const results = await Promise.all(TARGETS.map((t) => fetchOne(t.id)));

    const coins: StableCoin[] = TARGETS.map((t, i) => {
      const r = results[i];
      const current = r?.current ?? 0;
      const then = r?.weekAgo ?? 0;
      const change7dPct = then > 0 ? ((current - then) / then) * 100 : 0;
      return {
        symbol: t.symbol,
        name: t.name,
        marketCap: current,
        marketCap7dAgo: then,
        change7dPct,
      };
    }).filter((c) => c.marketCap > 0);

    const total = coins.reduce((s, c) => s + c.marketCap, 0);
    const totalThen = coins.reduce((s, c) => s + c.marketCap7dAgo, 0);
    const total7dDeltaPct =
      totalThen > 0 ? ((total - totalThen) / totalThen) * 100 : 0;

    return { total, total7dDeltaPct, coins };
  } catch {
    return empty;
  }
}
