// Alt Season Index — self-computed from CoinGecko /coins/markets.
// Definition (Blockchain Center style):
//   Of top 50 coins (excluding stablecoins, wrapped BTC/ETH),
//   how many outperformed BTC over the last 90 days?
//   Score 0–100. 75+ = alt season. 25- = bitcoin season.

export type AltSeasonResult = {
  index: number; // 0..100
  totalCompared: number;
  outperformers: number;
  btcChange90d: number;
  label: string; // "Alt Season" | "Neutral" | "Bitcoin Season"
};

type Coin = {
  id: string;
  symbol: string;
  price_change_percentage_90d_in_currency?: number;
};

const EXCLUDE = new Set([
  "tether",
  "usd-coin",
  "dai",
  "first-digital-usd",
  "true-usd",
  "binance-usd",
  "frax",
  "paxos-standard",
  "wrapped-bitcoin",
  "staked-ether",
  "wrapped-steth",
  "weth",
  "wrapped-eeth",
  "leo-token",
]);

export async function fetchAltSeasonIndex(): Promise<AltSeasonResult> {
  const fallback: AltSeasonResult = {
    index: 0,
    totalCompared: 0,
    outperformers: 0,
    btcChange90d: 0,
    label: "데이터 없음",
  };
  try {
    const url = new URL("https://api.coingecko.com/api/v3/coins/markets");
    url.searchParams.set("vs_currency", "usd");
    url.searchParams.set("order", "market_cap_desc");
    url.searchParams.set("per_page", "60");
    url.searchParams.set("page", "1");
    url.searchParams.set("price_change_percentage", "90d");

    const res = await fetch(url.toString(), {
      next: { revalidate: 1800 },
    });
    if (!res.ok) throw new Error("coingecko");
    const raw = (await res.json()) as Coin[];

    const btc = raw.find((c) => c.id === "bitcoin");
    const btcChange = btc?.price_change_percentage_90d_in_currency ?? 0;

    const filtered = raw.filter(
      (c) => c.id !== "bitcoin" && !EXCLUDE.has(c.id),
    );
    const top50 = filtered.slice(0, 50);

    const outperformers = top50.filter(
      (c) =>
        typeof c.price_change_percentage_90d_in_currency === "number" &&
        (c.price_change_percentage_90d_in_currency ?? 0) > btcChange,
    ).length;
    const total = top50.length;
    const index = total > 0 ? Math.round((outperformers / total) * 100) : 0;

    let label = "Neutral";
    if (index >= 75) label = "Alt Season";
    else if (index <= 25) label = "Bitcoin Season";

    return {
      index,
      totalCompared: total,
      outperformers,
      btcChange90d: btcChange,
      label,
    };
  } catch {
    return fallback;
  }
}
