import Link from "next/link";
import {
  ArrowRight,
  Brain,
  ClipboardCheck,
  BookOpen,
  BarChart3,
  TrendingDown,
  AlertTriangle,
  Flame,
  Layers,
  Sparkles,
  Database,
  ShieldCheck,
} from "lucide-react";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { HeroDashboard } from "@/components/marketing/hero-dashboard";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n/messages";

export default async function LandingPage() {
  const t = await getT();
  const PAINS = getPains(t);
  const STEPS = getSteps(t);
  const FEATURES = getFeatures(t);
  const WHY = getWhy(t);
  return (
    <main className="flex min-h-screen flex-col bg-[#02060f] text-white">
      <HeroDashboard />

      {/* ───── Pain ───── */}
      <SectionShell glowPosition="top-left">
        <SectionHeader
          eyebrow={t("landing.pain.eyebrow")}
          title={
            <>
              {t("landing.pain.titlePre")}
              <br />
              <span className="bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                {t("landing.pain.titleHighlight")}
              </span>
            </>
          }
          body={t("landing.pain.body")}
        />
        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {PAINS.map((p) => (
            <PainCard key={p.title} {...p} />
          ))}
        </div>
      </SectionShell>

      {/* ───── How It Works ───── */}
      <SectionShell glowPosition="top">
        <SectionHeader
          eyebrow={t("landing.steps.eyebrow")}
          title={
            <>
              {t("landing.steps.titlePre")}
              <br />
              <span className="bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                {t("landing.steps.titleHighlight")}
              </span>
              {t("landing.steps.titlePost")}
            </>
          }
          body={t("landing.steps.body")}
        />
        <div className="mt-16 grid gap-5 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <StepCard key={s.title} index={i} {...s} />
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link
            href="/how-it-works"
            className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/5 px-6 py-3 text-sm font-semibold text-cyan-300 transition-all hover:gap-3 hover:border-cyan-400/60 hover:bg-cyan-500/10 hover:text-cyan-200"
          >
            {t("landing.steps.learnMore")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </SectionShell>

      {/* ───── Features ───── */}
      <SectionShell glowPosition="right">
        <SectionHeader
          eyebrow={t("landing.features.eyebrow")}
          title={
            <>
              {t("landing.features.titlePre")}{" "}
              <span className="bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                {t("landing.features.titleHighlight")}
              </span>
            </>
          }
          body={t("landing.features.body")}
        />
        <div className="mt-20 space-y-20">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={cn(
                "grid gap-10 lg:grid-cols-2 lg:items-center",
                i % 2 === 1 && "lg:[&>*:first-child]:order-2",
              )}
            >
              <FeatureText feature={f} />
              <FeaturePreview kind={f.id} t={t} />
            </div>
          ))}
        </div>
      </SectionShell>

      {/* ───── Why ───── */}
      <SectionShell glowPosition="bottom-left">
        <SectionHeader
          eyebrow={t("landing.why.eyebrow")}
          title={
            <>
              {t("landing.why.titlePre")}
              <br />
              <span className="bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                {t("landing.why.titleHighlight")}
              </span>
            </>
          }
        />
        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {WHY.map((w) => (
            <WhyCard key={w.title} {...w} />
          ))}
        </div>
      </SectionShell>

      {/* ───── CTA ───── */}
      <section className="relative isolate overflow-hidden border-t border-white/[0.06]">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[1000px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.22),transparent_70%)] blur-3xl"
        />
        <div className="relative mx-auto max-w-4xl px-6 py-32 sm:px-10">
          <div className="relative overflow-hidden rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-[#0b1e44]/80 via-[#071534]/60 to-[#04102a]/80 p-12 text-center shadow-[0_40px_120px_-30px_rgba(56,189,248,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl sm:p-16">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-20 -top-32 h-64 bg-gradient-to-b from-cyan-400/15 to-transparent blur-2xl"
            />
            <div className="relative">
              <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
                <Sparkles className="h-3 w-3" />
                {t("landing.finalCta.eyebrow")}
              </div>
              <h2 className="mt-5 text-3xl font-bold leading-[1.15] sm:text-5xl">
                {t("landing.finalCta.titlePre")}
                <br />
                <span className="bg-gradient-to-r from-sky-200 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                  {t("landing.finalCta.titleHighlight")}
                </span>
              </h2>
              <p className="mx-auto mt-6 max-w-md text-base text-white/60">
                {t("landing.finalCta.body")}
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/login?mode=signup"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-sky-400 to-cyan-500 px-7 py-3.5 text-sm font-semibold text-[#02060f] shadow-[0_0_32px_rgba(56,189,248,0.55)] transition-all hover:gap-3 hover:shadow-[0_0_44px_rgba(56,189,248,0.75)]"
                >
                  {t("landing.cta.startFree")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white/80 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
                >
                  {t("landing.cta.viewPricing")}
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-white/40">
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-cyan-400" /> {t("landing.finalCta.noCard")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-cyan-400" /> {t("landing.finalCta.foreverFree")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-cyan-400" /> {t("landing.finalCta.refund")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}

/* ──────────────────────────── Section primitives ──────────────────────────── */

function SectionShell({
  children,
  glowPosition,
}: {
  children: React.ReactNode;
  glowPosition?: "top" | "top-left" | "top-right" | "bottom-left" | "right";
}) {
  const glowClass: Record<string, string> = {
    top: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/3",
    "top-left": "left-0 top-0 -translate-y-1/3",
    "top-right": "right-0 top-0 -translate-y-1/3",
    "bottom-left": "left-0 bottom-0 translate-y-1/3",
    right: "right-0 top-1/2 translate-x-1/3 -translate-y-1/2",
  };
  return (
    <section className="relative overflow-hidden border-t border-white/[0.06]">
      {glowPosition && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute h-[600px] w-[900px] rounded-full bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.10),transparent_70%)] blur-3xl",
            glowClass[glowPosition],
          )}
        />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(186,230,253,0.5) 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      />
      <div className="relative mx-auto max-w-6xl px-6 py-32 sm:px-10">{children}</div>
    </section>
  );
}

function SectionHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: React.ReactNode;
  body?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400">
        <span className="inline-block h-px w-8 bg-cyan-400" />
        {eyebrow}
      </div>
      <h2 className="mt-5 text-3xl font-bold leading-[1.15] sm:text-5xl">{title}</h2>
      {body && (
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/55">{body}</p>
      )}
    </div>
  );
}

/* ──────────────────────────── Pain cards ──────────────────────────── */

function getPains(t: TFunction) {
  return [
    {
      title: t("landing.pains.chase.title"),
      loss: "−1.2R",
      sub: t("landing.pains.chase.sub"),
      body: t("landing.pains.chase.body"),
      icon: Flame,
    },
    {
      title: t("landing.pains.noStop.title"),
      loss: "−2.5R",
      sub: t("landing.pains.noStop.sub"),
      body: t("landing.pains.noStop.body"),
      icon: AlertTriangle,
    },
    {
      title: t("landing.pains.oversize.title"),
      loss: "−50%",
      sub: t("landing.pains.oversize.sub"),
      body: t("landing.pains.oversize.body"),
      icon: TrendingDown,
    },
  ];
}

function PainCard({
  title,
  loss,
  sub,
  body,
  icon: Icon,
}: {
  title: string;
  loss: string;
  sub: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-rose-500/15 bg-gradient-to-br from-[#101A30]/70 via-[#0A1020]/60 to-[#04070F]/85 p-7 backdrop-blur-xl transition-all hover:border-rose-400/40 hover:shadow-[0_30px_80px_-20px_rgba(244,63,94,0.30)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-10 -top-16 h-32 bg-gradient-to-b from-rose-400/10 to-transparent opacity-0 blur-2xl transition-opacity group-hover:opacity-100"
      />
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-rose-500/30 bg-gradient-to-br from-rose-500/15 to-rose-700/5 text-rose-300">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-5 text-lg font-bold tracking-tight">{title}</h3>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="bg-gradient-to-br from-rose-200 via-rose-300 to-rose-500 bg-clip-text font-mono text-3xl font-black leading-none text-transparent">
          {loss}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-white/40">{sub}</span>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-white/55">{body}</p>
    </div>
  );
}

/* ──────────────────────────── Step cards ──────────────────────────── */

function getSteps(t: TFunction) {
  return [
    {
      title: t("landing.stepCards.analyze.title"),
      icon: Brain,
      tag: t("landing.stepCards.beforeEntry"),
      body: t("landing.stepCards.analyze.body"),
    },
    {
      title: t("landing.stepCards.trade.title"),
      icon: ClipboardCheck,
      tag: t("landing.stepCards.beforeEntry"),
      body: t("landing.stepCards.trade.body"),
    },
    {
      title: t("landing.stepCards.journal.title"),
      icon: BookOpen,
      tag: t("landing.stepCards.afterEntry"),
      body: t("landing.stepCards.journal.body"),
    },
    {
      title: t("landing.stepCards.dashboard.title"),
      icon: BarChart3,
      tag: t("landing.stepCards.afterEntry"),
      body: t("landing.stepCards.dashboard.body"),
    },
  ];
}

function StepCard({
  index,
  title,
  body,
  tag,
  icon: Icon,
}: {
  index: number;
  title: string;
  body: string;
  tag: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-[#091632]/70 via-[#06112a]/60 to-[#040b1d]/80 p-7 backdrop-blur-xl transition-all hover:border-cyan-400/40 hover:shadow-[0_30px_80px_-20px_rgba(56,189,248,0.35)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-10 -top-16 h-32 bg-gradient-to-b from-cyan-400/10 to-transparent opacity-0 blur-2xl transition-opacity group-hover:opacity-100"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-3 -top-6 select-none font-mono text-[110px] font-black leading-none tracking-tighter text-cyan-400/[0.06]"
      >
        {String(index + 1).padStart(2, "0")}
      </div>
      <div className="relative flex items-start gap-4">
        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl border border-cyan-500/30 bg-gradient-to-br from-sky-500/15 to-blue-600/10 text-cyan-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-semibold text-cyan-400">
              STEP {String(index + 1).padStart(2, "0")}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/60">
              {tag}
            </span>
          </div>
          <h3 className="mt-2 text-xl font-bold tracking-tight">{title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-white/65">{body}</p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── Features ──────────────────────────── */

interface FeatureItem {
  id: "analyze" | "trade" | "journal" | "dashboard";
  tag: string;
  title: string;
  body: string;
  bullets: string[];
}

function getFeatures(t: TFunction): FeatureItem[] {
  return [
    {
      id: "analyze",
      tag: t("landing.featureItems.analyze.tag"),
      title: t("landing.featureItems.analyze.title"),
      body: t("landing.featureItems.analyze.body"),
      bullets: [
        t("landing.featureItems.analyze.bullet1"),
        t("landing.featureItems.analyze.bullet2"),
        t("landing.featureItems.analyze.bullet3"),
      ],
    },
    {
      id: "trade",
      tag: t("landing.featureItems.trade.tag"),
      title: t("landing.featureItems.trade.title"),
      body: t("landing.featureItems.trade.body"),
      bullets: [
        t("landing.featureItems.trade.bullet1"),
        t("landing.featureItems.trade.bullet2"),
        t("landing.featureItems.trade.bullet3"),
      ],
    },
    {
      id: "journal",
      tag: t("landing.featureItems.journal.tag"),
      title: t("landing.featureItems.journal.title"),
      body: t("landing.featureItems.journal.body"),
      bullets: [
        t("landing.featureItems.journal.bullet1"),
        t("landing.featureItems.journal.bullet2"),
        t("landing.featureItems.journal.bullet3"),
      ],
    },
    {
      id: "dashboard",
      tag: t("landing.featureItems.dashboard.tag"),
      title: t("landing.featureItems.dashboard.title"),
      body: t("landing.featureItems.dashboard.body"),
      bullets: [
        t("landing.featureItems.dashboard.bullet1"),
        t("landing.featureItems.dashboard.bullet2"),
        t("landing.featureItems.dashboard.bullet3"),
      ],
    },
  ];
}

function FeatureText({ feature }: { feature: FeatureItem }) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-500/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
        {feature.tag}
      </div>
      <h3 className="mt-5 text-3xl font-bold leading-[1.15] sm:text-4xl">
        <span className="bg-gradient-to-br from-white via-white to-cyan-200 bg-clip-text text-transparent">
          {feature.title}
        </span>
      </h3>
      <p className="mt-5 text-base leading-relaxed text-white/60">{feature.body}</p>
      <ul className="mt-6 space-y-2.5">
        {feature.bullets.map((b) => (
          <li key={b} className="flex items-start gap-2.5 text-sm text-white/70">
            <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeaturePreview({ kind, t }: { kind: FeatureItem["id"]; t: TFunction }) {
  if (kind === "analyze") {
    return (
      <PreviewCard caption={t("landing.preview.analyze.caption")}>
        <div className="space-y-2">
          {[
            { letter: "A", dir: t("common.long"), trigger: t("landing.preview.analyze.trigger1"), rr: "2.4R" },
            { letter: "B", dir: t("common.short"), trigger: t("landing.preview.analyze.trigger2"), rr: "2.1R" },
            { letter: "C", dir: t("landing.preview.analyze.wait"), trigger: t("landing.preview.analyze.trigger3"), rr: "—" },
          ].map((s) => (
            <div
              key={s.letter}
              className="flex items-center gap-3 border-b border-white/[0.04] py-2.5 text-xs last:border-b-0"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10 font-mono font-semibold text-cyan-300">
                {s.letter}
              </span>
              <span className="w-10 text-white/40">{s.dir}</span>
              <span className="flex-1 text-white/70">{s.trigger}</span>
              <span className="font-mono font-medium text-white">{s.rr}</span>
            </div>
          ))}
        </div>
      </PreviewCard>
    );
  }
  if (kind === "trade") {
    return (
      <PreviewCard caption={t("landing.preview.trade.caption")}>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-rose-400/40 bg-gradient-to-br from-rose-500/25 to-rose-700/10 text-2xl font-black text-rose-300 shadow-[0_0_24px_rgba(244,63,94,0.4)]">
            D
          </div>
          <div>
            <div className="text-sm font-semibold">{t("landing.preview.trade.banned")}</div>
            <div className="font-mono text-[11px] text-white/40">{t("landing.preview.trade.score0")}</div>
          </div>
        </div>
        <div className="mt-5 space-y-1 text-[11px]">
          <ScoreLine label={t("landing.preview.trade.line1")} value="+2" tone="good" />
          <ScoreLine label={t("landing.preview.trade.line2")} value="+1" tone="good" />
          <ScoreLine label={t("landing.preview.trade.line3")} value="−2" tone="bad" />
          <ScoreLine label={t("landing.preview.trade.line4")} value="−1" tone="bad" />
        </div>
      </PreviewCard>
    );
  }
  if (kind === "journal") {
    return (
      <PreviewCard caption={t("landing.preview.journal.caption")}>
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 space-y-3">
            <p className="text-xs leading-relaxed text-white/75">
              {t("landing.preview.journal.comment1")}
            </p>
            <p className="text-xs leading-relaxed text-white/75">
              {t("landing.preview.journal.comment2")}
            </p>
          </div>
        </div>
      </PreviewCard>
    );
  }
  return (
    <PreviewCard caption={t("landing.preview.dashboard.caption")}>
      <div className="grid grid-cols-4 gap-3">
        {[
          { g: "A", avg: 1.4, n: 12, tone: "good" as const },
          { g: "B", avg: 0.6, n: 28, tone: "good" as const },
          { g: "C", avg: -0.4, n: 15, tone: "bad" as const },
          { g: "D", avg: -1.8, n: 5, tone: "bad" as const },
        ].map((r) => (
          <div
            key={r.g}
            className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-center"
          >
            <div className="font-mono text-xs text-cyan-400/80">{r.g}</div>
            <div
              className={cn(
                "mt-2 font-mono text-xl font-bold tabular-nums",
                r.tone === "good" ? "text-cyan-200" : "text-rose-300/80",
              )}
            >
              {r.avg >= 0 ? "+" : ""}
              {r.avg}
              <span className="text-xs text-white/40">R</span>
            </div>
            <div className="mt-1 text-[10px] text-white/30">{t("landing.preview.dashboard.count", { n: r.n })}</div>
          </div>
        ))}
      </div>
    </PreviewCard>
  );
}

function PreviewCard({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 rounded-3xl bg-[radial-gradient(circle_at_50%_50%,rgba(56,189,248,0.16),transparent_70%)] blur-2xl"
      />
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-[#091632]/85 via-[#06112a]/80 to-[#040b1d]/90 shadow-[0_30px_80px_-20px_rgba(56,189,248,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-cyan-500/10 bg-cyan-500/[0.03] px-5 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
            {caption}
          </span>
          <span className="font-mono text-[10px] text-white/30">●●●</span>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ScoreLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad";
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.04] py-1.5 last:border-b-0">
      <span className="text-white/60">{label}</span>
      <span
        className={cn(
          "font-mono font-semibold",
          tone === "good" ? "text-cyan-300" : "text-rose-300/90",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ──────────────────────────── Why cards ──────────────────────────── */

function getWhy(t: TFunction) {
  return [
    {
      title: t("landing.whyCards.decision.title"),
      body: t("landing.whyCards.decision.body"),
      icon: Layers,
    },
    {
      title: t("landing.whyCards.data.title"),
      body: t("landing.whyCards.data.body"),
      icon: Database,
    },
    {
      title: t("landing.whyCards.auto.title"),
      body: t("landing.whyCards.auto.body"),
      icon: ShieldCheck,
    },
  ];
}

function WhyCard({
  title,
  body,
  icon: Icon,
}: {
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-[#091632]/60 via-[#06112a]/50 to-[#040b1d]/75 p-7 backdrop-blur-xl transition-all hover:border-cyan-400/40 hover:shadow-[0_30px_80px_-20px_rgba(56,189,248,0.3)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-10 -top-16 h-32 bg-gradient-to-b from-cyan-400/10 to-transparent opacity-0 blur-2xl transition-opacity group-hover:opacity-100"
      />
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/30 bg-gradient-to-br from-sky-500/15 to-blue-600/10 text-cyan-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-5 text-lg font-bold tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-white/60">{body}</p>
    </div>
  );
}
