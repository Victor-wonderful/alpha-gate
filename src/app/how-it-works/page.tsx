import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Brain,
  Database,
  Layers,
  LineChart as LineChartIcon,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import {
  SectionShell,
  SectionHeader,
  GradientText,
  GlowCard,
  IconBadge,
} from "@/components/marketing/section";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n/messages";

export async function generateMetadata() {
  const t = await getT();
  return {
    title: t("pub.how.metaTitle"),
    description: t("pub.how.metaDescription"),
  };
}

export default async function HowItWorksPage() {
  const t = await getT();
  const STEPS = buildSteps(t);
  const PIPELINE = buildPipeline(t);
  const DATA_SOURCES = buildDataSources(t);
  return (
    <main className="flex min-h-screen flex-col bg-[#02060f] text-white">
      <MarketingHeader />

      {/* Hero */}
      <SectionShell glowPosition="top" className="border-t-0">
        <SectionHeader
          eyebrow="How It Works"
          title={
            <>
              {t("pub.how.heroTitleBefore")}{" "}
              <GradientText>{t("pub.how.heroTitleAccent")}</GradientText>
              <br />
              {t("pub.how.heroTitleAfter")}
            </>
          }
          body={t("pub.how.heroBody")}
        />
      </SectionShell>

      {/* 4-step detailed cards */}
      <SectionShell glowPosition="top-right">
        <SectionHeader
          eyebrow="4-Step Cycle"
          title={
            <>
              <GradientText>{t("pub.how.cycleTitleAccent1")}</GradientText>{t("pub.how.cycleTitleMid")} <GradientText>{t("pub.how.cycleTitleAccent2")}</GradientText>{t("pub.how.cycleTitleAfter")}
            </>
          }
        />
        <div className="mt-16 space-y-5">
          {STEPS.map((s, i) => (
            <GlowCard key={s.title}>
              <div
                aria-hidden
                className="pointer-events-none absolute -right-4 -top-6 select-none font-mono text-[140px] font-black leading-none tracking-tighter text-cyan-400/[0.07]"
              >
                0{i + 1}
              </div>
              <div className="relative grid gap-8 lg:grid-cols-[200px_1fr] lg:gap-12">
                <div>
                  <IconBadge icon={s.icon} size="lg" />
                  <div className="mt-4 flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-cyan-400">
                      STEP 0{i + 1}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/60">
                      {s.tag}
                    </span>
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-bold leading-[1.15] sm:text-3xl">{s.title}</h2>
                  <p className="mt-4 text-base leading-relaxed text-white/65">{s.body}</p>
                  <ul className="mt-6 space-y-2.5">
                    {s.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2.5 text-sm text-white/70">
                        <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </GlowCard>
          ))}
        </div>
      </SectionShell>

      {/* AI Pipeline deep dive */}
      <SectionShell glowPosition="bottom-left">
        <SectionHeader
          eyebrow="AI Pipeline"
          title={
            <>
              {t("pub.how.pipelineTitleBefore")} <GradientText>{t("pub.how.pipelineTitleAccent")}</GradientText>
            </>
          }
          body={t("pub.how.pipelineBody")}
        />
        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {PIPELINE.map((p, i) => (
            <GlowCard
              key={p.title}
              className={cn(
                i === 1 &&
                  "border-cyan-400/40 shadow-[0_30px_80px_-20px_rgba(56,189,248,0.45)]",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold text-cyan-400">
                  STAGE {i + 1}
                </span>
                <IconBadge icon={p.icon} size="sm" />
              </div>
              <h3 className="mt-5 text-xl font-bold">{p.title}</h3>
              <div className="mt-1 text-xs text-white/40">{p.kind}</div>
              <p className="mt-5 text-sm leading-relaxed text-white/60">{p.body}</p>
              <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-300/80">
                {p.tag}
              </div>
            </GlowCard>
          ))}
        </div>
      </SectionShell>

      {/* Data sources */}
      <SectionShell glowPosition="right">
        <SectionHeader
          eyebrow={t("pub.how.dataEyebrow")}
          title={
            <>
              <GradientText>{t("pub.how.dataTitleAccent")}</GradientText>
              <br />
              {t("pub.how.dataTitleAfter")}
            </>
          }
          body={t("pub.how.dataBody")}
        />
        <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {DATA_SOURCES.map((d) => (
            <GlowCard key={d.title} className="p-6">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400">
                {d.category}
              </div>
              <h3 className="mt-3 text-base font-bold">{d.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-white/60">{d.body}</p>
            </GlowCard>
          ))}
        </div>
      </SectionShell>

      {/* Security */}
      <SectionShell glowPosition="left">
        <SectionHeader
          eyebrow={t("pub.how.securityEyebrow")}
          title={
            <>
              {t("pub.how.securityTitleBefore")} <GradientText>{t("pub.how.securityTitleAccent")}</GradientText>
            </>
          }
        />
        <div className="mt-16 grid gap-5 md:grid-cols-3">
          <SecurityCard
            icon={Lock}
            title={t("pub.how.security.rls.title")}
            body={t("pub.how.security.rls.body")}
          />
          <SecurityCard
            icon={ShieldCheck}
            title={t("pub.how.security.data.title")}
            body={t("pub.how.security.data.body")}
          />
          <SecurityCard
            icon={Database}
            title={t("pub.how.security.storage.title")}
            body={t("pub.how.security.storage.body")}
          />
        </div>
      </SectionShell>

      {/* CTA */}
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
                {t("pub.how.ctaEyebrow")}
              </div>
              <h2 className="mt-5 text-4xl font-bold leading-[1.15] sm:text-5xl">
                {t("pub.how.ctaTitleBefore")} <GradientText>{t("pub.how.ctaTitleAccent")}</GradientText>{t("pub.how.ctaTitleAfter")}
              </h2>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/login?mode=signup"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-sky-400 to-cyan-500 px-7 py-3.5 text-sm font-semibold text-[#02060f] shadow-[0_0_32px_rgba(56,189,248,0.55)] transition-all hover:gap-3 hover:shadow-[0_0_44px_rgba(56,189,248,0.75)]"
                >
                  {t("pub.cta.signup")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/features"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white/80 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
                >
                  {t("pub.how.ctaFeatures")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}

function buildSteps(t: TFunction) {
  return [
    {
      title: t("pub.how.steps.analyze.title"),
      icon: Brain,
      tag: t("pub.how.tagBefore"),
      body: t("pub.how.steps.analyze.body"),
      bullets: [
        t("pub.how.steps.analyze.bullet1"),
        t("pub.how.steps.analyze.bullet2"),
        t("pub.how.steps.analyze.bullet3"),
        t("pub.how.steps.analyze.bullet4"),
      ],
    },
    {
      title: t("pub.how.steps.trade.title"),
      icon: ShieldCheck,
      tag: t("pub.how.tagBefore"),
      body: t("pub.how.steps.trade.body"),
      bullets: [
        t("pub.how.steps.trade.bullet1"),
        t("pub.how.steps.trade.bullet2"),
        t("pub.how.steps.trade.bullet3"),
        t("pub.how.steps.trade.bullet4"),
      ],
    },
    {
      title: t("pub.how.steps.journal.title"),
      icon: BarChart3,
      tag: t("pub.how.tagAfter"),
      body: t("pub.how.steps.journal.body"),
      bullets: [
        t("pub.how.steps.journal.bullet1"),
        t("pub.how.steps.journal.bullet2"),
        t("pub.how.steps.journal.bullet3"),
        t("pub.how.steps.journal.bullet4"),
      ],
    },
    {
      title: t("pub.how.steps.dashboard.title"),
      icon: LineChartIcon,
      tag: t("pub.how.tagAfter"),
      body: t("pub.how.steps.dashboard.body"),
      bullets: [
        t("pub.how.steps.dashboard.bullet1"),
        t("pub.how.steps.dashboard.bullet2"),
        t("pub.how.steps.dashboard.bullet3"),
        t("pub.how.steps.dashboard.bullet4"),
      ],
    },
  ];
}

function buildPipeline(t: TFunction) {
  return [
    {
      title: t("pub.how.pipeline.collect.title"),
      kind: t("pub.how.pipeline.collect.kind"),
      body: t("pub.how.pipeline.collect.body"),
      tag: "Code · Deterministic",
      icon: Database,
    },
    {
      title: t("pub.how.pipeline.classify.title"),
      kind: t("pub.how.pipeline.classify.kind"),
      body: t("pub.how.pipeline.classify.body"),
      tag: "LLM · Strategy Agent",
      icon: Layers,
    },
    {
      title: t("pub.how.pipeline.scenario.title"),
      kind: t("pub.how.pipeline.scenario.kind"),
      body: t("pub.how.pipeline.scenario.body"),
      tag: "LLM · Scenario Generator",
      icon: Sparkles,
    },
  ];
}

function buildDataSources(t: TFunction) {
  return [
    { category: t("pub.how.data.price.category"), title: t("pub.how.data.price.title"), body: t("pub.how.data.price.body") },
    { category: t("pub.how.data.structure.category"), title: t("pub.how.data.structure.title"), body: t("pub.how.data.structure.body") },
    { category: t("pub.how.data.book.category"), title: t("pub.how.data.book.title"), body: t("pub.how.data.book.body") },
    { category: t("pub.how.data.flow.category"), title: t("pub.how.data.flow.title"), body: t("pub.how.data.flow.body") },
    { category: t("pub.how.data.funding.category"), title: t("pub.how.data.funding.title"), body: t("pub.how.data.funding.body") },
    { category: t("pub.how.data.oi.category"), title: t("pub.how.data.oi.title"), body: t("pub.how.data.oi.body") },
    { category: t("pub.how.data.vol.category"), title: t("pub.how.data.vol.title"), body: t("pub.how.data.vol.body") },
    { category: t("pub.how.data.topTrader.category"), title: t("pub.how.data.topTrader.title"), body: t("pub.how.data.topTrader.body") },
    { category: t("pub.how.data.basis.category"), title: t("pub.how.data.basis.title"), body: t("pub.how.data.basis.body") },
    { category: t("pub.how.data.dom.category"), title: t("pub.how.data.dom.title"), body: t("pub.how.data.dom.body") },
    { category: t("pub.how.data.fng.category"), title: t("pub.how.data.fng.title"), body: t("pub.how.data.fng.body") },
    { category: t("pub.how.data.session.category"), title: t("pub.how.data.session.title"), body: t("pub.how.data.session.body") },
  ];
}

function SecurityCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <GlowCard>
      <IconBadge icon={Icon} />
      <h3 className="mt-5 text-lg font-bold">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-white/60">{body}</p>
    </GlowCard>
  );
}
