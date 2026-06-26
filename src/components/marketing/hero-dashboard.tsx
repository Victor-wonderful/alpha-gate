"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  Sparkles,
  Activity,
  BarChart3,
  ShieldCheck,
  TrendingUp,
  Gauge,
  Brain,
} from "lucide-react";
import { Logo } from "@/components/app/logo";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { TFunction } from "@/lib/i18n/messages";

export function HeroDashboard() {
  const pathname = usePathname();
  const t = useT();

  const NAV = [
    { href: "/features", label: t("landing.nav.features") },
    { href: "/how-it-works", label: t("landing.nav.howItWorks") },
    { href: "/pricing", label: t("landing.nav.pricing") },
    { href: "/faq", label: t("landing.nav.faq") },
    { href: "/contact", label: t("landing.nav.contact") },
  ];

  return (
    <section className="relative isolate bg-[#02060f] px-3 pb-8 pt-6 sm:px-6 sm:pt-8">
      {/* Earth-curve glow on the left edge */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-[18%] top-1/2 h-[140%] w-[60%] -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.35),rgba(14,165,233,0.12)_38%,transparent_65%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-10%] top-[-10%] h-[60%] w-[40%] rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.18),transparent_70%)] blur-3xl"
      />

      {/* Rounded outer frame */}
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[36px] border border-white/[0.08] bg-gradient-to-br from-[#06122a] via-[#03081a] to-[#02060f] shadow-[0_60px_180px_-40px_rgba(56,189,248,0.35),inset_0_1px_0_rgba(255,255,255,0.04)]">
        {/* Inner subtle radial */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_30%,rgba(56,189,248,0.10),transparent_70%)]"
        />
        {/* Dot grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(186,230,253,0.6) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />

        {/* Top nav inside frame */}
        <header className="relative z-20 flex items-center justify-between px-6 pb-2 pt-6 sm:px-10 sm:pt-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={22} />
            <span className="font-mono text-sm font-bold tracking-[0.24em] text-white">
              ALPHA GATE
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm md:flex">
            {NAV.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "transition-colors",
                    active ? "text-white" : "text-white/55 hover:text-white",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-full px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:text-white sm:inline-block"
            >
              {t("landing.nav.login")}
            </Link>
            <Link
              href="/login?mode=signup"
              className="rounded-full bg-gradient-to-br from-sky-400 to-cyan-500 px-4 py-1.5 text-xs font-semibold text-[#02060f] shadow-[0_0_20px_rgba(56,189,248,0.45)] transition-all hover:shadow-[0_0_28px_rgba(56,189,248,0.65)]"
            >
              {t("landing.nav.signup")}
            </Link>
          </div>
        </header>

        {/* Hero body */}
        <div className="relative z-10 grid grid-cols-12 gap-4 px-4 pb-10 pt-6 sm:px-10 sm:pt-10 lg:gap-6 lg:pb-16">
          {/* LEFT — 3 cards */}
          <div className="col-span-12 flex flex-col gap-5 lg:col-span-3">
            <CardMarketData t={t} />
            <CardAnalytics t={t} />
            <CardRSI t={t} />
          </div>

          {/* CENTER — headline + CTAs + Strategy Decision card */}
          <div className="col-span-12 flex flex-col items-center lg:col-span-6">
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
              {t("landing.hero.eyebrow")}
            </div>
            <h1 className="mt-5 max-w-2xl text-center text-4xl font-bold leading-[1.15] text-white sm:text-5xl lg:text-[3.4rem]">
              <span className="text-white">{t("landing.hero.headlinePre")}</span>{" "}
              <span className="bg-gradient-to-br from-sky-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                {t("landing.hero.headlineHighlight")}
              </span>
              <br />
              {t("landing.hero.headlinePost")}
            </h1>
            <p className="mx-auto mt-6 max-w-md text-center text-[15px] leading-relaxed text-white/55">
              {t("landing.hero.bodyPre")}{" "}
              <span className="text-white/75">{t("landing.hero.bodyGrades")}</span>
              {t("landing.hero.bodyPost")}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-sky-400 to-cyan-500 px-6 py-3 text-sm font-semibold text-[#02060f] shadow-[0_0_30px_rgba(56,189,248,0.5)] transition-all hover:gap-3 hover:shadow-[0_0_42px_rgba(56,189,248,0.7)]"
              >
                {t("landing.cta.startFree")}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/how-it-works"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-white/80 backdrop-blur transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                {t("landing.nav.howItWorks")}
              </Link>
            </div>

            {/* Center decision card */}
            <div className="mt-10 w-full max-w-[400px]">
              <CardDecision t={t} />
            </div>
          </div>

          {/* RIGHT — 3 cards */}
          <div className="col-span-12 flex flex-col gap-5 lg:col-span-3">
            <CardRisk t={t} />
            <CardOrder t={t} />
            <CardContext t={t} />
          </div>
        </div>

        {/* Connector overlay (decorative, hidden on small screens) */}
        <Connectors />
      </div>
    </section>
  );
}

/* ──────────────────────────── Connectors ──────────────────────────── */
function Connectors() {
  // Drawn relative to the hero frame; only shown on lg+ where 3-column layout exists.
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
      preserveAspectRatio="none"
      viewBox="0 0 1400 900"
    >
      <defs>
        <linearGradient id="line-cyan" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(56,189,248,0)" />
          <stop offset="50%" stopColor="rgba(56,189,248,0.55)" />
          <stop offset="100%" stopColor="rgba(56,189,248,0)" />
        </linearGradient>
        <radialGradient id="node-cyan">
          <stop offset="0%" stopColor="rgba(186,230,253,1)" />
          <stop offset="60%" stopColor="rgba(56,189,248,0.4)" />
          <stop offset="100%" stopColor="rgba(56,189,248,0)" />
        </radialGradient>
      </defs>

      {/* L1 — Market Data → Decision center */}
      <path d="M 340 360 C 520 360, 540 560, 700 580" stroke="url(#line-cyan)" strokeWidth="1.5" fill="none" />
      {/* L2 — Analytics → Decision */}
      <path d="M 340 540 C 480 540, 520 580, 700 600" stroke="url(#line-cyan)" strokeWidth="1.5" fill="none" />
      {/* L3 — RSI → Decision */}
      <path d="M 340 700 C 500 700, 540 660, 700 640" stroke="url(#line-cyan)" strokeWidth="1.5" fill="none" />
      {/* R1 — Risk → Decision */}
      <path d="M 1060 380 C 920 380, 880 560, 760 580" stroke="url(#line-cyan)" strokeWidth="1.5" fill="none" />
      {/* R2 — Order → Decision */}
      <path d="M 1060 560 C 920 560, 880 600, 760 600" stroke="url(#line-cyan)" strokeWidth="1.5" fill="none" />
      {/* R3 — Context → Decision */}
      <path d="M 1060 720 C 920 720, 880 660, 760 640" stroke="url(#line-cyan)" strokeWidth="1.5" fill="none" />

      {/* Connection nodes */}
      {[
        [340, 360], [340, 540], [340, 700],
        [1060, 380], [1060, 560], [1060, 720],
        [700, 580], [700, 600], [700, 640],
        [760, 580], [760, 600], [760, 640],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="8" fill="url(#node-cyan)" />
          <circle cx={x} cy={y} r="3" fill="#bae6fd" />
        </g>
      ))}
    </svg>
  );
}

/* ──────────────────────────── Card primitive ──────────────────────────── */
function Panel({
  icon,
  title,
  children,
  glow = false,
  className,
}: {
  icon?: React.ReactNode;
  title?: string;
  children: React.ReactNode;
  glow?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-[#091632]/80 via-[#06112a]/70 to-[#040b1d]/85 p-4 backdrop-blur-xl",
        glow
          ? "shadow-[0_30px_80px_-20px_rgba(56,189,248,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.04)]",
        className,
      )}
    >
      {glow && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-6 -top-6 h-20 bg-gradient-to-b from-cyan-400/15 to-transparent blur-xl"
        />
      )}
      {title && (
        <div className="relative flex items-center justify-between text-xs font-semibold text-white/85">
          <span className="flex items-center gap-2">
            {icon && <span className="text-cyan-300">{icon}</span>}
            {title}
          </span>
          <span className="font-mono text-[10px] text-white/30">···</span>
        </div>
      )}
      <div className="relative mt-3">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
  badge,
}: {
  label: string;
  value: string;
  valueClass?: string;
  badge?: "good" | "warn" | "bad";
}) {
  const badgeColor =
    badge === "good"
      ? "bg-emerald-400"
      : badge === "warn"
        ? "bg-amber-400"
        : badge === "bad"
          ? "bg-rose-400"
          : null;
  return (
    <div className="flex items-center justify-between py-1.5 text-[11px]">
      <span className="text-white/55">{label}</span>
      <span className={cn("flex items-center gap-1.5 font-mono tabular-nums text-white/90", valueClass)}>
        {value}
        {badgeColor && <span className={cn("h-1.5 w-1.5 rounded-full", badgeColor)} />}
      </span>
    </div>
  );
}

function Sparkline({ trend = "up" }: { trend?: "up" | "down" }) {
  // Decorative SVG sparkline
  const path =
    trend === "up"
      ? "M 0 24 Q 20 22, 36 18 T 80 14 Q 100 12, 120 8 T 160 4"
      : "M 0 4 Q 20 10, 36 14 T 80 16 Q 100 20, 120 22 T 160 26";
  return (
    <svg viewBox="0 0 160 30" className="mt-2 h-10 w-full">
      <defs>
        <linearGradient id="spark-fill" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(56,189,248,0.35)" />
          <stop offset="100%" stopColor="rgba(56,189,248,0)" />
        </linearGradient>
      </defs>
      <path d={`${path} L 160 30 L 0 30 Z`} fill="url(#spark-fill)" />
      <path d={path} fill="none" stroke="#7dd3fc" strokeWidth="1.5" />
    </svg>
  );
}

/* ──────────────────────────── 6 side cards ──────────────────────────── */
function CardMarketData({ t }: { t: TFunction }) {
  return (
    <Panel icon={<BarChart3 className="h-3.5 w-3.5" />} title={t("landing.cards.marketData")}>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] text-white/40">Binance · BTC/USDT</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">
            78,520.40
          </div>
        </div>
        <div className="font-mono text-xs font-semibold text-emerald-400">+1.42%</div>
      </div>
      <Sparkline trend="up" />
    </Panel>
  );
}

function CardAnalytics({ t }: { t: TFunction }) {
  return (
    <Panel icon={<Activity className="h-3.5 w-3.5" />} title={t("landing.cards.structure")}>
      <Row label={t("landing.cards.htfAlign")} value={t("landing.cards.pass")} badge="good" />
      <Row label={t("landing.cards.fvg")} value="1H 78.3K" badge="good" />
      <Row label={t("landing.cards.boxAvoid")} value={t("landing.cards.middle")} badge="warn" />
      <Row label={t("landing.cards.volume")} value={t("landing.cards.avgPlus18")} badge="good" />
    </Panel>
  );
}

function CardRSI({ t }: { t: TFunction }) {
  return (
    <Panel icon={<TrendingUp className="h-3.5 w-3.5" />} title={t("landing.cards.rsiPattern")}>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] text-white/40">1H · 14 Period</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">
            62.45
          </div>
        </div>
        <div className="font-mono text-[10px] text-cyan-300">{t("landing.cards.neutralUp")}</div>
      </div>
      <Sparkline trend="up" />
    </Panel>
  );
}

function CardRisk({ t }: { t: TFunction }) {
  return (
    <Panel icon={<ShieldCheck className="h-3.5 w-3.5" />} title={t("landing.cards.riskFilter")}>
      <Row label={t("landing.cards.status")} value={t("landing.cards.pass")} badge="good" />
      <Row label={t("landing.cards.dailyCum")} value="-0.4R" />
      <Row label={t("landing.cards.posExposure")} value="22.5%" />
      <Row label={t("landing.cards.riskPerTrade")} value="0.8%" />
    </Panel>
  );
}

function CardOrder({ t }: { t: TFunction }) {
  return (
    <Panel icon={<Gauge className="h-3.5 w-3.5" />} title={t("landing.cards.gradeScore")}>
      <Row label={t("landing.cards.status")} value={t("landing.cards.gradeA")} badge="good" valueClass="text-cyan-300" />
      <Row label={t("landing.cards.finalScore")} value="+8" valueClass="text-cyan-300" />
      <Row label={t("landing.cards.chase")} value={t("landing.cards.no")} badge="good" />
      <Row label={t("landing.cards.candleClose")} value={t("landing.cards.confirmed")} badge="good" />
      <Row label={t("landing.cards.triggerCheck")} value="3/3" badge="good" />
    </Panel>
  );
}

function CardContext({ t }: { t: TFunction }) {
  return (
    <Panel icon={<Brain className="h-3.5 w-3.5" />} title={t("landing.cards.marketContext")}>
      <Row label={t("landing.cards.funding")} value="+0.012%" />
      <Row label="OI 24h" value="+2.4%" badge="good" />
      <Row label={t("landing.cards.fgIndex")} value={t("landing.cards.fgGreed")} />
      <Row label={t("landing.cards.nextSettle")} value="6h 12m" />
    </Panel>
  );
}

/* ──────────────────────────── Center decision card ──────────────────────────── */
function CardDecision({ t }: { t: TFunction }) {
  return (
    <div className="relative">
      {/* Outer glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 rounded-[40px] bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.4),rgba(99,102,241,0.18)_45%,transparent_75%)] blur-2xl"
      />

      <div className="relative overflow-hidden rounded-[24px] border border-cyan-400/40 bg-gradient-to-br from-[#0b1e44]/95 via-[#071534]/90 to-[#04102a]/95 p-6 shadow-[0_40px_120px_-30px_rgba(56,189,248,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]">
        {/* Sheen */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-10 -top-16 h-32 bg-gradient-to-b from-white/15 to-transparent blur-2xl"
        />

        {/* Header */}
        <div className="relative flex items-center justify-between text-white/90">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            <span className="text-sm font-semibold">{t("landing.decision.title")}</span>
          </div>
          <span className="font-mono text-[10px] text-white/30">···</span>
        </div>

        <div className="my-4 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />

        {/* Subtitle + speed */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-white/50">{t("landing.decision.subtitle")}</span>
          <span className="font-mono text-cyan-300">52.9ms ●</span>
        </div>

        {/* Big grade */}
        <div className="mt-4 flex items-end gap-4">
          <span className="bg-gradient-to-br from-sky-200 via-cyan-300 to-blue-400 bg-clip-text text-[72px] font-black leading-[0.85] tracking-tight text-transparent">
            A
          </span>
          <div className="mb-2 flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">{t("landing.decision.gradeLabel")}</span>
            <span className="text-sm font-semibold text-white">{t("landing.decision.recommend")}</span>
          </div>
        </div>

        {/* Confidence */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/55">{t("landing.decision.confidence")}</span>
            <span className="font-mono font-semibold text-white">87 / 100</span>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full w-[87%] rounded-full bg-gradient-to-r from-sky-400 to-cyan-300 shadow-[0_0_12px_rgba(56,189,248,0.7)]" />
          </div>
        </div>

        {/* Reason */}
        <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">{t("landing.decision.reasonLabel")}</div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-white/80">
            {t("landing.decision.reasonText")}
          </p>
        </div>
      </div>
    </div>
  );
}
