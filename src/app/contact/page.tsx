import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageSquare, Clock, ExternalLink } from "lucide-react";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("legal.contact.metaTitle"),
    description: t("legal.contact.metaDesc"),
  };
}

const SUPPORT_EMAIL = "hello@alphagate.app";

export default async function ContactPage() {
  const t = await getT();
  const TOPICS = [
    { label: t("legal.contact.topicRefund"), href: "/refund" },
    { label: t("legal.contact.topicPlanChange"), href: "/faq" },
    { label: t("legal.contact.topicAiCount"), href: "/faq" },
    { label: t("legal.contact.topicAccount"), href: "/faq" },
    { label: t("legal.contact.topicDataDelete"), href: "/privacy" },
    { label: t("legal.contact.topicTerms"), href: "/terms" },
  ];
  return (
    <main className="flex min-h-screen flex-col bg-[#02060f] text-white">
      <MarketingHeader />

      <SectionShell glowPosition="top" className="border-t-0">
        <SectionHeader
          eyebrow={t("legal.contact.eyebrow")}
          title={
            <>
              {t("legal.contact.titlePre")}<GradientText>{t("legal.contact.titleHighlight")}</GradientText>
            </>
          }
          body={t("legal.contact.body")}
        />
      </SectionShell>

      <SectionShell glowPosition="bottom-left">
        <div className="grid gap-5 md:grid-cols-3">
          <ChannelCard
            icon={Mail}
            title={t("legal.contact.channelEmailTitle")}
            body={t("legal.contact.channelEmailBody")}
            cta={`mailto:${SUPPORT_EMAIL}`}
            ctaLabel={SUPPORT_EMAIL}
            external
            primary
          />
          <ChannelCard
            icon={MessageSquare}
            title={t("legal.contact.channelFeatureTitle")}
            body={t("legal.contact.channelFeatureBody")}
            cta={`mailto:${SUPPORT_EMAIL}?subject=%5B%EA%B8%B0%EB%8A%A5%20%EC%A0%9C%EC%95%88%5D`}
            ctaLabel={t("legal.contact.channelFeatureCta")}
            external
          />
          <ChannelCard
            icon={Clock}
            title={t("legal.contact.channelTimeTitle")}
            body={t("legal.contact.channelTimeBody")}
            cta="/pricing"
            ctaLabel={t("legal.contact.channelTimeCta")}
          />
        </div>

        {/* Topics */}
        <div className="mt-20">
          <SectionHeader
            eyebrow={t("legal.contact.topicsEyebrow")}
            title={
              <>
                {t("legal.contact.topicsTitlePre")}<GradientText>{t("legal.contact.topicsTitleHighlight")}</GradientText>
              </>
            }
            align="left"
          />
          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {TOPICS.map((t) => (
              <Link
                key={t.label}
                href={t.href}
                className="group flex items-center justify-between rounded-xl border border-cyan-500/15 bg-gradient-to-br from-[#091632]/60 via-[#06112a]/50 to-[#040b1d]/75 px-5 py-4 text-sm transition-all hover:border-cyan-400/40 hover:shadow-[0_20px_60px_-20px_rgba(56,189,248,0.3)]"
              >
                <span className="text-white/80 group-hover:text-white">{t.label}</span>
                <span className="font-mono text-xs text-cyan-300/70 transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Direct contact card */}
        <div className="mt-16">
          <div className="relative overflow-hidden rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-[#0b1e44]/80 via-[#071534]/60 to-[#04102a]/80 p-10 shadow-[0_40px_120px_-30px_rgba(56,189,248,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-20 -top-32 h-64 bg-gradient-to-b from-cyan-400/15 to-transparent blur-2xl"
            />
            <div className="relative">
              <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
                <span className="inline-block h-px w-8 bg-cyan-400/70" />
                {t("legal.contact.directEyebrow")}
              </div>
              <h3 className="mt-4 text-2xl font-bold">
                <GradientText>{SUPPORT_EMAIL}</GradientText>
              </h3>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70">
                {t("legal.contact.directBody")}
              </p>
              <ul className="mt-5 space-y-2 text-sm text-white/70">
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
                  {t("legal.contact.directItem1")}
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
                  {t("legal.contact.directItem2")}
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
                  {t("legal.contact.directItem3")}
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
                  {t("legal.contact.directItem4")}
                </li>
              </ul>
              <div className="mt-7">
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-sky-400 to-cyan-500 px-6 py-3 text-sm font-semibold text-[#02060f] shadow-[0_0_24px_rgba(56,189,248,0.45)] transition-all hover:gap-3 hover:shadow-[0_0_36px_rgba(56,189,248,0.6)]"
                >
                  {t("legal.contact.directComposeEmail")}
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </SectionShell>

      <MarketingFooter />
    </main>
  );
}

function ChannelCard({
  icon,
  title,
  body,
  cta,
  ctaLabel,
  external,
  primary,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  cta: string;
  ctaLabel: string;
  external?: boolean;
  primary?: boolean;
}) {
  const linkCls = cn(
    "mt-5 inline-flex items-center gap-1 text-sm font-semibold transition-colors",
    primary ? "text-cyan-300 hover:text-cyan-200" : "text-white/80 hover:text-white",
  );
  return (
    <GlowCard>
      <IconBadge icon={icon} />
      <h3 className="mt-5 text-base font-bold">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-white/60">{body}</p>
      {external ? (
        <a href={cta} className={linkCls}>
          {ctaLabel} →
        </a>
      ) : (
        <Link href={cta} className={linkCls}>
          {ctaLabel} →
        </Link>
      )}
    </GlowCard>
  );
}
