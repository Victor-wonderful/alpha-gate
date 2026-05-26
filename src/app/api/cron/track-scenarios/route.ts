import { NextResponse, type NextRequest } from "next/server";
import { runTrackScenarios } from "@/lib/analysis/track-scenarios";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 5분마다 실행. AI 분석 시나리오의 entry/target/stop 가격 도달 자동 추적.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const result = await runTrackScenarios();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
