import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  LineChart as LineChartIcon,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { SectionShell, SectionHeader, GradientText } from "@/components/marketing/section";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n/messages";

export async function generateMetadata() {
  const t = await getT();
  return {
    title: t("pub.features.metaTitle"),
    description: t("pub.features.metaDescription"),
  };
}

export default async function FeaturesPage() {
  const t = await getT();
  const FEATURES = buildFeatures(t);
  return (
    <main className="flex min-h-screen flex-col bg-[#02060f] text-white">
      <MarketingHeader />

      {/* Hero */}
      <SectionShell glowPosition="top" className="border-t-0">
        <SectionHeader
          eyebrow="Features"
          title={
            <>
              {t("pub.features.heroTitleBefore")}{" "}
              <GradientText>{t("pub.features.heroTitleAccent")}</GradientText>
              <br />
              {t("pub.features.heroTitleAfter")}
            </>
          }
          body={t("pub.features.heroBody")}
        />
      </SectionShell>

      {/* Feature deep dives */}
      <SectionShell glowPosition="bottom-left">
        <div className="space-y-28">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              id={f.id}
              className={cn(
                "grid scroll-mt-24 gap-12 lg:grid-cols-2 lg:items-center",
                i % 2 === 1 && "lg:[&>*:first-child]:order-2",
              )}
            >
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
                  <f.icon className="h-3 w-3" />
                  {f.tag}
                </div>
                <h2 className="mt-6 text-3xl font-bold leading-[1.15] sm:text-4xl">
                  <span className="bg-gradient-to-br from-white via-white to-cyan-200 bg-clip-text text-transparent">
                    {f.title}
                  </span>
                </h2>
                <p className="mt-5 text-base leading-relaxed text-white/65">{f.body}</p>
                <ul className="mt-8 space-y-3">
                  {f.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-cyan-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
                      <span className="text-white/80">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <FeatureMockup feature={f.id} t={t} />
            </div>
          ))}
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
                {t("pub.features.ctaEyebrow")}
              </div>
              <h2 className="mt-5 text-4xl font-bold leading-[1.15] sm:text-5xl">
                {t("pub.features.ctaTitleBefore")} <GradientText>{t("pub.features.ctaTitleAccent")}</GradientText>
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
                  href="/pricing"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white/80 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
                >
                  {t("pub.features.ctaPricing")}
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

interface FeatureItem {
  id: "analyze" | "trade" | "journal" | "dashboard";
  tag: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  body: string;
  bullets: string[];
}

function buildFeatures(t: TFunction): FeatureItem[] {
  return [
    {
      id: "analyze",
      tag: t("pub.features.items.analyze.tag"),
      title: t("pub.features.items.analyze.title"),
      icon: Brain,
      body: t("pub.features.items.analyze.body"),
      bullets: [
        t("pub.features.items.analyze.bullet1"),
        t("pub.features.items.analyze.bullet2"),
        t("pub.features.items.analyze.bullet3"),
        t("pub.features.items.analyze.bullet4"),
        t("pub.features.items.analyze.bullet5"),
      ],
    },
    {
      id: "trade",
      tag: t("pub.features.items.trade.tag"),
      title: t("pub.features.items.trade.title"),
      icon: ShieldCheck,
      body: t("pub.features.items.trade.body"),
      bullets: [
        t("pub.features.items.trade.bullet1"),
        t("pub.features.items.trade.bullet2"),
        t("pub.features.items.trade.bullet3"),
        t("pub.features.items.trade.bullet4"),
        t("pub.features.items.trade.bullet5"),
      ],
    },
    {
      id: "journal",
      tag: t("pub.features.items.journal.tag"),
      title: t("pub.features.items.journal.title"),
      icon: BookOpen,
      body: t("pub.features.items.journal.body"),
      bullets: [
        t("pub.features.items.journal.bullet1"),
        t("pub.features.items.journal.bullet2"),
        t("pub.features.items.journal.bullet3"),
        t("pub.features.items.journal.bullet4"),
        t("pub.features.items.journal.bullet5"),
      ],
    },
    {
      id: "dashboard",
      tag: t("pub.features.items.dashboard.tag"),
      title: t("pub.features.items.dashboard.title"),
      icon: LineChartIcon,
      body: t("pub.features.items.dashboard.body"),
      bullets: [
        t("pub.features.items.dashboard.bullet1"),
        t("pub.features.items.dashboard.bullet2"),
        t("pub.features.items.dashboard.bullet3"),
        t("pub.features.items.dashboard.bullet4"),
      ],
    },
  ];
}

function FeatureMockup({ feature, t }: { feature: FeatureItem["id"]; t: TFunction }) {
  if (feature === "analyze") {
    return (
      <MockupFrame caption={t("pub.features.mockup.analyze.caption")}>
        <div className="mb-4 flex items-center gap-2 text-xs">
          <span className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 font-mono font-semibold text-cyan-300">
            4H
          </span>
          <span className="font-mono font-medium text-white">BTCUSDT</span>
          <span className="ml-auto text-white/40">{t("pub.features.mockup.analyze.count")}</span>
        </div>
        <div className="space-y-2">
          <ScenarioRow letter="A" dir="long" trigger={t("pub.features.mockup.analyze.trigA")} rr="2.4R" t={t} />
          <ScenarioRow letter="B" dir="short" trigger={t("pub.features.mockup.analyze.trigB")} rr="2.1R" t={t} />
        </div>
        <div className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 text-[11px] text-white/75">
          {t("pub.features.mockup.analyze.now")}
        </div>
      </MockupFrame>
    );
  }
  if (feature === "trade") {
    return (
      <MockupFrame caption={t("pub.features.mockup.trade.caption")}>
        <div className="mb-5 flex items-center justify-between">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-rose-400/40 bg-gradient-to-br from-rose-500/25 to-rose-700/10 text-2xl font-black text-rose-300 shadow-[0_0_24px_rgba(244,63,94,0.4)]">
            D
          </div>
          <div className="text-right">
            <div className="text-base font-bold text-rose-300">{t("pub.features.mockup.trade.verdict")}</div>
            <div className="font-mono text-xs text-white/40">{t("pub.features.mockup.trade.score")}</div>
          </div>
        </div>
        <div className="space-y-2 text-xs">
          <ScoreRow label={t("pub.features.mockup.trade.row1")} pts={0} />
          <ScoreRow label={t("pub.features.mockup.trade.row2")} pts={+2} />
          <ScoreRow label={t("pub.features.mockup.trade.row3")} pts={-2} />
          <ScoreRow label={t("pub.features.mockup.trade.row4")} pts={-1} />
        </div>
      </MockupFrame>
    );
  }
  if (feature === "journal") {
    return (
      <MockupFrame caption={t("pub.features.mockup.journal.caption")}>
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 space-y-3 text-xs leading-relaxed text-white/75">
            <p>
              {t("pub.features.mockup.journal.p1Before")}{" "}
              <strong className="text-white">{t("pub.features.mockup.journal.p1Strong")}</strong>{t("pub.features.mockup.journal.p1After")}
            </p>
            <p>
              {t("pub.features.mockup.journal.p2Before")}{" "}
              <strong className="text-white">{t("pub.features.mockup.journal.p2Strong")}</strong>{t("pub.features.mockup.journal.p2After")}
            </p>
          </div>
        </div>
      </MockupFrame>
    );
  }
  return (
    <MockupFrame caption={t("pub.features.mockup.dashboard.caption")}>
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
            <div className="mt-1 text-[10px] text-white/30">{t("pub.features.mockup.dashboard.trades", { n: r.n })}</div>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}

function MockupFrame({ caption, children }: { caption: string; children: React.ReactNode }) {
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

function ScenarioRow({
  letter,
  dir,
  trigger,
  rr,
  t,
}: {
  letter: string;
  dir: "long" | "short";
  trigger: string;
  rr: string;
  t: TFunction;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs">
      <span className="flex h-6 w-6 items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10 font-mono font-bold text-cyan-300">
        {letter}
      </span>
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[10px] font-semibold",
          dir === "long"
            ? "bg-emerald-500/15 text-emerald-300"
            : "bg-rose-500/15 text-rose-300",
        )}
      >
        {dir === "long" ? t("common.long") : t("common.short")}
      </span>
      <span className="flex-1 truncate text-white/65">{trigger}</span>
      <span className="font-mono text-white">{rr}</span>
    </div>
  );
}

function ScoreRow({ label, pts }: { label: string; pts: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <span className="text-white/70">{label}</span>
      <span
        className={cn(
          "font-mono font-bold",
          pts > 0 ? "text-cyan-300" : pts < 0 ? "text-rose-300" : "text-white/40",
        )}
      >
        {pts > 0 ? "+" : ""}
        {pts}
      </span>
    </div>
  );
}
