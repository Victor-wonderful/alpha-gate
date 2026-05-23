// Fear & Greed Index — alternative.me (free, no key)
// Docs: https://alternative.me/crypto/fear-and-greed-index/

export type FngPoint = { value: number; ts: number };
export type FngData = {
  value: number; // 0..100
  label: string;
  change: number; // delta vs yesterday
  weekAgo: number; // value 7 days ago
  history: FngPoint[]; // 8 points oldest→newest (today included)
  fetchedAt: number;
};

const FALLBACK: FngData = {
  value: 38,
  label: "Fear",
  change: -9,
  weekAgo: 55,
  history: [55, 52, 48, 45, 47, 42, 47, 38].map((v, i) => ({ value: v, ts: i })),
  fetchedAt: 0,
};

export async function fetchFng(): Promise<FngData> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=8", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return FALLBACK;
    const json = (await res.json()) as {
      data: { value: string; value_classification: string; timestamp: string }[];
    };
    // API returns newest first → reverse to oldest first for chart
    const ordered = [...json.data].reverse();
    const history: FngPoint[] = ordered.map((d) => ({
      value: Number(d.value),
      ts: Number(d.timestamp),
    }));
    const today = json.data[0];
    const yesterday = json.data[1];
    const week = json.data[7] ?? json.data[json.data.length - 1];
    const value = Number(today.value);
    return {
      value,
      label: today.value_classification,
      change: value - Number(yesterday?.value ?? value),
      weekAgo: Number(week.value),
      history,
      fetchedAt: Date.now(),
    };
  } catch {
    return FALLBACK;
  }
}
