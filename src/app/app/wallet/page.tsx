import Link from "next/link";
import { Coins, Sparkles, History, TrendingUp, TrendingDown, Plus, Trophy } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getBalance, getAiCredits } from "@/lib/paper-wallet";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

type TxKind =
  | "signup_bonus" | "deposit" | "trade_lock" | "trade_settle"
  | "game_bet" | "game_payout" | "ai_credit_purchase"
  | "tournament_reward" | "admin_adjust";

const TX_LABEL_KEYS: Record<TxKind, string> = {
  signup_bonus: "wallet.txSignupBonus",
  deposit: "wallet.txDeposit",
  trade_lock: "wallet.txTradeLock",
  trade_settle: "wallet.txTradeSettle",
  game_bet: "wallet.txGameBet",
  game_payout: "wallet.txGamePayout",
  ai_credit_purchase: "wallet.txAiCreditPurchase",
  tournament_reward: "wallet.txTournamentReward",
  admin_adjust: "wallet.txAdminAdjust",
};

export default async function WalletPage() {
  const t = await getT();
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let balance = 0;
  let credits = 0;
  let transactions: Array<{
    id: string;
    kind: TxKind;
    amount: number;
    balance_after: number;
    created_at: string;
    meta: Record<string, unknown> | null;
  }> = [];

  if (user) {
    [balance, credits] = await Promise.all([
      getBalance(user.id),
      getAiCredits(user.id),
    ]);

    const { data: txs } = await supabase
      .from("wallet_transactions")
      .select("id, kind, amount, balance_after, created_at, meta")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (txs) {
      transactions = txs as typeof transactions;
    }
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold">{t("wallet.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("wallet.subtitle")}
        </p>
      </div>

      {/* 잔액 카드 + 빠른 액션 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* vUSDT 잔액 */}
        <Card className="lg:col-span-2 border-primary/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Trophy className="h-4 w-4 text-yellow-500" />
                {t("wallet.vusdtBalance")}
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                {t("wallet.platformVirtualCurrency")}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-4xl font-black tabular-nums">
                {balance.toLocaleString()}
              </span>
              <span className="text-base text-muted-foreground font-medium">vUSDT</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              ≈ {(balance / 1000).toFixed(3)} AAG · ≈ ${(balance / 1000).toFixed(2)} USDT
            </div>
            <div className="mt-4 flex gap-2">
              <Link
                href="/app/deposit"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" /> {t("wallet.deposit")}
              </Link>
              <Link
                href="/app/credits"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted/40 transition-colors"
              >
                <Sparkles className="h-4 w-4" /> {t("wallet.buyAiCredits")}
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* AI 크레딧 */}
        <Card className="border-primary/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              {t("wallet.aiCredits")}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-4xl font-black tabular-nums">
                {credits.toLocaleString()}
              </span>
              <span className="text-base text-muted-foreground font-medium">{t("wallet.creditsUnit")}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t("wallet.creditPerAnalysis")}
            </div>
            <Link
              href="/app/credits"
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted/40 transition-colors"
            >
              <Plus className="h-4 w-4" /> {t("wallet.chargeCredits")}
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* 빠른 이동 — 사용처 */}
      <Card>
        <CardContent className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            {t("wallet.vusdtUsage")}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Link
              href="/app/virtual-trade"
              className="flex flex-col items-center gap-1.5 rounded-md border border-border/40 p-3 hover:bg-muted/30 transition-colors"
            >
              <Coins className="h-5 w-5 text-primary" />
              <span className="text-xs">{t("wallet.virtualTrading")}</span>
            </Link>
            <Link
              href="/app/credits"
              className="flex flex-col items-center gap-1.5 rounded-md border border-border/40 p-3 hover:bg-muted/30 transition-colors"
            >
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-xs">{t("wallet.aiAnalysisCredits")}</span>
            </Link>
            <Link
              href="/app/deposit"
              className="flex flex-col items-center gap-1.5 rounded-md border border-border/40 p-3 hover:bg-muted/30 transition-colors"
            >
              <Plus className="h-5 w-5 text-primary" />
              <span className="text-xs">{t("wallet.deposit")}</span>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* 최근 거래 내역 */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4 text-muted-foreground" />
              {t("wallet.recentTransactions")}
            </div>
            <span className="text-xs text-muted-foreground">{t("wallet.recent20")}</span>
          </div>

          {transactions.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {t("wallet.noTransactions")}
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {transactions.map((tx) => {
                const isIncome = tx.amount > 0;
                const label = TX_LABEL_KEYS[tx.kind] ? t(TX_LABEL_KEYS[tx.kind]) : tx.kind;
                const date = new Date(tx.created_at);
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/20"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={cn(
                          "flex h-7 w-7 flex-none items-center justify-center rounded-full",
                          isIncome
                            ? "bg-green-500/15 text-green-400"
                            : "bg-red-500/15 text-red-400",
                        )}
                      >
                        {isIncome ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{label}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {date.toLocaleString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-none">
                      <div
                        className={cn(
                          "font-mono font-bold tabular-nums",
                          isIncome ? "text-green-400" : "text-red-400",
                        )}
                      >
                        {isIncome ? "+" : ""}
                        {Number(tx.amount).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        {t("wallet.balanceLabel")} {Number(tx.balance_after).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 환율 안내 */}
      <Card>
        <CardContent className="py-3 px-4 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">{t("wallet.exchangeRate")}</strong> · {t("wallet.exchangeRateDetail")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
