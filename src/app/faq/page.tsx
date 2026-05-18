import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, Sparkles } from "lucide-react";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { SectionShell, SectionHeader, GradientText } from "@/components/marketing/section";
import { FAQ_GROUPS } from "@/lib/marketing/faqs";

export const metadata: Metadata = {
  title: "FAQ — Alpha Gate",
  description: "Alpha Gate에 자주 묻는 질문. 결제·환불·AI 분석·데이터 보안 관련 답변을 한곳에서 확인하세요.",
};

export default function FaqPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[#02060f] text-white">
      <MarketingHeader />

      <SectionShell glowPosition="top" className="border-t-0">
        <SectionHeader
          eyebrow="FAQ"
          title={
            <>
              자주 <GradientText>묻는 질문</GradientText>
            </>
          }
          body="결제·환불·AI 분석·데이터 보안에 대한 답변을 정리했습니다. 추가 질문은 언제든 문의해주세요."
        />
      </SectionShell>

      <SectionShell glowPosition="right" innerClassName="max-w-3xl py-24">
        <div className="space-y-14">
          {FAQ_GROUPS.map((group) => (
            <div key={group.category}>
              <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400">
                <span className="inline-block h-px w-8 bg-cyan-400" />
                {group.category}
              </div>
              <h2 className="mt-4 text-2xl font-bold leading-[1.2]">{group.category}</h2>
              <div className="mt-7 space-y-3">
                {group.items.map((item) => (
                  <details
                    key={item.q}
                    className="group rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-[#091632]/60 via-[#06112a]/50 to-[#040b1d]/75 p-6 backdrop-blur-xl transition-all hover:border-cyan-400/30"
                  >
                    <summary className="cursor-pointer list-none marker:hidden">
                      <span className="flex items-center justify-between gap-4">
                        <span className="text-base font-semibold">{item.q}</span>
                        <span className="font-mono text-xs text-cyan-300/70 transition-transform group-open:rotate-45">
                          +
                        </span>
                      </span>
                    </summary>
                    <p className="mt-4 text-sm leading-relaxed text-white/70">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionShell>

      {/* Contact CTA */}
      <section className="relative isolate overflow-hidden border-t border-white/[0.06]">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[1000px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.20),transparent_70%)] blur-3xl"
        />
        <div className="relative mx-auto max-w-4xl px-6 py-32 sm:px-10">
          <div className="relative overflow-hidden rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-[#0b1e44]/80 via-[#071534]/60 to-[#04102a]/80 p-12 text-center shadow-[0_40px_120px_-30px_rgba(56,189,248,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl sm:p-14">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-20 -top-32 h-64 bg-gradient-to-b from-cyan-400/15 to-transparent blur-2xl"
            />
            <div className="relative">
              <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
                <Sparkles className="h-3 w-3" />
                추가 문의
              </div>
              <h2 className="mt-5 text-3xl font-bold leading-[1.15] sm:text-4xl">
                답을 <GradientText>못 찾으셨나요?</GradientText>
              </h2>
              <p className="mt-5 text-base text-white/60">
                이메일로 직접 답변 드립니다. 평균 응답 시간은 영업일 기준 24시간 이내입니다.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-sky-400 to-cyan-500 px-6 py-3 text-sm font-semibold text-[#02060f] shadow-[0_0_24px_rgba(56,189,248,0.45)] transition-all hover:gap-3 hover:shadow-[0_0_36px_rgba(56,189,248,0.6)]"
                >
                  <Mail className="h-4 w-4" />
                  문의하기
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white/80 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
                >
                  가격 보기
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
