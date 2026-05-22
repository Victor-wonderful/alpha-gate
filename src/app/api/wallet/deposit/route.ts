import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { creditBalance, getBalance } from "@/lib/paper-wallet";

export const dynamic = "force-dynamic";

// 1 AAG = 1 USDT(실제) = 1,000 vUSDT(플랫폼)
export const VUSDT_PER_AG = 1000;

// AAG 패키지 — 큰 패키지일수록 보너스 vUSDT
export const AG_PACKAGES = {
  starter: { id: "starter", ag: 1, bonusPct: 0, label: "시작" },
  basic: { id: "basic", ag: 10, bonusPct: 0, label: "베이직" },
  premium: { id: "premium", ag: 50, bonusPct: 10, label: "프리미엄" },
  vip: { id: "vip", ag: 200, bonusPct: 20, label: "VIP" },
} as const;

type PackageId = keyof typeof AG_PACKAGES;

function calcVusdt(ag: number, bonusPct: number) {
  const base = ag * VUSDT_PER_AG;
  const bonus = Math.floor(base * bonusPct / 100);
  return { base, bonus, total: base + bonus };
}

export async function POST(req: Request) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { packageId } = (await req.json()) as { packageId?: string };
  if (!packageId || !(packageId in AG_PACKAGES)) {
    return NextResponse.json({ error: "잘못된 패키지" }, { status: 400 });
  }

  const pkg = AG_PACKAGES[packageId as PackageId];
  const { base, bonus, total } = calcVusdt(pkg.ag, pkg.bonusPct);

  // ⚠ MVP — 실제 결제 없이 즉시 입금 처리
  // 추후: Stripe/토스/USDT 입금 연동 시 결제 확인 후 입금
  let balanceAfter: number;
  try {
    balanceAfter = await creditBalance(user.id, total, "deposit", {
      package: pkg.id,
      ag_amount: pkg.ag,
      base_vusdt: base,
      bonus_vusdt: bonus,
      mock_payment: true,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "충전 실패" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    package: pkg,
    agAmount: pkg.ag,
    baseVusdt: base,
    bonusVusdt: bonus,
    totalVusdt: total,
    balanceAfter,
  });
}

export async function GET() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const balance = await getBalance(user.id);

  const packages = Object.values(AG_PACKAGES).map((p) => {
    const { base, bonus, total } = calcVusdt(p.ag, p.bonusPct);
    return { ...p, baseVusdt: base, bonusVusdt: bonus, totalVusdt: total };
  });

  return NextResponse.json({ packages, balance, vusdtPerAg: VUSDT_PER_AG });
}
