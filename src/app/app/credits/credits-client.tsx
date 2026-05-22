"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Sparkles, Trophy, Check, Loader2, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Package {
  id: "starter" | "basic" | "pro" | "vip";
  credits: number;
  price: number; // vUSDT
  label: string;
  highlight?: boolean;
  badge?: string;
}

const PACKAGES: Package[] = [
  { id: "starter", credits: 5, price: 10, label: "스타터" },
  { id: "basic", credits: 100, price: 1000, label: "베이직", highlight: true, badge: "인기" },
  { id: "pro", credits: 500, price: 5000, label: "프로" },
  { id: "vip", credits: 1000, price: 10000, label: "VIP", badge: "대용량" },
];

interface Props {
  initialBalance: number;
  initialCredits: number;
}

export function CreditsClient({ initialBalance, initialCredits }: Props) {
  const [balance, setBalance] = useState(initialBalance);
  const [credits, setCredits] = useState(initialCredits);
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<Package["id"] | null>(null);

  function purchase(pkg: Package) {
    if (pending) return;
    if (balance < pkg.price) {
      toast.error(`잔액 부족 — ${pkg.price.toLocaleString()} vUSDT 필요`);
      return;
    }
    setSelectedId(pkg.id);
    startTransition(async () => {
      try {
        const res = await fetch("/api/credits/purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packageId: pkg.id }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "구매 실패");
          return;
        }
        setBalance(data.balanceAfter);
        setCredits(data.creditsAfter);
        toast.success(`${pkg.credits}회 크레딧 추가 완료`);
      } catch {
        toast.error("네트워크 오류");
      } finally {
        setSelectedId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* 현재 상태 */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="py-4 px-5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Trophy className="h-3.5 w-3.5 text-yellow-500" />
              vUSDT 잔액
            </div>
            <div className="font-mono text-2xl font-black tabular-nums mt-1">
              {balance.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              AI 크레딧
            </div>
            <div className="font-mono text-2xl font-black tabular-nums mt-1">
              {credits.toLocaleString()}<span className="text-base ml-1 text-muted-foreground">회</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 패키지 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {PACKAGES.map((pkg) => {
          const isLoading = pending && selectedId === pkg.id;
          const cantAfford = balance < pkg.price;
          const unitPrice = pkg.price / pkg.credits;
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
                  pkg.highlight
                    ? "bg-primary text-primary-foreground"
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
                      {pkg.credits.toLocaleString()}
                    </span>
                    <span className="text-sm text-muted-foreground">회</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    회당 {unitPrice.toFixed(unitPrice >= 1 ? 0 : 1)} vUSDT
                  </div>
                </div>

                <div className="border-t border-border/40 pt-3">
                  <div className="text-xs text-muted-foreground">가격</div>
                  <div className="font-mono text-lg font-bold tabular-nums">
                    {pkg.price.toLocaleString()}{" "}
                    <span className="text-xs font-normal text-muted-foreground">vUSDT</span>
                  </div>
                </div>

                <Button
                  onClick={() => purchase(pkg)}
                  disabled={pending || cantAfford}
                  className="w-full gap-1.5"
                  variant={pkg.highlight ? "default" : "outline"}
                  size="sm"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      처리 중...
                    </>
                  ) : cantAfford ? (
                    "잔액 부족"
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      구매
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 안내 */}
      <Card>
        <CardContent className="py-3 px-4 text-xs text-muted-foreground space-y-1">
          <div className="flex items-start gap-2">
            <TrendingUp className="h-3.5 w-3.5 mt-0.5 text-primary flex-none" />
            <p>
              AI 분석 도구는 캔들/거래량/주문호가 데이터 + AI 시나리오 생성을 포함합니다.
              1회 사용 = 1 크레딧 차감 (분석 성공 시에만).
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 mt-0.5 text-yellow-500 flex-none" />
            <p>
              vUSDT가 부족하면{" "}
              <a href="/app/deposit" className="text-primary underline underline-offset-2 hover:text-primary/80">
                충전 페이지
              </a>
              에서 AAG로 입금하세요 (1 AAG = 1,000 vUSDT).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
