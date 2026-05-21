import "server-only";
import { NextResponse } from "next/server";
import { distributeWeeklyRewards } from "@/lib/rankings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await distributeWeeklyRewards();
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "정산 실패" },
      { status: 500 },
    );
  }
}
