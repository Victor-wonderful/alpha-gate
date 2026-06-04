import { NextResponse, type NextRequest } from "next/server";
import { runRadarScan } from "@/lib/analysis/radar";
import { saveRadarScan } from "@/lib/analysis/radar-persist";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 10분마다 실행. 거래대금 상위 30개 코인을 코드 구조신호로 점수화해
 * radar_candidates 에 적재. 분석 페이지의 "지금 볼 만한 코인" 패널이 읽는다.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const candidates = await runRadarScan();
    const recorded = await saveRadarScan(candidates);
    return NextResponse.json({ ok: true, recorded, top: candidates.slice(0, 5).map((c) => ({ s: c.symbol, score: c.score })) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
