import "server-only";
import { NextResponse } from "next/server";
import { checkAndFillLimitOrders } from "@/lib/limit-order-filler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const filled = await checkAndFillLimitOrders();
    return NextResponse.json({ filled, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[fill-limit-orders] 실행 오류:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
