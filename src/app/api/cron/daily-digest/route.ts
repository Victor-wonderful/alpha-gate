import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseService } from "@/lib/supabase/service";
import { dispatch } from "@/lib/notify-dispatch";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const svc = getSupabaseService();
  const { data: users } = await svc
    .from("notification_channels")
    .select("user_id, enable_daily_digest")
    .eq("enable_daily_digest", true);

  if (!users?.length) return NextResponse.json({ sent: 0 });

  // 어제 한국시간 00:00 ~ 23:59 (UTC 기준 어제 -9h ~ 오늘 -9h)
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600_000);
  const kstY = new Date(kstNow.getTime() - 24 * 3600_000);
  const ymd = kstY.toISOString().slice(0, 10);
  const startUtc = new Date(`${ymd}T00:00:00+09:00`);
  const endUtc = new Date(`${ymd}T23:59:59+09:00`);

  let sent = 0;
  for (const u of users) {
    const { data: trades } = await svc
      .from("trades")
      .select("pre_grade, result_r, mistake_tags, closed_at")
      .eq("user_id", u.user_id)
      .not("closed_at", "is", null)
      .gte("closed_at", startUtc.toISOString())
      .lte("closed_at", endUtc.toISOString());

    if (!trades?.length) continue;

    const total = trades.reduce((s, t) => s + Number(t.result_r ?? 0), 0);
    const byGrade: Record<string, { n: number; r: number }> = {};
    for (const t of trades) {
      const g = t.pre_grade as string;
      byGrade[g] = byGrade[g] ?? { n: 0, r: 0 };
      byGrade[g].n += 1;
      byGrade[g].r += Number(t.result_r ?? 0);
    }
    const tagFreq: Record<string, number> = {};
    for (const t of trades) for (const tag of t.mistake_tags ?? []) tagFreq[tag] = (tagFreq[tag] ?? 0) + 1;
    const topTags = Object.entries(tagFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([t, n]) => `${t}(${n})`)
      .join(", ");

    const gradeLine = Object.entries(byGrade)
      .map(([g, v]) => `${g} ${v.n}건 ${v.r.toFixed(2)}R`)
      .join(" / ");

    await dispatch(u.user_id, "daily_digest", {
      title: `${ymd} 일일 요약`,
      body: `총 ${trades.length}건, 누적 ${total.toFixed(2)}R\n${gradeLine}${topTags ? `\n주요 실수: ${topTags}` : ""}`,
    });
    sent += 1;
  }

  return NextResponse.json({ sent });
}
