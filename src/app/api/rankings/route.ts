import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getRanking,
  getUserRank,
  type Category,
  type Period,
} from "@/lib/rankings";

export const dynamic = "force-dynamic";
export const revalidate = 60; // 1분 캐시

const VALID_CATEGORIES: Category[] = ["game", "trading", "combined"];
const VALID_PERIODS: Period[] = ["daily", "weekly", "monthly", "all"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = (searchParams.get("category") ?? "combined") as Category;
  const period = (searchParams.get("period") ?? "weekly") as Period;

  if (!VALID_CATEGORIES.includes(category))
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  if (!VALID_PERIODS.includes(period))
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });

  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [top, me] = await Promise.all([
    getRanking(category, period, 50),
    user ? getUserRank(user.id, category, period) : Promise.resolve(null),
  ]);

  return NextResponse.json({ category, period, top, me });
}
