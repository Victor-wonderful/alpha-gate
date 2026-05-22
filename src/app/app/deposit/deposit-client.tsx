"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trophy, Check, Loader2, Coins, Gift, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Package {
  id: "starter" | "basic" | "premium" | "vip";
  ag: number;
  bonusPct: number;
  label: string;
  highlight?: boolean;
  badge?: string;
}

const PACKAGES: Package[] = [
  { id: "starter", ag: 1, bonusPct: 0, label: "시작" },
  { id: "basic", ag: 10, bonusPct: 0, label: "베이직" },
  { id: "premium", ag: 50, bonusPct: 10, label: "프리미엄", highlight: true, badge: "+10% 보너스" },
  { id: "vip", ag: 200, bonusPct: 20, label: "VIP", badge: "+20% 보너스" },
];

const VUSDT_PER_AG = 1000;

function calc(pkg: Package) {
  const base = pkg.ag * VUSDT_PER_AG;
  const bonus = Math.floor((base * pkg.bonusPct) / 100);
  return { base, bonus, total: base + bonus };
}

interface Props {
  initialBalance: number;
}

export function DepositClient({ initialBalance }: Props) {
  const [balance, setBalance] = useState(initialBalance);
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<Package["id"] | null>(null);

  function purchase(pkg: Package) {
    if (pending) return;
    setSelectedId(pkg.id);
    startTransition(async () => {
      try {
        const res = await fetch("/api/wallet/deposit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packageId: pkg.id }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "충전 실패");
          return;
        }
        setBalance(data.balanceAfter);
        toast.success(`+${data.totalVusdt.toLocaleString()} vUSDT 충전 완료`);
      } catch {
        toast.error("네트워크 오류");
      } finally {
        setSelectedId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* 현재 잔액 */}
      <Card>
        <CardContent className="py-5 px-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Trophy className="h-3.5 w-3.5 text-yellow-500" />
              현재 vUSDT 잔액
            </div>
            <div className="font-mono text-3xl font-black tabular-nums mt-1">
              {balance.toLocaleString()}
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>≈ {(balance / VUSDT_PER_AG).toFixed(3)} AAG</div>
            <div className="mt-0.5">≈ ${(balance / VUSDT_PER_AG).toFixed(2)}</div>
          </div>
        </CardContent>
      </Card>

      {/* MVP 안내 */}
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="py-3 px-4 flex items-start gap-2 text-xs">
          <AlertCircle className="h-4 w-4 mt-0.5 text-yellow-500 flex-none" />
          <p>
            <span className="font-bold text-yellow-500">MVP 모의 결제:</span>{" "}
            구매 버튼을 누르면 실제 결제 없이 즉시 vUSDT가 입금됩니다. 정식 출시 시 카드/USDT 결제가 연동됩니다.
          </p>
        </CardContent>
      </Card>

      {/* 패키지 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {PACKAGES.map((pkg) => {
          const { base, bonus, total } = calc(pkg);
          const isLoading = pending && selectedId === pkg.id;
          return (
            <Card
              key={pkg.id}
              className={cn(
                "relative overflow-hidden transition-all",
                pkg.highlight && "border-primary/50 ring-2 ring-primary/20",
              )}
            >
              {pkg.badge && (
                <div className={cn(
                  "absolute top-2 right-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold",
                  pkg.bonusPct > 0
                    ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30"
                    : "bg-muted text-muted-foreground border border-border",
                )}>
                  {pkg.badge}
                </div>
              )}
              <CardContent className="p-5 space-y-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {pkg.label}
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="font-mono text-3xl font-black tabular-nums">
                      {pkg.ag}
                    </span>
                    <span className="text-sm text-muted-foreground">AAG</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    ≈ ${pkg.ag} USDT
                  </div>
                </div>

                <div className="border-t border-border/40 pt-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">기본</span>
                    <span className="font-mono tabular-nums">{base.toLocaleString()} vUSDT</span>
                  </div>
                  {bonus > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-yellow-500 flex items-center gap-1">
                        <Gift className="h-3 w-3" />
                        보너스
                      </span>
                      <span className="font-mono tabular-nums text-yellow-500">+{bonus.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-border/40 pt-1.5 mt-1.5">
                    <span className="text-xs font-medium">총 받는 vUSDT</span>
                    <span className="font-mono font-bold tabular-nums text-base">
                      {total.toLocaleString()}
                    </span>
                  </div>
                </div>

                <Button
                  onClick={() => purchase(pkg)}
                  disabled={pending}
                  className="w-full gap-1.5"
                  variant={pkg.highlight ? "default" : "outline"}
                  size="sm"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      처리 중...
                    </>
                  ) : (
                    <>
                      <Coins className="h-4 w-4" />
                      충전
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 환율 안내 */}
      <Card>
        <CardContent className="py-3 px-4 text-xs text-muted-foreground space-y-1">
          <p className="flex items-start gap-2">
            <Coins className="h-3.5 w-3.5 mt-0.5 text-primary flex-none" />
            <span>
              <strong className="text-foreground">환율</strong> · 1 AAG = 1 USDT(실제) = 1,000 vUSDT(플랫폼 가상화폐).{" "}
              vUSDT는 플랫폼 내에서만 사용 가능합니다 (가상 트레이딩, 가격 예측 게임, AI 분석 크레딧).
            </span>
          </p>
          <p className="flex items-start gap-2">
            <Gift className="h-3.5 w-3.5 mt-0.5 text-yellow-500 flex-none" />
            <span>
              <strong className="text-foreground">보너스</strong> · 50 AAG 이상부터 10%, 200 AAG부터 20% 보너스 vUSDT가 추가 지급됩니다.
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
