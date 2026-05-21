import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VALID_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const VALID_INTERVALS = ["1m", "3m", "5m", "15m"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") ?? "BTCUSDT";
  const interval = searchParams.get("interval") ?? "1m";
  const limit = Math.min(200, Math.max(10, Number(searchParams.get("limit") ?? "60")));

  if (!VALID_SYMBOLS.includes(symbol))
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  if (!VALID_INTERVALS.includes(interval))
    return NextResponse.json({ error: "Invalid interval" }, { status: 400 });

  try {
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      { next: { revalidate: 0 } },
    );
    const data = (await res.json()) as Array<[
      number, // openTime
      string, // open
      string, // high
      string, // low
      string, // close
      string, // volume
      number, // closeTime
      ...unknown[]
    ]>;

    const candles = data.map(([openTime, open, high, low, close]) => ({
      time: Math.floor(openTime / 1000),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
    }));

    return NextResponse.json({ candles });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
