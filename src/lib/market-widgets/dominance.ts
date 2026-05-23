// BTC Dominance — CoinGecko /global (free, no key)

export type DominanceData = {
  btc: number; // %
  eth: number; // %
  stables: number; // %
  others: number; // %
  fetchedAt: number;
};

const STABLES = new Set(["usdt", "usdc", "dai", "busd", "tusd", "fdusd", "usdp", "usdd", "frax", "gusd", "lusd", "pyusd", "usde", "usds"]);

const FALLBACK: DominanceData = { btc: 58.4, eth: 13.2, stables: 6.5, others: 21.9, fetchedAt: 0 };

export async function fetchDominance(): Promise<DominanceData> {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/global", {
      next: { revalidate: 600 },
    });
    if (!res.ok) return FALLBACK;
    const json = (await res.json()) as {
      data: { market_cap_percentage: Record<string, number> };
    };
    const pct = json.data.market_cap_percentage;
    const btc = pct.btc ?? 0;
    const eth = pct.eth ?? 0;
    const stables = Object.entries(pct)
      .filter(([k]) => STABLES.has(k.toLowerCase()))
      .reduce((sum, [, v]) => sum + v, 0);
    const others = Math.max(0, 100 - btc - eth - stables);
    return { btc, eth, stables, others, fetchedAt: Date.now() };
  } catch {
    return FALLBACK;
  }
}
