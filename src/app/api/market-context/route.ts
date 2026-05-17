import { NextResponse } from "next/server";
import { getMarketContext } from "@/lib/market-context";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "BTCUSDT";
  if (!/^[A-Z0-9]{2,15}USDT$/i.test(symbol)) {
    return NextResponse.json({ error: "invalid symbol" }, { status: 400 });
  }
  const ctx = await getMarketContext(symbol.toUpperCase());
  return NextResponse.json(ctx);
}
