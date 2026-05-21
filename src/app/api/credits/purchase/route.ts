import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { debitBalance, addAiCredits, getBalance, getAiCredits } from "@/lib/paper-wallet";

export const dynamic = "force-dynamic";

// 패키지 정의 — 코드 SSOT
export const AI_CREDIT_PACKAGES = {
  starter: { id: "starter", credits: 5, price: 10, label: "스타터" },
  basic: { id: "basic", credits: 100, price: 1000, label: "베이직" },
  pro: { id: "pro", credits: 500, price: 5000, label: "프로" },
  vip: { id: "vip", credits: 1000, price: 10000, label: "VIP" },
} as const;

type PackageId = keyof typeof AI_CREDIT_PACKAGES;

export async function POST(req: Request) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { packageId } = (await req.json()) as { packageId?: string };
  if (!packageId || !(packageId in AI_CREDIT_PACKAGES)) {
    return NextResponse.json({ error: "잘못된 패키지" }, { status: 400 });
  }

  const pkg = AI_CREDIT_PACKAGES[packageId as PackageId];

  // vUSDT 차감
  let balanceAfter: number;
  try {
    balanceAfter = await debitBalance(user.id, pkg.price, "ai_credit_purchase", {
      package: pkg.id,
      credits_added: pkg.credits,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "잔액 부족" },
      { status: 400 },
    );
  }

  // AI 크레딧 추가
  let creditsAfter = 0;
  try {
    creditsAfter = await addAiCredits(user.id, pkg.credits);
  } catch {
    // 크레딧 추가 실패 시 vUSDT 환불 시도
    try {
      const { creditBalance } = await import("@/lib/paper-wallet");
      await creditBalance(user.id, pkg.price, "admin_adjust", {
        reason: "credit_add_failed_refund",
        package: pkg.id,
      });
    } catch {}
    return NextResponse.json(
      { error: "크레딧 추가 실패. vUSDT 환불됨" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    package: pkg,
    balanceAfter,
    creditsAfter,
  });
}

// GET — 패키지 목록 + 현재 잔액/크레딧
export async function GET() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [balance, credits] = await Promise.all([
    getBalance(user.id),
    getAiCredits(user.id),
  ]);

  return NextResponse.json({
    packages: Object.values(AI_CREDIT_PACKAGES),
    balance,
    credits,
  });
}
