import { NextResponse, type NextRequest } from "next/server";
import { runRadarScan } from "@/lib/analysis/radar";
import { attachRadarGrades } from "@/lib/analysis/radar-grade";
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
    // 후보마다 "예상 등급"을 봇과 동일 경로로 계산해 붙인다(병렬·best-effort).
    // 등급 계산이 통째로 실패해도 스캔은 저장한다(등급만 null).
    let graded = candidates;
    try {
      graded = await attachRadarGrades(candidates);
    } catch {
      graded = candidates;
    }
    const recorded = await saveRadarScan(graded);
    return NextResponse.json({
      ok: true,
      recorded,
      top: graded.slice(0, 5).map((c) => ({ s: c.symbol, score: c.score, grade: c.grade ?? null })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
