import Link from "next/link";
import { ArrowLeft, History, Wallet } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getOrCreateWallet } from "@/lib/paper-wallet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import { VirtualTradeClient } from "../virtual-trade-client";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const wallet = await getOrCreateWallet(user.id);

  const { data: logs } = await supabase
    .from("paper_wallet_logs")
    .select("id, action, amount, balance_after, used_margin_after, note, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const pnlSinceStart = wallet.usdtBalance - wallet.startingBalance;
  const pnlPct = wallet.startingBalance > 0 ? (pnlSinceStart / wallet.startingBalance) * 100 : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link
          href="/app/virtual-trade"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          트레이딩으로
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">지갑 관리</h1>
        <p className="text-sm text-muted-foreground">
          가상 USDT 잔액 입출금 및 리셋. 진행 중 포지션 마진은 회수되지 않습니다.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" />
              현재 잔액
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-4xl font-bold tabular-nums">
                {formatCurrency(wallet.usdtBalance, "USD")}
              </span>
              <span
                className={cn(
                  "font-mono text-sm tabular-nums",
                  pnlSinceStart >= 0 ? "text-grade-a" : "text-grade-d",
                )}
              >
                {pnlSinceStart >= 0 ? "+" : ""}
                {formatCurrency(pnlSinceStart, "USD")} ({pnlSinceStart >= 0 ? "+" : ""}
                {pnlPct.toFixed(2)}%)
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              시작 자금 {formatCurrency(wallet.startingBalance, "USD")} · 사용 중 마진{" "}
              {formatCurrency(wallet.usedMargin, "USD")} · 사용 가능{" "}
              {formatCurrency(wallet.available, "USD")}
            </div>
          </div>

          <div className="border-t border-border/60 pt-4">
            <VirtualTradeClient currentBalance={wallet.usdtBalance} />
          </div>
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <History className="h-3.5 w-3.5" />
          지갑 활동 (최근 30건)
        </h2>
        {!logs || logs.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-xs text-muted-foreground">
              활동 없음
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border/60">
                {logs.map((l) => {
                  const isInflow =
                    l.action === "deposit" ||
                    l.action === "reset" ||
                    (l.action === "settle" && Number(l.amount) > 0);
                  return (
                    <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                      <ActionBadge action={l.action as string} />
                      <div className="flex-1 min-w-0 text-xs">
                        <div className="text-foreground">{l.note ?? l.action}</div>
                        <div className="text-muted-foreground">
                          {new Date(l.created_at as string).toLocaleString("ko-KR")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={cn(
                            "font-mono text-sm tabular-nums",
                            isInflow ? "text-grade-a" : "text-muted-foreground",
                          )}
                        >
                          {Number(l.amount) > 0 ? "+" : ""}
                          {formatCurrency(Number(l.amount), "USD")}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          잔액 {formatCurrency(Number(l.balance_after), "USD")}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, { label: string; color: string }> = {
    deposit: { label: "입금", color: "border-grade-a/40 bg-grade-a/10 text-grade-a" },
    reset: { label: "리셋", color: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
    lock: { label: "마진 lock", color: "border-primary/40 bg-primary/10 text-primary" },
    settle: { label: "정산", color: "border-grade-b/40 bg-grade-b/10 text-grade-b" },
  };
  const m = map[action] ?? {
    label: action,
    color: "border-border bg-background/40 text-muted-foreground",
  };
  return <Badge className={cn("border text-[10px]", m.color)}>{m.label}</Badge>;
}
