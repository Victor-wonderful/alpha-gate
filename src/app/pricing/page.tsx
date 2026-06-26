import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { SectionShell, SectionHeader, GradientText } from "@/components/marketing/section";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n/messages";

export async function generateMetadata() {
  const t = await getT();
  return {
    title: t("pub.pricing.metaTitle"),
    description: t("pub.pricing.metaDescription"),
  };
}

interface Plan {
  id: string;
  name: string;
  price: string;
  priceNote: string;
  tagline: string;
  quota: string;
  quotaNote: string;
  cta: string;
  ctaHref: string;
  featured?: boolean;
}

function buildPlans(t: TFunction): Plan[] {
  return [
    {
      id: "free",
      name: "Free",
      price: "₩0",
      priceNote: t("pub.pricing.plans.free.priceNote"),
      tagline: t("pub.pricing.plans.free.tagline"),
      quota: t("pub.pricing.plans.free.quota"),
      quotaNote: t("pub.pricing.quotaNote"),
      cta: t("pub.pricing.plans.free.cta"),
      ctaHref: "/login?mode=signup",
    },
    {
      id: "standard",
      name: "Standard",
      price: "₩15,000",
      priceNote: t("pub.pricing.perMonth"),
      tagline: t("pub.pricing.plans.standard.tagline"),
      quota: t("pub.pricing.plans.standard.quota"),
      quotaNote: t("pub.pricing.quotaNote"),
      cta: t("pub.pricing.plans.standard.cta"),
      ctaHref: "/login?mode=signup",
      featured: true,
    },
    {
      id: "pro",
      name: "Pro",
      price: "₩95,000",
      priceNote: t("pub.pricing.perMonth"),
      tagline: t("pub.pricing.plans.pro.tagline"),
      quota: t("pub.pricing.plans.pro.quota"),
      quotaNote: t("pub.pricing.quotaNote"),
      cta: t("pub.pricing.plans.pro.cta"),
      ctaHref: "/login?mode=signup",
    },
    {
      id: "premium",
      name: "Premium",
      price: "₩295,000",
      priceNote: t("pub.pricing.perMonth"),
      tagline: t("pub.pricing.plans.premium.tagline"),
      quota: t("pub.pricing.plans.premium.quota"),
      quotaNote: t("pub.pricing.quotaNote"),
      cta: t("pub.pricing.plans.premium.cta"),
      ctaHref: "/login?mode=signup",
    },
  ];
}

function buildFaqs(t: TFunction) {
  return [
    { q: t("pub.pricing.faqs.q1.q"), a: t("pub.pricing.faqs.q1.a") },
    { q: t("pub.pricing.faqs.q2.q"), a: t("pub.pricing.faqs.q2.a") },
    { q: t("pub.pricing.faqs.q3.q"), a: t("pub.pricing.faqs.q3.a") },
    { q: t("pub.pricing.faqs.q4.q"), a: t("pub.pricing.faqs.q4.a") },
    { q: t("pub.pricing.faqs.q5.q"), a: t("pub.pricing.faqs.q5.a") },
    { q: t("pub.pricing.faqs.q6.q"), a: t("pub.pricing.faqs.q6.a") },
    { q: t("pub.pricing.faqs.q7.q"), a: t("pub.pricing.faqs.q7.a") },
  ];
}

export default async function PricingPage() {
  const t = await getT();
  const PLANS = buildPlans(t);
  const FAQS = buildFaqs(t);
  return (
    <main className="flex min-h-screen flex-col bg-[#02060f] text-white">
      <MarketingHeader />

      <SectionShell glowPosition="top" className="border-t-0">
        <SectionHeader
          eyebrow="Pricing"
          title={
            <>
              {t("pub.pricing.heroTitleBefore")}{" "}
              <GradientText>{t("pub.pricing.heroTitleAccent")}</GradientText>
              <br />
              {t("pub.pricing.heroTitleAfter")}
            </>
          }
          body={t("pub.pricing.heroBody")}
        />
      </SectionShell>

      {/* Plans */}
      <SectionShell glowPosition="top-right">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => (
            <PlanCard key={p.id} plan={p} t={t} />
          ))}
        </div>
        <p className="mt-12 text-center text-xs uppercase tracking-[0.2em] text-white/40">
          {t("pub.pricing.guarantee")}
        </p>

        {/* Quota explainer */}
        <div className="mx-auto mt-16 max-w-3xl">
          <div className="rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-[#091632]/60 via-[#06112a]/50 to-[#040b1d]/75 p-6 backdrop-blur-xl sm:p-8">
            <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400">
              <span className="inline-block h-px w-8 bg-cyan-400" />
              {t("pub.pricing.explainerEyebrow")}
            </div>
            <h3 className="mt-4 text-lg font-bold">{t("pub.pricing.explainerTitle")}</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              {t("pub.pricing.explainerBodyBefore")} <strong className="text-white">{t("pub.pricing.explainerBodyStrong")}</strong>
              {" "}{t("pub.pricing.explainerBodyAfter")}
            </p>
          </div>
        </div>
      </SectionShell>

      {/* FAQ */}
      <SectionShell glowPosition="right" innerClassName="max-w-3xl py-32">
        <div id="faq" className="scroll-mt-24">
          <SectionHeader
            eyebrow="FAQ"
            title={
              <>
                {t("pub.pricing.faqTitleBefore")} <GradientText>{t("pub.pricing.faqTitleAccent")}</GradientText>
              </>
            }
            body={
              <>
                {t("pub.pricing.faqBodyBefore")}{" "}
                <Link href="/faq" className="text-cyan-300 underline-offset-4 hover:underline">
                  /faq
                </Link>{" "}
                {t("pub.pricing.faqBodyAfter")}
              </>
            }
          />

          <div className="mt-16 space-y-3">
            {FAQS.map((q) => (
              <details
                key={q.q}
                className="group rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-[#091632]/60 via-[#06112a]/50 to-[#040b1d]/75 p-6 backdrop-blur-xl transition-colors hover:border-cyan-400/30"
              >
                <summary className="cursor-pointer list-none marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    <span className="text-base font-semibold">{q.q}</span>
                    <span className="font-mono text-xs text-cyan-300/70 transition-transform group-open:rotate-45">
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-white/70">{q.a}</p>
              </details>
            ))}
          </div>
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
                {t("pub.pricing.ctaEyebrow")}
              </div>
              <h2 className="mt-5 text-4xl font-bold leading-[1.15] sm:text-5xl">
                <GradientText>{t("pub.pricing.ctaTitleAccent")}</GradientText> {t("pub.pricing.ctaTitleAfter")}
              </h2>
              <p className="mt-6 text-base text-white/60">{t("pub.pricing.ctaBody")}</p>
              <div className="mt-10">
                <Link
                  href="/login?mode=signup"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-sky-400 to-cyan-500 px-8 py-4 text-base font-semibold text-[#02060f] shadow-[0_0_32px_rgba(56,189,248,0.55)] transition-all hover:gap-3 hover:shadow-[0_0_44px_rgba(56,189,248,0.75)]"
                >
                  {t("pub.cta.signup")}
                  <ArrowRight className="h-5 w-5" />
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

function PlanCard({ plan, t }: { plan: Plan; t: TFunction }) {
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border p-8 backdrop-blur-xl transition-all",
        plan.featured
          ? "border-cyan-400/40 bg-gradient-to-br from-[#0b1e44]/85 via-[#071534]/70 to-[#04102a]/90 shadow-[0_40px_120px_-30px_rgba(56,189,248,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "border-cyan-500/15 bg-gradient-to-br from-[#091632]/60 via-[#06112a]/50 to-[#040b1d]/75 hover:border-cyan-400/30 hover:shadow-[0_30px_80px_-20px_rgba(56,189,248,0.3)]",
      )}
    >
      {plan.featured && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-20 -top-32 h-64 bg-gradient-to-b from-cyan-400/15 to-transparent blur-2xl"
        />
      )}
      {plan.featured ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <div className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-sky-400 to-cyan-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#02060f] shadow-[0_0_24px_rgba(56,189,248,0.6)]">
            <Sparkles className="h-3 w-3" />
            Most Popular
          </div>
        </div>
      ) : null}
      <div className="relative">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
          {plan.tagline}
        </div>
        <h3 className="mt-3 text-2xl font-bold">{plan.name}</h3>
        <div className="mt-5 flex items-baseline gap-1.5">
          <div className="bg-gradient-to-br from-white via-white to-cyan-200 bg-clip-text font-mono text-4xl font-bold text-transparent">
            {plan.price}
          </div>
          <div className="text-sm text-white/40">{plan.priceNote}</div>
        </div>
      </div>

      <div className="relative mt-8 flex-1">
        {/* Quota — the only differentiator */}
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-5 text-center">
          <div className="bg-gradient-to-br from-sky-200 via-cyan-300 to-blue-400 bg-clip-text font-mono text-3xl font-black tracking-tight text-transparent">
            {plan.quota}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-wider text-white/55">
            {plan.quotaNote}
          </div>
        </div>

        <ul className="mt-5 space-y-2.5 text-sm">
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-cyan-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
            <span className="text-white/75">{t("pub.pricing.feature1")}</span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-cyan-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
            <span className="text-white/75">{t("pub.pricing.feature2")}</span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-cyan-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
            <span className="text-white/75">{t("pub.pricing.feature3")}</span>
          </li>
        </ul>
      </div>

      <Link
        href={plan.ctaHref}
        className={cn(
          "relative mt-10 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all",
          plan.featured
            ? "bg-gradient-to-br from-sky-400 to-cyan-500 text-[#02060f] shadow-[0_0_24px_rgba(56,189,248,0.5)] hover:gap-3 hover:shadow-[0_0_36px_rgba(56,189,248,0.7)]"
            : "border border-white/20 bg-white/5 text-white hover:bg-white/10",
        )}
      >
        {plan.cta}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
