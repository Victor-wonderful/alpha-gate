import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { SectionShell, SectionHeader, GradientText } from "@/components/marketing/section";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "가격 · Alpha Gate",
  description:
    "Free / Standard / Pro 3개 플랜. 무료로 시작해서 필요할 때만 업그레이드하세요.",
};

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

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "₩0",
    priceNote: "영구 무료",
    tagline: "맛보기로 충분",
    quota: "월 5회",
    quotaNote: "AI 분석",
    cta: "무료로 시작",
    ctaHref: "/login?mode=signup",
  },
  {
    id: "standard",
    name: "Standard",
    price: "₩15,000",
    priceNote: "/ 월",
    tagline: "활성 트레이더용",
    quota: "월 100회",
    quotaNote: "AI 분석",
    cta: "Standard 시작",
    ctaHref: "/login?mode=signup",
    featured: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "₩95,000",
    priceNote: "/ 월",
    tagline: "프로 트레이더용",
    quota: "월 500회",
    quotaNote: "AI 분석",
    cta: "Pro 시작",
    ctaHref: "/login?mode=signup",
  },
  {
    id: "premium",
    name: "Premium",
    price: "₩295,000",
    priceNote: "/ 월",
    tagline: "팀·헤비유저용",
    quota: "무제한",
    quotaNote: "AI 분석",
    cta: "Premium 시작",
    ctaHref: "/login?mode=signup",
  },
];

export default function PricingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[#02060f] text-white">
      <MarketingHeader />

      <SectionShell glowPosition="top" className="border-t-0">
        <SectionHeader
          eyebrow="Pricing"
          title={
            <>
              필요할 때만{" "}
              <GradientText>업그레이드</GradientText>
              <br />
              하세요
            </>
          }
          body="무료로 시작해서 도구가 필요해지면 그때 결정. 신용카드 없이 가입."
        />
      </SectionShell>

      {/* Plans */}
      <SectionShell glowPosition="top-right">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </div>
        <p className="mt-12 text-center text-xs uppercase tracking-[0.2em] text-white/40">
          모든 플랜 · 7일 환불 보장 · 언제든 해지
        </p>

        {/* Quota explainer */}
        <div className="mx-auto mt-16 max-w-3xl">
          <div className="rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-[#091632]/60 via-[#06112a]/50 to-[#040b1d]/75 p-6 backdrop-blur-xl sm:p-8">
            <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400">
              <span className="inline-block h-px w-8 bg-cyan-400" />
              참고
            </div>
            <h3 className="mt-4 text-lg font-bold">AI 분석 횟수만 다릅니다</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              주문 검토·내 거래(저널)·성과 분석·AI 복기 코멘트는 모든 플랜에서 <strong className="text-white">제한 없이</strong>
              {" "}쓰실 수 있습니다. 결제는 매달 분석 횟수가 충전되는 구독 방식이며, 다 쓰지 못한 횟수는 이월되지 않습니다.
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
                자주 <GradientText>묻는 질문</GradientText>
              </>
            }
            body={
              <>
                전체 FAQ는{" "}
                <Link href="/faq" className="text-cyan-300 underline-offset-4 hover:underline">
                  /faq
                </Link>{" "}
                에서 카테고리별로 확인할 수 있습니다.
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
                먼저 무료로
              </div>
              <h2 className="mt-5 text-4xl font-bold leading-[1.15] sm:text-5xl">
                <GradientText>먼저 무료로</GradientText> 써보세요
              </h2>
              <p className="mt-6 text-base text-white/60">필요해지면 그때 업그레이드.</p>
              <div className="mt-10">
                <Link
                  href="/login?mode=signup"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-sky-400 to-cyan-500 px-8 py-4 text-base font-semibold text-[#02060f] shadow-[0_0_32px_rgba(56,189,248,0.55)] transition-all hover:gap-3 hover:shadow-[0_0_44px_rgba(56,189,248,0.75)]"
                >
                  무료 회원가입
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

const FAQS = [
  {
    q: "정말 무료로 시작할 수 있나요?",
    a: "네. Free 플랜은 영구 무료이며 신용카드 없이 가입 가능합니다. 매월 5회 AI 분석과 주문 검토·내 거래·성과 분석 기능을 제한 없이 쓰실 수 있습니다.",
  },
  {
    q: "플랜 간 차이는 무엇인가요?",
    a: "월 AI 분석 횟수만 다릅니다. 주문 검토, 내 거래(저널), 성과 분석, AI 복기 코멘트는 모든 플랜에서 무제한입니다.",
  },
  {
    q: "쓰지 못한 분석 횟수는 이월되나요?",
    a: "아니요. 매월 결제일에 새로 충전되며, 남은 횟수는 이월되지 않습니다. 본인의 평균 매매 빈도에 맞는 플랜을 선택해주세요.",
  },
  {
    q: "결제 후 환불이 가능한가요?",
    a: "결제일로부터 7일 이내 100% 환불 가능합니다. 이메일(hello@alphagate.app)로 요청 주시면 영업일 기준 1~2일 내 처리됩니다.",
  },
  {
    q: "플랜 변경은 언제든 가능한가요?",
    a: "네. 언제든 업그레이드/다운그레이드 가능합니다. 업그레이드 시 차액만 청구되며 즉시 새 횟수가 적용됩니다. 다운그레이드는 다음 결제 주기부터 반영됩니다.",
  },
  {
    q: "AI가 매수/매도를 추천하나요?",
    a: "아니요. Alpha Gate는 시나리오와 무효화 조건을 제시할 뿐 특정 매수/매도를 권유하지 않습니다. 모든 거래 결정과 결과는 사용자 본인의 책임입니다.",
  },
  {
    q: "내 거래 데이터는 안전한가요?",
    a: "모든 데이터는 Supabase의 Row-Level Security로 사용자별 격리됩니다. 다른 사용자는 코드 버그가 있어도 접근할 수 없으며, 언제든 본인 계정과 모든 데이터를 삭제할 수 있습니다.",
  },
];

function PlanCard({ plan }: { plan: Plan }) {
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
            <span className="text-white/75">주문 검토 무제한</span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-cyan-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
            <span className="text-white/75">내 거래·성과 분석 무제한</span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-cyan-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
            <span className="text-white/75">AI 복기 코멘트 무제한</span>
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
