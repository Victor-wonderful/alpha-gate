import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";

export type Category = "game" | "trading" | "combined";
export type Period = "daily" | "weekly" | "monthly" | "all";

export interface RankingEntry {
  rank: number;
  user_id: string;
  display_name: string;
  score: number;
  count: number; // 거래/게임 수
}

export interface UserRankResult {
  rank: number | null; // null = 데이터 없음
  score: number;
  count: number;
  totalParticipants: number;
}

// ── 기간 계산 (KST 기준) ───────────────────────────────────────
export function getPeriodRange(period: Period): { start: Date; end: Date } {
  // KST = UTC+9
  const now = new Date();
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffsetMs);

  let start: Date;
  const end = now;

  switch (period) {
    case "daily": {
      // 오늘 00:00 KST = (UTC kstNow의 날짜 00:00) - 9h
      const kstMidnight = new Date(
        Date.UTC(
          kstNow.getUTCFullYear(),
          kstNow.getUTCMonth(),
          kstNow.getUTCDate(),
          0,
          0,
          0,
        ),
      );
      start = new Date(kstMidnight.getTime() - kstOffsetMs);
      break;
    }
    case "weekly": {
      // 이번 주 월요일 00:00 KST
      const dayOfWeek = kstNow.getUTCDay(); // 0=일, 1=월, ...
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const kstMonday = new Date(
        Date.UTC(
          kstNow.getUTCFullYear(),
          kstNow.getUTCMonth(),
          kstNow.getUTCDate() - daysFromMonday,
          0,
          0,
          0,
        ),
      );
      start = new Date(kstMonday.getTime() - kstOffsetMs);
      break;
    }
    case "monthly": {
      const kstMonth1 = new Date(
        Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), 1, 0, 0, 0),
      );
      start = new Date(kstMonth1.getTime() - kstOffsetMs);
      break;
    }
    case "all":
    default:
      start = new Date(0); // epoch
      break;
  }

  return { start, end };
}

// 지난 주 (Mon~Sun) 범위 — 보상 정산용
export function getPreviousWeekRange(): { start: Date; end: Date; periodKey: string } {
  const now = new Date();
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffsetMs);

  const dayOfWeek = kstNow.getUTCDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const kstThisMonday = new Date(
    Date.UTC(
      kstNow.getUTCFullYear(),
      kstNow.getUTCMonth(),
      kstNow.getUTCDate() - daysFromMonday,
      0,
      0,
      0,
    ),
  );
  const kstLastMonday = new Date(kstThisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);

  const start = new Date(kstLastMonday.getTime() - kstOffsetMs);
  const end = new Date(kstThisMonday.getTime() - kstOffsetMs);

  // ISO 주 키 (e.g., '2024-W12') — 지난 주 기준
  const year = kstLastMonday.getUTCFullYear();
  const week = isoWeekNumber(kstLastMonday);
  const periodKey = `weekly_${year}-W${String(week).padStart(2, "0")}`;

  return { start, end, periodKey };
}

function isoWeekNumber(d: Date): number {
  // ISO 8601 week number
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ── 점수 집계 ─────────────────────────────────────────────────

interface RawAgg {
  user_id: string;
  score: number;
  count: number;
}

async function aggregateGame(start: Date, end: Date): Promise<RawAgg[]> {
  const svc = getSupabaseService();
  const { data } = await svc
    .from("binary_games")
    .select("user_id, pnl_points")
    .eq("status", "settled")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  const map = new Map<string, { score: number; count: number }>();
  for (const row of (data ?? []) as Array<{ user_id: string; pnl_points: number | null }>) {
    const cur = map.get(row.user_id) ?? { score: 0, count: 0 };
    cur.score += Number(row.pnl_points ?? 0);
    cur.count += 1;
    map.set(row.user_id, cur);
  }
  return Array.from(map.entries()).map(([user_id, v]) => ({ user_id, ...v }));
}

async function aggregateTrading(start: Date, end: Date): Promise<RawAgg[]> {
  const svc = getSupabaseService();
  const { data } = await svc
    .from("trades")
    .select("user_id, paper_realized_pnl, mode")
    .not("closed_at", "is", null)
    .gte("closed_at", start.toISOString())
    .lt("closed_at", end.toISOString());

  const map = new Map<string, { score: number; count: number }>();
  for (const row of (data ?? []) as Array<{
    user_id: string;
    paper_realized_pnl: number | null;
    mode: string | null;
  }>) {
    if (row.mode === "backtest") continue;
    const cur = map.get(row.user_id) ?? { score: 0, count: 0 };
    cur.score += Number(row.paper_realized_pnl ?? 0);
    cur.count += 1;
    map.set(row.user_id, cur);
  }
  return Array.from(map.entries()).map(([user_id, v]) => ({ user_id, ...v }));
}

async function aggregateCombined(start: Date, end: Date): Promise<RawAgg[]> {
  const [game, trade] = await Promise.all([
    aggregateGame(start, end),
    aggregateTrading(start, end),
  ]);
  const map = new Map<string, { score: number; count: number }>();
  for (const r of [...game, ...trade]) {
    const cur = map.get(r.user_id) ?? { score: 0, count: 0 };
    cur.score += r.score;
    cur.count += r.count;
    map.set(r.user_id, cur);
  }
  return Array.from(map.entries()).map(([user_id, v]) => ({ user_id, ...v }));
}

async function aggregate(category: Category, start: Date, end: Date): Promise<RawAgg[]> {
  if (category === "game") return aggregateGame(start, end);
  if (category === "trading") return aggregateTrading(start, end);
  return aggregateCombined(start, end);
}

// ── 닉네임 조회 ───────────────────────────────────────────────
async function getDisplayNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const svc = getSupabaseService();
  const { data } = await svc
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);

  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
    const name = row.display_name ?? "익명";
    // 일부 마스킹 (4자 이상이면 뒤 2자 별표)
    const masked =
      name.length >= 4 ? name.slice(0, name.length - 2) + "**" : name;
    map.set(row.id, masked);
  }
  return map;
}

// ── 공개 API ──────────────────────────────────────────────────

export async function getRanking(
  category: Category,
  period: Period,
  limit = 50,
): Promise<RankingEntry[]> {
  const { start, end } = getPeriodRange(period);
  const aggs = await aggregate(category, start, end);
  aggs.sort((a, b) => b.score - a.score);
  const top = aggs.slice(0, limit);
  const nameMap = await getDisplayNames(top.map((a) => a.user_id));
  return top.map((a, i) => ({
    rank: i + 1,
    user_id: a.user_id,
    display_name: nameMap.get(a.user_id) ?? "익명",
    score: Math.round(a.score),
    count: a.count,
  }));
}

export async function getUserRank(
  userId: string,
  category: Category,
  period: Period,
): Promise<UserRankResult> {
  const { start, end } = getPeriodRange(period);
  const aggs = await aggregate(category, start, end);
  aggs.sort((a, b) => b.score - a.score);
  const idx = aggs.findIndex((a) => a.user_id === userId);
  const me = idx >= 0 ? aggs[idx] : null;
  return {
    rank: idx >= 0 ? idx + 1 : null,
    score: me ? Math.round(me.score) : 0,
    count: me ? me.count : 0,
    totalParticipants: aggs.length,
  };
}

// ── 주간 보상 정산 ─────────────────────────────────────────────

// 카테고리별 상금 분배
export const WEEKLY_REWARDS: Record<Category, number[]> = {
  game:     [1000, 500, 300, 100, 100, 100, 100, 100, 100, 100], // 총 2,500
  trading:  [1000, 500, 300, 100, 100, 100, 100, 100, 100, 100], // 총 2,500
  combined: [3000, 1500, 800, 300, 300, 300, 300, 300, 300, 300], // 총 7,500
};

export async function distributeWeeklyRewards(): Promise<{
  category: Category;
  paid: number;
  totalReward: number;
}[]> {
  const { creditBalance } = await import("@/lib/paper-wallet");
  const { start, end, periodKey } = getPreviousWeekRange();
  const svc = getSupabaseService();

  const results: { category: Category; paid: number; totalReward: number }[] = [];

  // 게임·통합 랭킹 제외 (2026-06) — 트레이딩 랭킹만 주간 보상 지급.
  for (const category of ["trading"] as Category[]) {
    const aggs = await aggregate(category, start, end);
    aggs.sort((a, b) => b.score - a.score);
    const rewards = WEEKLY_REWARDS[category];
    const top10 = aggs.slice(0, rewards.length).filter((a) => a.score > 0);

    let paid = 0;
    let totalReward = 0;

    for (let i = 0; i < top10.length; i++) {
      const entry = top10[i];
      const reward = rewards[i];
      if (reward <= 0) continue;

      // 중복 지급 체크
      const { data: existing } = await svc
        .from("ranking_rewards")
        .select("id")
        .eq("user_id", entry.user_id)
        .eq("category", category)
        .eq("period_key", periodKey)
        .maybeSingle();

      if (existing) continue;

      try {
        // vUSDT 입금
        await creditBalance(entry.user_id, reward, "tournament_reward", {
          category,
          period_key: periodKey,
          rank: i + 1,
          score: Math.round(entry.score),
        });

        // 보상 기록
        await svc.from("ranking_rewards").insert({
          user_id: entry.user_id,
          category,
          period_key: periodKey,
          rank: i + 1,
          score: Math.round(entry.score),
          reward,
        });

        paid++;
        totalReward += reward;
      } catch {
        // 개별 실패 무시
      }
    }

    results.push({ category, paid, totalReward });
  }

  return results;
}
