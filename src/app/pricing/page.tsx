import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles, X } from "lucide-react";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "가격 · Alpha Gate",
  description:
    "Free / Standard / Pro 3개 플랜. 무료로 시작해서 필요할 때만 업그레이드하세요.",
};

interface PlanFeature {
  label: string;
  included: boolean;
}

interface Plan {
  id: string;
  name: string;
  price: string;
  priceNote: string;
  tagline: string;
  features: PlanFeature[];
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
    features: [
      { label: "월 5회 AI 분석", included: true },
      { label: "주문 검토 무제한", included: true },
      { label: "저널 30건까지", included: true },
      { label: "성과 분석 기본", included: true },
      { label: "AI 복기 코멘트 월 3회", included: true },
      { label: "워치리스트 + 알림", included: false },
      { label: "거래소 API 연동", included: false },
      { label: "다중 코인 스캐너", included: false },
      { label: "자동 정기 분석", included: false },
      { label: "백테스트", included: false },
    ],
    cta: "무료로 시작",
    ctaHref: "/login?mode=signup",
  },
  {
    id: "standard",
    name: "Standard",
    price: "₩24,900",
    priceNote: "/ 월",
    tagline: "활성 트레이더용",
    featured: true,
    features: [
      { label: "Free 전부", included: true },
      { label: "AI 분석 무제한", included: true },
      { label: "저널 무제한", included: true },
      { label: "AI 복기 무제한", included: true },
      { label: "워치리스트 20개 + 알림", included: true },
      { label: "거래소 API 연동 (1개)", included: true },
      { label: "다중 코인 스캐너", included: true },
      { label: "Telegram / Discord 알림", included: true },
      { label: "자동 정기 분석", included: false },
      { label: "백테스트", included: false },
    ],
    cta: "7일 무료 체험",
    ctaHref: "/login?mode=signup",
  },
  {
    id: "pro",
    name: "Pro",
    price: "₩59,900",
    priceNote: "/ 월",
    tagline: "프로 트레이더용",
    features: [
      { label: "Standard 전부", included: true },
      { label: "자동 정기 분석 (매일 N회)", included: true },
      { label: "다중 거래소 (3개까지)", included: true },
      { label: "백테스트", included: true },
      { label: "AI 채팅 (분석 후속 질문)", included: true },
      { label: "우선 처리 + 빠른 모델", included: true },
      { label: "워치리스트 무제한", included: true },
      { label: "고급 데이터 (옵션·온체인 일부)", included: true },
      { label: "1:1 이메일 지원", included: true },
      { label: "API 접근 (Webhook)", included: true },
    ],
    cta: "Pro 시작",
    ctaHref: "/login?mode=signup",
  },
];

export default function PricingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-black text-white">
      <MarketingHeader />

      <section className="relative isolate overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_30%,rgba(56,189,248,0.15),transparent_70%)]" />
        <div className="relative mx-auto max-w-5xl px-6 py-32 text-center sm:px-10">
          <Eyebrow>Pricing</Eyebrow>
          <h1 className="mt-6 text-5xl font-bold leading-[1.1] sm:text-6xl lg:text-7xl">
            필요할 때만
            <br />
            <span className="text-primary">업그레이드</span>하세요
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-white/60">
            무료로 시작해서 도구가 필요해지면 그때 결정. 신용카드 없이 가입.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="border-b border-white/10 bg-black py-24">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <div className="grid gap-4 lg:grid-cols-3">
            {PLANS.map((p) => (
              <PlanCard key={p.id} plan={p} />
            ))}
          </div>
          <p className="mt-12 text-center text-xs uppercase tracking-[0.2em] text-white/40">
            모든 플랜 · 7일 환불 보장 · 언제든 해지
          </p>
        </div>
      </section>

      {/* Comparison table */}
      <section className="border-b border-white/10 bg-zinc-950 py-32">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <div className="text-center">
            <Eyebrow>플랜 비교</Eyebrow>
            <h2 className="mt-6 text-4xl font-bold leading-[1.15] sm:text-5xl">
              한눈에 비교
            </h2>
          </div>

          <div className="mt-16 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  <th className="p-5 text-left text-xs font-semibold uppercase tracking-wider text-white/40">
                    기능
                  </th>
                  {PLANS.map((p) => (
                    <th key={p.id} className="p-5 text-center">
                      <div className="text-base font-bold">{p.name}</div>
                      <div className="mt-1 font-mono text-xs text-white/60">{p.price}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row, i) => (
                  <tr
                    key={i}
                    className={cn(
                      "border-b border-white/5",
                      row.section && "bg-white/[0.02]",
                    )}
                  >
                    <td
                      className={cn(
                        "p-4 text-white/70",
                        row.section && "font-semibold uppercase tracking-wider text-primary text-[10px]",
                      )}
                    >
                      {row.label}
                    </td>
                    {row.section ? (
                      <>
                        <td />
                        <td />
                        <td />
                      </>
                    ) : (
                      row.values.map((v, j) => (
                        <td key={j} className="p-4 text-center">
                          {typeof v === "boolean" ? (
                            v ? (
                              <CheckCircle2 className="mx-auto h-4 w-4 text-grade-a" />
                            ) : (
                              <X className="mx-auto h-4 w-4 text-white/20" />
                            )
                          ) : (
                            <span className="font-mono text-xs text-white/80">{v}</span>
                          )}
                        </td>
                      ))
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-24 border-b border-white/10 bg-black py-32">
        <div className="mx-auto max-w-3xl px-6 sm:px-10">
          <div className="text-center">
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="mt-6 text-4xl font-bold leading-[1.15] sm:text-5xl">
              자주 묻는 질문
            </h2>
          </div>

          <div className="mt-16 space-y-4">
            {FAQS.map((q) => (
              <div key={q.q} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm">
                <h3 className="text-base font-bold">{q.q}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/70">{q.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative isolate overflow-hidden bg-black py-32">
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 h-[400px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl"
        />
        <div className="relative mx-auto max-w-3xl px-6 text-center sm:px-10">
          <h2 className="text-4xl font-bold leading-[1.15] sm:text-5xl">
            먼저 무료로 써보세요
          </h2>
          <p className="mt-6 text-base text-white/60">필요해지면 그때 업그레이드.</p>
          <div className="mt-10">
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-black transition-all hover:gap-3 hover:bg-white/90"
            >
              무료 회원가입
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}

interface ComparisonRow {
  label: string;
  values: (boolean | string)[];
  section?: boolean;
}

const COMPARISON: ComparisonRow[] = [
  { label: "AI 분석", values: [], section: true },
  { label: "월 분석 횟수", values: ["5회", "무제한", "무제한"] },
  { label: "분석 기록 보관", values: ["30일", "무제한", "무제한"] },
  { label: "AI 복기 코멘트", values: ["월 3회", "무제한", "무제한"] },
  { label: "주문 검토 & 저널", values: [], section: true },
  { label: "주문 검토 사용", values: [true, true, true] },
  { label: "저널 건수", values: ["30건", "무제한", "무제한"] },
  { label: "성과 분석 대시보드", values: [true, true, true] },
  { label: "거래 자동 연동 & 알림", values: [], section: true },
  { label: "워치리스트 + 알림", values: [false, "20개", "무제한"] },
  { label: "거래소 API 연동", values: [false, "1개", "3개"] },
  { label: "Telegram / Discord", values: [false, true, true] },
  { label: "자동 정기 분석", values: [false, false, true] },
  { label: "고급 기능", values: [], section: true },
  { label: "다중 코인 스캐너", values: [false, true, true] },
  { label: "백테스트", values: [false, false, true] },
  { label: "AI 채팅 (후속 질문)", values: [false, false, true] },
  { label: "API 접근 (Webhook)", values: [false, false, true] },
  { label: "지원", values: [], section: true },
  { label: "응답 속도", values: ["커뮤니티", "이메일 48h", "이메일 24h + 우선"] },
];

const FAQS = [
  {
    q: "정말 무료로 시작할 수 있나요?",
    a: "네. Free 플랜은 영구 무료이며 신용카드 없이 가입 가능합니다. 월 5회 AI 분석과 주문 검토·저널 기본 기능을 사용하실 수 있습니다.",
  },
  {
    q: "결제 후 환불이 가능한가요?",
    a: "결제일로부터 7일 이내 100% 환불 가능합니다. 이메일로 요청 주시면 영업일 기준 1~2일 내 처리됩니다.",
  },
  {
    q: "거래소 API 연동은 어떻게 동작하나요?",
    a: "Binance·Bybit·Upkit 등의 read-only API 키만 사용합니다. 출금 권한이 없는 키만 등록 가능하며, 거래 기록을 자동으로 저널에 가져옵니다. API 키는 암호화되어 저장됩니다.",
  },
  {
    q: "AI가 매수/매도를 추천하나요?",
    a: "아니요. Alpha Gate는 시나리오와 무효화 조건을 제시할 뿐 특정 매수/매도를 권유하지 않습니다. 모든 거래 결정과 결과는 사용자 본인의 책임입니다.",
  },
  {
    q: "내 거래 데이터는 안전한가요?",
    a: "모든 데이터는 Supabase의 Row-Level Security로 사용자별 격리됩니다. 다른 사용자는 코드 버그가 있어도 접근할 수 없으며, 언제든 본인 계정과 모든 데이터를 삭제할 수 있습니다.",
  },
  {
    q: "Pro 플랜의 '우선 처리'는 무엇인가요?",
    a: "트래픽이 많을 때 Pro 사용자의 분석 요청이 큐에서 먼저 처리됩니다. 또한 분석에 사용되는 LLM 모델이 더 빠른 응답 변형을 사용합니다.",
  },
  {
    q: "플랜 변경은 언제든 가능한가요?",
    a: "네. 언제든 업그레이드/다운그레이드 가능합니다. 업그레이드 시 차액만 청구, 다운그레이드 시 다음 결제 주기부터 적용됩니다.",
  },
  {
    q: "어떤 거래소를 지원하나요?",
    a: "현재 Binance Futures를 데이터 소스로 사용합니다. 거래소 API 연동(저널 자동화)은 Binance·Bybit·Upbit 순차 지원 예정입니다.",
  },
];

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-3xl border p-8 transition-all",
        plan.featured
          ? "border-primary/50 bg-gradient-to-br from-primary/10 via-zinc-950 to-black shadow-2xl shadow-primary/20"
          : "border-white/10 bg-white/[0.02] hover:border-white/20",
      )}
    >
      {plan.featured ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <div className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground shadow-[0_0_20px_rgba(56,189,248,0.5)]">
            <Sparkles className="h-3 w-3" />
            Most Popular
          </div>
        </div>
      ) : null}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{plan.tagline}</div>
        <h3 className="mt-3 text-2xl font-bold">{plan.name}</h3>
        <div className="mt-5 flex items-baseline gap-1.5">
          <div className="font-mono text-4xl font-bold">{plan.price}</div>
          <div className="text-sm text-white/40">{plan.priceNote}</div>
        </div>
      </div>

      <ul className="mt-8 flex-1 space-y-3">
        {plan.features.map((f) => (
          <li key={f.label} className="flex items-start gap-2.5 text-sm">
            {f.included ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-grade-a" />
            ) : (
              <X className="mt-0.5 h-4 w-4 flex-none text-white/20" />
            )}
            <span className={cn(f.included ? "text-white/80" : "text-white/30")}>{f.label}</span>
          </li>
        ))}
      </ul>

      <Link
        href={plan.ctaHref}
        className={cn(
          "mt-10 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all",
          plan.featured
            ? "bg-primary text-primary-foreground shadow-[0_0_24px_rgba(56,189,248,0.45)] hover:gap-3"
            : "border border-white/20 bg-white/5 text-white hover:bg-white/10",
        )}
      >
        {plan.cta}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
