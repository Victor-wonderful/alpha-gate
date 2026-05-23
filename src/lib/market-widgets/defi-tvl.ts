// DefiLlama on-chain TVL snapshot.
// Free public API, no auth, very reliable.
//
// Pulls two endpoints:
//   1. /v2/historicalChainTvl  → global TVL series (USD)
//   2. /v2/chains              → current TVL per chain (unsorted)
//
// Uses the historical series to compute today + 7d-ago + 7d delta,
// and the chains list for the top-5 by TVL.

export type ChainTvl = {
  name: string;
  tvl: number;
};

export type DefiTvlSnapshot = {
  total: number;            // current global TVL ($)
  total7dAgo: number;
  delta7dPct: number;       // (now - then) / then × 100
  delta24hPct: number;
  topChains: ChainTvl[];    // top 5 by tvl, descending
  series: { date: number; tvl: number }[]; // last ~30 days, sparkline-ready
};

type HistRow = { date: number; tvl: number };
type ChainRow = { name: string; tvl: number; gecko_id?: string | null };

async function fetchHistorical(): Promise<HistRow[]> {
  const res = await fetch("https://api.llama.fi/v2/historicalChainTvl", {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`historicalChainTvl ${res.status}`);
  return (await res.json()) as HistRow[];
}

async function fetchChains(): Promise<ChainRow[]> {
  const res = await fetch("https://api.llama.fi/v2/chains", {
    next: { revalidate: 1800 },
  });
  if (!res.ok) throw new Error(`chains ${res.status}`);
  return (await res.json()) as ChainRow[];
}

export async function fetchDefiTvl(): Promise<DefiTvlSnapshot> {
  const empty: DefiTvlSnapshot = {
    total: 0,
    total7dAgo: 0,
    delta7dPct: 0,
    delta24hPct: 0,
    topChains: [],
    series: [],
  };
  try {
    const [hist, chains] = await Promise.all([
      fetchHistorical(),
      fetchChains(),
    ]);
    if (hist.length < 8) return empty;

    const last30 = hist.slice(-30);
    const latest = hist[hist.length - 1];
    const dayAgo = hist[hist.length - 2] ?? latest;
    const weekAgo = hist[hist.length - 8] ?? latest;

    const total = latest.tvl;
    const total7dAgo = weekAgo.tvl;
    const delta7dPct =
      total7dAgo > 0 ? ((total - total7dAgo) / total7dAgo) * 100 : 0;
    const delta24hPct =
      dayAgo.tvl > 0 ? ((total - dayAgo.tvl) / dayAgo.tvl) * 100 : 0;

    const topChains = [...chains]
      .filter((c) => typeof c.tvl === "number" && c.tvl > 0)
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, 5)
      .map((c) => ({ name: c.name, tvl: c.tvl }));

    return {
      total,
      total7dAgo,
      delta7dPct,
      delta24hPct,
      topChains,
      series: last30,
    };
  } catch {
    return empty;
  }
}
