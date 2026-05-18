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

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[#02060f] text-white">
      <HeroDashboard />

      {/* ───── Pain ───── */}
      <SectionShell glowPosition="top-left">
        <SectionHeader
          eyebrow="문제"
          title={
            <>
              분석은 잘합니다.
              <br />
              <span className="bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                결정에서 무너집니다.
              </span>
            </>
          }
          body="차트는 잘 봅니다. 그런데 진입 버튼 앞에서 흔들립니다. FOMO, 추격, 손절 미준수, 사이즈 오버. 트레이더가 잃는 이유는 분석 부족이 아니라 결정의 일관성이 무너지기 때문입니다."
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
          eyebrow="작동 방식"
          title={
            <>
              4단계로
              <br />
              <span className="bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                결정을 시스템화
              </span>
              합니다
            </>
          }
          body="매번 같은 흐름으로 거래하면 감정이 끼어들 자리가 없습니다."
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
            자세히 보기
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </SectionShell>

      {/* ───── Features ───── */}
      <SectionShell glowPosition="right">
        <SectionHeader
          eyebrow="기능"
          title={
            <>
              차트가 아니라{" "}
              <span className="bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                결정을 다룹니다
              </span>
            </>
          }
          body="진입 전부터 청산 후까지, 의사결정의 모든 지점을 객관 데이터로 잇습니다."
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
              <FeaturePreview kind={f.id} />
            </div>
          ))}
        </div>
      </SectionShell>

      {/* ───── Why ───── */}
      <SectionShell glowPosition="bottom-left">
        <SectionHeader
          eyebrow="차별점"
          title={
            <>
              데이터로 결정합니다.
              <br />
              <span className="bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                감이 아니라.
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
                지금 시작
              </div>
              <h2 className="mt-5 text-3xl font-bold leading-[1.15] sm:text-5xl">
                다음 거래 전,
                <br />
                <span className="bg-gradient-to-r from-sky-200 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                  5분이면 충분합니다
                </span>
              </h2>
              <p className="mx-auto mt-6 max-w-md text-base text-white/60">
                한 번의 D급 거래가 한 달 수익을 지웁니다.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/login?mode=signup"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-sky-400 to-cyan-500 px-7 py-3.5 text-sm font-semibold text-[#02060f] shadow-[0_0_32px_rgba(56,189,248,0.55)] transition-all hover:gap-3 hover:shadow-[0_0_44px_rgba(56,189,248,0.75)]"
                >
                  무료로 시작
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white/80 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
                >
                  가격 보기
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-white/40">
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-cyan-400" /> 신용카드 불필요
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-cyan-400" /> Free 영구 무료
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-cyan-400" /> 7일 환불 보장
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

const PAINS = [
  {
    title: "추격 진입",
    loss: "−1.2R",
    sub: "거래당 평균 손실",
    body: "가격이 이미 움직인 후 따라 들어갑니다. 손절폭은 넓어지고 손익비는 무너집니다.",
    icon: Flame,
  },
  {
    title: "손절 미준수",
    loss: "−2.5R",
    sub: "사고당 평균 손실",
    body: "계획한 손절가에서 한 번만 버티면 됩니다. 그 한 번이 한 달 성과를 지웁니다.",
    icon: AlertTriangle,
  },
  {
    title: "사이즈 오버",
    loss: "−50%",
    sub: "최대 계좌 손실",
    body: "확신이 강할수록 베팅이 커집니다. 한 번 틀리면 회복이 어려워집니다.",
    icon: TrendingDown,
  },
] as const;

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
    <div className="group relative overflow-hidden rounded-2xl border border-rose-500/15 bg-gradient-to-br from-[#1a0a14]/70 via-[#100614]/60 to-[#04020a]/85 p-7 backdrop-blur-xl transition-all hover:border-rose-400/40 hover:shadow-[0_30px_80px_-20px_rgba(244,63,94,0.30)]">
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

const STEPS = [
  {
    title: "AI 분석",
    icon: Brain,
    tag: "진입 전",
    body: "Binance 실시간 데이터로 시장 구조·수급·심리를 분석합니다. 시나리오 1~3개와 무효화 조건을 제시합니다.",
  },
  {
    title: "주문 검토",
    icon: ClipboardCheck,
    tag: "진입 전",
    body: "진입가·손절·목표를 입력하면 A·B·C·D 등급으로 답합니다. 추격·미확정 캔들·BTC 충돌을 자동 감지합니다.",
  },
  {
    title: "내 거래",
    icon: BookOpen,
    tag: "진입 후",
    body: "진입한 거래를 기록하고 청산 결과를 입력합니다. 결과 입력 후 AI가 한국어 복기 코멘트를 생성합니다.",
  },
  {
    title: "성과 분석",
    icon: BarChart3,
    tag: "진입 후",
    body: "등급별 평균 R·승률·실수 태그 통계로 매매 패턴을 객관적으로 파악합니다.",
  },
];

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

const FEATURES: FeatureItem[] = [
  {
    id: "analyze",
    tag: "AI 분석",
    title: "객관 데이터를 해석합니다",
    body: "Binance 공개 API에서 12개 이상의 데이터를 종합해 1~3개의 시나리오를 제시합니다. AI가 가격을 만들어내지 않습니다.",
    bullets: [
      "멀티 타임프레임 캔들·호가·체결·펀딩",
      "ATR, VWAP, 상위 트레이더 비율, F&G 지수",
      "시나리오별 트리거·무효화 조건 명시",
    ],
  },
  {
    id: "trade",
    tag: "주문 검토",
    title: "거래소처럼 입력합니다",
    body: "진입가·손절·목표·계좌·리스크·레버리지를 거래소 주문 화면처럼 입력합니다. 손익비, 시장 구조, 트리거 검증을 종합해 A·B·C·D 등급과 행동 권고를 제시합니다.",
    bullets: [
      "추격 진입·미확정 캔들 자동 감지",
      "포지션 사이징 + 권장 레버리지 자동 계산",
      "수수료 차감 후 실효 R 표시",
    ],
  },
  {
    id: "journal",
    tag: "내 거래",
    title: "결정과 결과를 잇습니다",
    body: "진입 시 평가가 영구 보존됩니다. 청산 후 실제 R과 실수 태그를 입력하면 AI가 결정 과정과 실행을 평가해 한국어 코칭 코멘트를 자동 생성합니다.",
    bullets: [
      "진입 평가 + 청산 결과 한 화면에 결합",
      "실수 태그(추격·과도한 사이즈 등) 자동 집계",
      "AI 한국어 복기 코멘트 자동 생성",
    ],
  },
  {
    id: "dashboard",
    tag: "성과 분석",
    title: "패턴을 발견합니다",
    body: "등급별 평균 R, 실수 태그별 누적 손익, 월별 누적 R 그래프. 감정적 회고가 아닌 객관 데이터로 매매 패턴을 학습합니다.",
    bullets: [
      "등급(A/B/C/D)별 승률·평균 R 비교",
      "실수 태그별 누적 손익 랭킹",
      "월별 R 추이 + 드로다운 추적",
    ],
  },
];

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

function FeaturePreview({ kind }: { kind: FeatureItem["id"] }) {
  if (kind === "analyze") {
    return (
      <PreviewCard caption="분석 결과 — 시나리오 카드">
        <div className="space-y-2">
          {[
            { letter: "A", dir: "롱", trigger: "78,500 sweep 후 1H 종가 회복", rr: "2.4R" },
            { letter: "B", dir: "숏", trigger: "79,200 거부 + 거래량 동반 하락", rr: "2.1R" },
            { letter: "C", dir: "관망", trigger: "박스 중간 · 트리거 없음", rr: "—" },
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
      <PreviewCard caption="주문 검토 — 등급 결과">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-rose-400/40 bg-gradient-to-br from-rose-500/25 to-rose-700/10 text-2xl font-black text-rose-300 shadow-[0_0_24px_rgba(244,63,94,0.4)]">
            D
          </div>
          <div>
            <div className="text-sm font-semibold">매매 금지</div>
            <div className="font-mono text-[11px] text-white/40">최종 점수 0점</div>
          </div>
        </div>
        <div className="mt-5 space-y-1 text-[11px]">
          <ScoreLine label="손절 기준 구조적 타당" value="+2" tone="good" />
          <ScoreLine label="BTC 정렬" value="+1" tone="good" />
          <ScoreLine label="계획 진입 구간 벗어남" value="−2" tone="bad" />
          <ScoreLine label="미확정 캔들에서 진입" value="−1" tone="bad" />
        </div>
      </PreviewCard>
    );
  }
  if (kind === "journal") {
    return (
      <PreviewCard caption="AI 복기 코멘트">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 space-y-3">
            <p className="text-xs leading-relaxed text-white/75">
              진입 시 B등급(점수 6)으로 합리적이었습니다. 목표 도달 80% 지점에서 익절은 좋은 결정입니다.
            </p>
            <p className="text-xs leading-relaxed text-white/75">
              다음에는 트리거 캔들 종가 확정 후 진입을 엄격히 적용하시면 평균 R이 한 단계 올라갈 것입니다.
            </p>
          </div>
        </div>
      </PreviewCard>
    );
  }
  return (
    <PreviewCard caption="등급별 평균 R">
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
            <div className="mt-1 text-[10px] text-white/30">{r.n}건</div>
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

const WHY = [
  {
    title: "분석이 아니라 결정",
    body: "TradingView는 차트를 보여줍니다. Alpha Gate는 그 차트에서 진입할지 말지를 점수로 답합니다.",
    icon: Layers,
  },
  {
    title: "객관 데이터 기반",
    body: "LLM에 직접 가격을 묻지 않습니다. Binance 실데이터를 가져온 다음 해석만 AI에 맡깁니다.",
    icon: Database,
  },
  {
    title: "자동 등급과 복기",
    body: "저널 앱은 기록만 합니다. Alpha Gate는 진입 등급과 청산 후 코칭 코멘트까지 자동 생성합니다.",
    icon: ShieldCheck,
  },
] as const;

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
