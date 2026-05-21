import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") ?? "BTCUSDT";
  if (!["BTCUSDT", "ETHUSDT", "SOLUSDT"].includes(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }
  try {
    const [priceRes, tickerRes] = await Promise.all([
      fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`, {
        next: { revalidate: 0 },
      }),
      fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`, {
        next: { revalidate: 0 },
      }),
    ]);
    const priceData = await priceRes.json();
    const tickerData = await tickerRes.json();
    return NextResponse.json({
      price: Number(priceData.price),
      change24h: Number(tickerData.priceChangePercent),
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
