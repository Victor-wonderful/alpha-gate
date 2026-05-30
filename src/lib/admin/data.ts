import "server-only";
import { getSupabaseService } from "@/lib/supabase/service";

export interface AdminUserRow {
  id: string;
  email: string;
  createdAt: string;
  displayName: string | null;
  disabled: boolean;
  usdtBalance: number;
  aiCredits: number;
  usedMargin: number;
  startingBalance: number;
  analysesCount: number;
  tradesCount: number;
}

/**
 * Full member roster for the admin panel. Joins auth.users (email) with
 * profiles (display name / disabled) and paper_wallets, then tallies per-user
 * analysis/trade counts in memory. Service-role only.
 *
 * MVP scale: fetches up to 1000 users in one page and tallies counts from the
 * full id columns. Revisit with SQL aggregates if the user base grows large.
 */
export async function listAllUsers(): Promise<AdminUserRow[]> {
  const svc = getSupabaseService();

  const [authRes, profilesRes, walletsRes, analysesRes, tradesRes] = await Promise.all([
    svc.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    svc.from("profiles").select("id, display_name, disabled"),
    svc
      .from("paper_wallets")
      .select("user_id, usdt_balance, ai_credits, used_margin, starting_balance"),
    svc.from("analyses").select("user_id"),
    svc.from("trades").select("user_id"),
  ]);

  const profiles = new Map(
    (profilesRes.data ?? []).map((p) => [p.id as string, p]),
  );
  const wallets = new Map(
    (walletsRes.data ?? []).map((w) => [w.user_id as string, w]),
  );

  const tally = (rows: { user_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1);
    return m;
  };
  const analysesByUser = tally(analysesRes.data as { user_id: string }[] | null);
  const tradesByUser = tally(tradesRes.data as { user_id: string }[] | null);

  return (authRes.data?.users ?? []).map((u) => {
    const prof = profiles.get(u.id);
    const w = wallets.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "(no email)",
      createdAt: u.created_at,
      displayName: (prof?.display_name as string | null) ?? null,
      disabled: Boolean(prof?.disabled),
      usdtBalance: w ? Number(w.usdt_balance) : 0,
      aiCredits: w ? Number(w.ai_credits) : 0,
      usedMargin: w ? Number(w.used_margin) : 0,
      startingBalance: w ? Number(w.starting_balance) : 0,
      analysesCount: analysesByUser.get(u.id) ?? 0,
      tradesCount: tradesByUser.get(u.id) ?? 0,
    };
  });
}

export interface AdminUserDetail extends AdminUserRow {
  recentAnalyses: { id: string; symbol: string; created_at: string; primary_strategy: string | null }[];
  recentTrades: {
    id: string;
    symbol: string;
    direction: string;
    pre_grade: string;
    result_r: number | null;
    created_at: string;
    closed_at: string | null;
  }[];
  recentTx: { id: string; kind: string; amount: number; balance_after: number; created_at: string }[];
  adminLog: { id: string; admin_email: string; action: string; detail: unknown; created_at: string }[];
}

export async function getUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const svc = getSupabaseService();
  const all = await listAllUsers();
  const base = all.find((u) => u.id === userId);
  if (!base) return null;

  const [analysesRes, tradesRes, txRes, logRes] = await Promise.all([
    svc
      .from("analyses")
      .select("id, symbol, created_at, primary_strategy")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    svc
      .from("trades")
      .select("id, symbol, direction, pre_grade, result_r, created_at, closed_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    svc
      .from("wallet_transactions")
      .select("id, kind, amount, balance_after, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15),
    svc
      .from("admin_audit_logs")
      .select("id, admin_email, action, detail, created_at")
      .eq("target_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  return {
    ...base,
    recentAnalyses: (analysesRes.data as AdminUserDetail["recentAnalyses"]) ?? [],
    recentTrades: (tradesRes.data as AdminUserDetail["recentTrades"]) ?? [],
    recentTx: (txRes.data as AdminUserDetail["recentTx"]) ?? [],
    adminLog: (logRes.data as AdminUserDetail["adminLog"]) ?? [],
  };
}
