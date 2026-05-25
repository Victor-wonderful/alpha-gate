import { NextResponse, type NextRequest } from "next/server";
import { runArbitrageResolve } from "@/lib/arbitrage/resolve";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 5분마다 실행. 김프 차익거래 리밸런싱 인벤토리 모델.
 * 실제 로직은 src/lib/arbitrage/resolve.ts.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const result = await runArbitrageResolve();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
