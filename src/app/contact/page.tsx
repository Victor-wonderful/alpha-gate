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

export const metadata: Metadata = {
  title: "문의 — Alpha Gate",
  description: "Alpha Gate 운영팀에 문의하기. 영업일 기준 24시간 이내 회신 드립니다.",
};

const SUPPORT_EMAIL = "hello@alphagate.app";

export default function ContactPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[#02060f] text-white">
      <MarketingHeader />

      <SectionShell glowPosition="top" className="border-t-0">
        <SectionHeader
          eyebrow="문의"
          title={
            <>
              바로 <GradientText>답변 드립니다</GradientText>
            </>
          }
          body="결제·환불·기술 문제·기능 제안 무엇이든 환영합니다. 영업일 기준 24시간 이내 회신해드립니다."
        />
      </SectionShell>

      <SectionShell glowPosition="bottom-left">
        <div className="grid gap-5 md:grid-cols-3">
          <ChannelCard
            icon={Mail}
            title="이메일"
            body="자세한 내용을 적어 보내주세요. 결제·환불·계정 관련 문의는 이메일이 가장 빠릅니다."
            cta={`mailto:${SUPPORT_EMAIL}`}
            ctaLabel={SUPPORT_EMAIL}
            external
            primary
          />
          <ChannelCard
            icon={MessageSquare}
            title="기능 제안"
            body="원하는 기능이나 개선 아이디어가 있다면 알려주세요. 우선순위에 반영됩니다."
            cta={`mailto:${SUPPORT_EMAIL}?subject=%5B%EA%B8%B0%EB%8A%A5%20%EC%A0%9C%EC%95%88%5D`}
            ctaLabel="제안 보내기"
            external
          />
          <ChannelCard
            icon={Clock}
            title="응답 시간"
            body="영업일 기준 24시간 이내. 결제·환불·기술 문제 모두 동일하게 회신해드립니다."
            cta="/pricing"
            ctaLabel="플랜 비교"
          />
        </div>

        {/* Topics */}
        <div className="mt-20">
          <SectionHeader
            eyebrow="자주 문의 주제"
            title={
              <>
                FAQ에서 <GradientText>먼저 확인</GradientText>
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
                직접 보내기
              </div>
              <h3 className="mt-4 text-2xl font-bold">
                <GradientText>{SUPPORT_EMAIL}</GradientText>
              </h3>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70">
                아래 항목을 함께 적어주시면 더 빠르게 도와드릴 수 있습니다.
              </p>
              <ul className="mt-5 space-y-2 text-sm text-white/70">
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
                  가입 이메일 (계정 관련 문의 시)
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
                  사용 중인 플랜 (Free / Standard / Pro)
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
                  발생한 화면 스크린샷 (기술 문제 시)
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
                  재현 단계 또는 거래 ID
                </li>
              </ul>
              <div className="mt-7">
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-sky-400 to-cyan-500 px-6 py-3 text-sm font-semibold text-[#02060f] shadow-[0_0_24px_rgba(56,189,248,0.45)] transition-all hover:gap-3 hover:shadow-[0_0_36px_rgba(56,189,248,0.6)]"
                >
                  이메일 작성
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

const TOPICS = [
  { label: "결제 후 환불 절차", href: "/refund" },
  { label: "플랜 변경 / 업그레이드", href: "/faq" },
  { label: "AI 분석 횟수 카운트 기준", href: "/faq" },
  { label: "계정 / 비밀번호 문제", href: "/faq" },
  { label: "데이터 삭제 / 탈퇴", href: "/privacy" },
  { label: "이용약관 / 면책 사항", href: "/terms" },
];

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
