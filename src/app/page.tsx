import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Hero3D } from "@/components/marketing/hero-3d";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-black text-white">
      <MarketingHeader />

      {/* ───── Hero — cinematic typography ───── */}
      <section className="relative isolate min-h-[calc(100vh-4rem)] overflow-hidden">
        {/* Ambient background */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_50%_45%,rgba(192,38,211,0.20),transparent_70%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_15%_85%,rgba(217,70,239,0.10),transparent_70%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_85%_15%,rgba(168,85,247,0.08),transparent_70%)]"
        />
        <HeroDotGrid />

        {/* Central real 3D scene (R3F) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <Hero3D className="h-[640px] w-[640px] max-w-full" />
        </div>

        {/* Cinematic typography arranged around center */}
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1600px] flex-col px-6 sm:px-10">
          {/* Top-left block */}
          <div className="flex-1 pt-4 sm:pt-8">
            <Outlined className="block text-[14vw] sm:text-[10vw] lg:text-[8.5rem] xl:text-[10rem]">
              STOP
            </Outlined>
            <Solid className="-mt-[3vw] block text-[14vw] sm:text-[10vw] lg:text-[8.5rem] xl:text-[10rem]">
              YOUR
            </Solid>
          </div>

          {/* Bottom-right block */}
          <div className="flex flex-1 flex-col items-end justify-end pb-6 text-right sm:pb-10">
            <Solid className="block text-[14vw] sm:text-[10vw] lg:text-[8.5rem] xl:text-[10rem]">
              LOSING
            </Solid>
            <Outlined className="-mt-[3vw] block text-[14vw] sm:text-[10vw] lg:text-[8.5rem] xl:text-[10rem]">
              TRADES
            </Outlined>
          </div>

          {/* Bottom-left tagline + CTA */}
          <div className="absolute bottom-8 left-6 max-w-md sm:bottom-10 sm:left-10">
            <p className="text-xs leading-relaxed text-white/70 sm:text-sm">
              진입 버튼을 누르기 전, AI가 매매를 A·B·C·D 등급으로 검증합니다.
              <br className="hidden sm:inline" />
              추격·미확정 캔들·BTC 충돌·과도한 노출을 자동으로 감지합니다.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_28px_rgba(192,38,211,0.5)] transition-all hover:gap-3 hover:shadow-[0_0_40px_rgba(192,38,211,0.7)]"
              >
                무료로 시작
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/how-it-works"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white/80 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
              >
                작동 방식
              </Link>
            </div>
          </div>

          {/* Bottom-right small meta */}
          <div className="absolute bottom-8 right-6 hidden text-right text-[10px] uppercase tracking-[0.2em] text-white/40 sm:bottom-10 sm:right-10 sm:block">
            <div>매매 등급 · AI 분석 · 자동 복기</div>
            <div className="mt-1 font-mono">v1.0 · 한국어 지원</div>
          </div>
        </div>
      </section>

      {/* ───── Pain ───── */}
      <section className="relative border-t border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-6 py-28 sm:px-10">
          <div className="grid gap-16 lg:grid-cols-[1fr_2fr]">
            <h2 className="text-3xl font-semibold leading-[1.15] sm:text-4xl">
              분석은 잘합니다.
              <br />
              <span className="text-white/40">결정에서 무너집니다.</span>
            </h2>
            <div className="space-y-10 text-base leading-relaxed text-white/70">
              <p>
                차트는 잘 봅니다. 그런데 진입 버튼 앞에서 흔들립니다. FOMO, 추격, 손절 미준수, 사이즈 오버.
                트레이더가 잃는 이유는 분석 부족이 아니라 결정의 일관성이 무너지기 때문입니다.
              </p>
              <div className="grid gap-px overflow-hidden rounded-lg bg-white/[0.06] sm:grid-cols-3">
                <PainRow title="추격 진입" loss="평균 −1.2R" />
                <PainRow title="손절 미준수" loss="평균 −2.5R" />
                <PainRow title="사이즈 오버" loss="최대 −50%" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───── How It Works ───── */}
      <section className="relative border-t border-white/[0.06]">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.06),transparent_70%)] blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-6 py-28 sm:px-10">
          <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
            <div>
              <p className="text-sm text-white/40">작동 방식</p>
              <h2 className="mt-3 text-3xl font-semibold leading-[1.15] sm:text-4xl">
                4단계로
                <br />
                <span className="text-fuchsia-400">결정을 시스템화</span>합니다.
              </h2>
              <Link
                href="/how-it-works"
                className="mt-8 inline-flex items-center gap-1 text-sm font-medium text-white/70 transition-colors hover:text-white"
              >
                자세히 보기 →
              </Link>
            </div>
            <ol className="space-y-10">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  className="grid gap-3 border-t border-white/[0.06] pt-8 sm:grid-cols-[80px_1fr]"
                >
                  <div className="font-mono text-sm text-fuchsia-400/80">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight">{s.title}</h3>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ───── Features ───── */}
      <section className="relative border-t border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-6 py-28 sm:px-10">
          <div className="max-w-2xl">
            <p className="text-sm text-white/40">기능</p>
            <h2 className="mt-3 text-3xl font-semibold leading-[1.15] sm:text-4xl">
              차트가 아니라 결정을 다룹니다.
            </h2>
          </div>

          <div className="mt-20 space-y-28">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={cn(
                  "grid gap-12 lg:grid-cols-2 lg:items-center",
                  i % 2 === 1 && "lg:[&>*:first-child]:order-2",
                )}
              >
                <div>
                  <p className="text-sm text-fuchsia-400/80">{f.tag}</p>
                  <h3 className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl">
                    {f.title}
                  </h3>
                  <p className="mt-5 text-base leading-relaxed text-white/60">{f.body}</p>
                </div>
                <FeaturePreview kind={f.id} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── Why ───── */}
      <section className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-6 py-28 sm:px-10">
          <h2 className="max-w-2xl text-3xl font-semibold leading-[1.15] sm:text-4xl">
            데이터로 결정합니다.
            <br />
            <span className="text-white/40">감이 아니라.</span>
          </h2>
          <div className="mt-16 grid gap-12 md:grid-cols-3">
            <WhyItem
              title="분석이 아니라 결정"
              body="TradingView는 차트를 보여줍니다. Alpha Gate는 그 차트에서 진입할지 말지를 점수로 답합니다."
            />
            <WhyItem
              title="객관 데이터 기반"
              body="LLM에 직접 가격을 묻지 않습니다. Binance 실데이터를 가져온 다음 해석만 AI에 맡깁니다."
            />
            <WhyItem
              title="자동 등급과 복기"
              body="저널 앱은 기록만 합니다. Alpha Gate는 진입 등급과 청산 후 코칭 코멘트까지 자동 생성합니다."
            />
          </div>
        </div>
      </section>

      {/* ───── CTA ───── */}
      <section className="relative border-t border-white/[0.06]">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(192,38,211,0.18),transparent_70%)] blur-3xl"
        />
        <div className="relative mx-auto max-w-3xl px-6 py-32 text-center sm:px-10">
          <h2 className="text-3xl font-semibold leading-[1.15] sm:text-5xl">
            다음 거래 전,
            <br />
            <span className="bg-gradient-to-r from-fuchsia-300 to-purple-400 bg-clip-text text-transparent">
              5분이면 충분합니다.
            </span>
          </h2>
          <p className="mx-auto mt-6 max-w-md text-base text-white/60">
            한 번의 D급 거래가 한 달 수익을 지웁니다.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-all hover:gap-3 hover:bg-white/90"
            >
              무료로 시작
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white/80 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
            >
              가격 보기
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}

/* ───── Hero — cinematic typography helpers ───── */

function Outlined({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "font-black uppercase leading-[0.85] tracking-[-0.04em] text-transparent",
        "[-webkit-text-stroke:1.5px_rgba(255,255,255,0.45)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Solid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "font-black uppercase leading-[0.85] tracking-[-0.04em] text-white",
        className,
      )}
    >
      {children}
    </span>
  );
}

function HeroDotGrid() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 opacity-[0.15]"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
        maskImage:
          "radial-gradient(ellipse 80% 60% at 50% 50%, black 30%, transparent 70%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 80% 60% at 50% 50%, black 30%, transparent 70%)",
      }}
    />
  );
}

function PainRow({ title, loss }: { title: string; loss: string }) {
  return (
    <div className="bg-black p-6">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-2 font-mono text-xs text-white/40">{loss}</p>
    </div>
  );
}

function WhyItem({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-white/60">{body}</p>
    </div>
  );
}

const STEPS = [
  {
    title: "AI 분석",
    body: "Binance 실시간 데이터로 시장 구조·수급·심리를 분석합니다. 시나리오 1~3개와 무효화 조건을 제시합니다.",
  },
  {
    title: "주문 검토",
    body: "진입가·손절·목표를 입력하면 A·B·C·D 등급으로 답합니다. 추격·미확정 캔들·BTC 충돌을 자동 감지합니다.",
  },
  {
    title: "내 거래",
    body: "진입한 거래를 기록하고 청산 결과를 입력합니다. 결과 입력 후 AI가 한국어 복기 코멘트를 생성합니다.",
  },
  {
    title: "성과 분석",
    body: "등급별 평균 R·승률·실수 태그 통계로 매매 패턴을 객관적으로 파악합니다.",
  },
];

interface FeatureItem {
  id: "analyze" | "trade" | "journal" | "dashboard";
  tag: string;
  title: string;
  body: string;
}

const FEATURES: FeatureItem[] = [
  {
    id: "analyze",
    tag: "AI 분석",
    title: "객관 데이터를 해석합니다",
    body: "Binance 공개 API에서 12개 이상의 데이터를 종합해 1~3개의 시나리오를 제시합니다. AI가 가격을 만들어내지 않습니다.",
  },
  {
    id: "trade",
    tag: "주문 검토",
    title: "거래소처럼 입력합니다",
    body: "진입가·손절·목표·계좌·리스크·레버리지를 거래소 주문 화면처럼 입력합니다. 손익비, 시장 구조, 트리거 검증을 종합해 A·B·C·D 등급과 행동 권고를 제시합니다.",
  },
  {
    id: "journal",
    tag: "내 거래",
    title: "결정과 결과를 잇습니다",
    body: "진입 시 평가가 영구 보존됩니다. 청산 후 실제 R과 실수 태그를 입력하면 AI가 결정 과정과 실행을 평가해 한국어 코칭 코멘트를 자동 생성합니다.",
  },
  {
    id: "dashboard",
    tag: "성과 분석",
    title: "패턴을 발견합니다",
    body: "등급별 평균 R, 실수 태그별 누적 손익, 월별 누적 R 그래프. 감정적 회고가 아닌 객관 데이터로 매매 패턴을 학습합니다.",
  },
];

function FeaturePreview({ kind }: { kind: FeatureItem["id"] }) {
  if (kind === "analyze") {
    return (
      <PreviewCard caption="분석 결과 — 시나리오 카드">
        <div className="space-y-2">
          {[
            { letter: "A", dir: "롱", trigger: "78,500 sweep 후 1H 종가 회복", rr: "2.4R" },
            { letter: "B", dir: "숏", trigger: "79,200 거부 + 거래량 동반 하락", rr: "2.1R" },
          ].map((s) => (
            <div
              key={s.letter}
              className="flex items-center gap-3 border-b border-white/[0.04] py-2.5 text-xs last:border-b-0"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded font-mono font-semibold text-fuchsia-300">
                {s.letter}
              </span>
              <span className="w-8 text-white/40">{s.dir}</span>
              <span className="flex-1 text-white/70">{s.trigger}</span>
              <span className="font-mono font-medium">{s.rr}</span>
            </div>
          ))}
        </div>
      </PreviewCard>
    );
  }
  if (kind === "trade") {
    return (
      <PreviewCard caption="주문 검토 — 등급 결과">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-grade-d text-lg font-bold">
              D
            </div>
            <div>
              <div className="text-sm font-semibold">매매 금지</div>
              <div className="text-[11px] text-white/40">점수 0점</div>
            </div>
          </div>
          <div className="space-y-1 text-[11px]">
            <ScoreLine label="손절 기준 구조적 타당" value="+2" tone="good" />
            <ScoreLine label="계획 진입 구간 벗어남" value="−2" tone="bad" />
            <ScoreLine label="미확정 캔들에서 진입" value="−1" tone="bad" />
          </div>
        </div>
      </PreviewCard>
    );
  }
  if (kind === "journal") {
    return (
      <PreviewCard caption="AI 복기 코멘트">
        <p className="text-xs leading-relaxed text-white/70">
          진입 시 B등급(점수 6)으로 합리적이었습니다. 목표 도달 80% 지점에서 익절은 좋은 결정입니다.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-white/70">
          다음에는 트리거 캔들 종가 확정 후 진입을 엄격히 적용하시면 평균 R이 한 단계 올라갈 것입니다.
        </p>
      </PreviewCard>
    );
  }
  return (
    <PreviewCard caption="등급별 평균 R">
      <div className="grid grid-cols-4 gap-2">
        {[
          { g: "A", avg: 1.4, n: 12, tone: "good" as const },
          { g: "B", avg: 0.6, n: 28, tone: "good" as const },
          { g: "C", avg: -0.4, n: 15, tone: "bad" as const },
          { g: "D", avg: -1.8, n: 5, tone: "bad" as const },
        ].map((r) => (
          <div key={r.g} className="border-l border-white/[0.06] pl-3 first:border-l-0">
            <div className="font-mono text-xs text-white/40">{r.g}</div>
            <div
              className={cn(
                "mt-1 font-mono text-lg font-semibold tabular-nums",
                r.tone === "good" ? "text-white" : "text-white/50",
              )}
            >
              {r.avg >= 0 ? "+" : ""}
              {r.avg}R
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
        className="pointer-events-none absolute -inset-8 rounded-3xl bg-[radial-gradient(circle_at_50%_50%,rgba(192,38,211,0.08),transparent_70%)] blur-2xl"
      />
      <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0710]">
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-2 text-[10px] uppercase tracking-wider text-fuchsia-300/70">
          {caption}
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
    <div className="flex items-center justify-between border-b border-white/[0.04] py-1.5">
      <span className="text-white/60">{label}</span>
      <span
        className={cn("font-mono font-semibold", tone === "good" ? "text-grade-a" : "text-grade-d")}
      >
        {value}
      </span>
    </div>
  );
}
