import "server-only";
import { NextResponse } from "next/server";
import { runAllAutoTrades } from "@/lib/auto-trade";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const r = await runAllAutoTrades();
    return NextResponse.json({ ok: true, ...r, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[auto-trade] 실행 오류:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
