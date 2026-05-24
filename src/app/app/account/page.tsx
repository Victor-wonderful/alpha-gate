import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  Coins,
  KeyRound,
  Sparkles,
  Activity,
  LineChart as LineChartIcon,
  TrendingUp,
  CalendarDays,
} from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { AccountForm } from "./account-form";
import { PasswordForm } from "./password-form";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "내 계정 · Alpha Gate",
};

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export default async function AccountPage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/account");

  const [profileRes, analysesRes, tradesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name, default_style, default_risk_pct, default_leverage, created_at",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("analyses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("trades")
      .select("id, result_r, closed_at, created_at", { count: "exact" })
      .eq("user_id", user.id)
      .neq("mode", "backtest"),
  ]);

  const profile = profileRes.data ?? null;
  const analysisCount = analysesRes.count ?? 0;
  const tradeCount = tradesRes.count ?? 0;
  const cumulativeR = (tradesRes.data ?? []).reduce(
    (sum, t) => sum + (Number(t.result_r) || 0),
    0,
  );
  const memberDays = profile?.created_at
    ? daysSince(profile.created_at)
    : daysSince(user.created_at ?? new Date().toISOString());

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      {/* Header */}
      <header className="flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-primary/10 text-xl font-semibold ring-1 ring-primary/30">
          {(user.email?.[0] ?? "U").toUpperCase()}
        </span>
        <div>
          <h1 className="text-3xl font-bold leading-[1.15]">내 계정</h1>
          <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
        </div>
      </header>

      {/* Activity stats */}
      <section>
        <h2 className="mb-3 text-base font-semibold">내 활동</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Sparkles className="h-4 w-4 text-primary" />}
            label="누적 분석"
            value={String(analysisCount)}
            unit="회"
          />
          <StatCard
            icon={<Activity className="h-4 w-4 text-primary" />}
            label="누적 거래"
            value={String(tradeCount)}
            unit="건"
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4 text-primary" />}
            label="누적 R"
            value={`${cumulativeR >= 0 ? "+" : ""}${cumulativeR.toFixed(2)}`}
            unit="R"
            tone={
              cumulativeR > 0
                ? "good"
                : cumulativeR < 0
                  ? "bad"
                  : undefined
            }
          />
          <StatCard
            icon={<CalendarDays className="h-4 w-4 text-primary" />}
            label="가입 후"
            value={String(memberDays)}
            unit="일"
          />
        </div>
      </section>

      {/* Profile + trading defaults */}
      <section>
        <h2 className="mb-3 text-base font-semibold">기본 설정</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          여기서 설정한 값이 AI 분석·거래 평가 페이지에 기본값으로 자동
          채워집니다.
        </p>
        <AccountForm
          initial={{
            display_name: profile?.display_name ?? null,
            default_style: (profile?.default_style ?? "swing") as
              | "scalp"
              | "day"
              | "swing"
              | "position",
            default_risk_pct: Number(profile?.default_risk_pct ?? 1.0),
            default_leverage: Number(profile?.default_leverage ?? 3),
          }}
        />
      </section>

      {/* Security */}
      <section>
        <h2 className="mb-3 text-base font-semibold">보안</h2>
        <PasswordForm />
      </section>

      {/* Connected services */}
      <section>
        <h2 className="mb-3 text-base font-semibold">연결된 서비스</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ServiceCard
            href="/app/settings/notify"
            icon={<Bell className="h-4 w-4 text-primary" />}
            label="알림 설정"
            hint="텔레그램 / 디스코드"
          />
          <ServiceCard
            href="/app/settings/api-keys"
            icon={<KeyRound className="h-4 w-4 text-primary" />}
            label="거래소 API 키"
            hint="실거래 연동 (준비 중)"
          />
          <ServiceCard
            href="/app/deposit"
            icon={<Coins className="h-4 w-4 text-primary" />}
            label="vUSDT 충전"
            hint="가상 트레이딩 잔액"
          />
          <ServiceCard
            href="/app/credits"
            icon={<LineChartIcon className="h-4 w-4 text-primary" />}
            label="AI 크레딧 구매"
            hint="분석 1회당 크레딧 차감"
          />
        </div>
      </section>

      {/* Danger zone */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-grade-d">위험 구역</h2>
        <div className="rounded-2xl border border-grade-d/30 bg-card/40 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">로그아웃</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                현재 브라우저 세션을 종료합니다.
              </div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  unit,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  tone?: "good" | "bad";
}) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 px-5 py-4">
      <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={
            tone === "good"
              ? "font-mono text-3xl font-bold leading-[1.15] tabular-nums text-grade-a"
              : tone === "bad"
                ? "font-mono text-3xl font-bold leading-[1.15] tabular-nums text-grade-d"
                : "font-mono text-3xl font-bold leading-[1.15] tabular-nums"
          }
        >
          {value}
        </span>
        {unit ? (
          <span className="text-sm text-muted-foreground">{unit}</span>
        ) : null}
      </div>
    </article>
  );
}

function ServiceCard({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/40 px-5 py-4 transition-colors hover:border-primary/40 hover:bg-card/70"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
          {icon}
        </span>
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">→</span>
    </Link>
  );
}
