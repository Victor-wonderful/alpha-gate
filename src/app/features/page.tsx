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

export const metadata = {
  title: "기능 · Alpha Gate",
  description:
    "AI 분석 / 주문 검토 / 내 거래 + AI 복기 / 성과 분석 — Alpha Gate의 4가지 핵심 기능을 자세히 살펴보세요.",
};

export default function FeaturesPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[#02060f] text-white">
      <MarketingHeader />

      {/* Hero */}
      <SectionShell glowPosition="top" className="border-t-0">
        <SectionHeader
          eyebrow="Features"
          title={
            <>
              차트가 아닌{" "}
              <GradientText>결정</GradientText>
              <br />
              을 다룹니다
            </>
          }
          body="4가지 핵심 기능. 진입 전 분석부터 청산 후 복기까지 한 플랫폼에서."
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
              <FeatureMockup feature={f.id} />
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
                지금 시작
              </div>
              <h2 className="mt-5 text-4xl font-bold leading-[1.15] sm:text-5xl">
                지금 <GradientText>사용해보세요</GradientText>
              </h2>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/login?mode=signup"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-sky-400 to-cyan-500 px-7 py-3.5 text-sm font-semibold text-[#02060f] shadow-[0_0_32px_rgba(56,189,248,0.55)] transition-all hover:gap-3 hover:shadow-[0_0_44px_rgba(56,189,248,0.75)]"
                >
                  무료 회원가입
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white/80 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
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

interface FeatureItem {
  id: "analyze" | "trade" | "journal" | "dashboard";
  tag: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  body: string;
  bullets: string[];
}

const FEATURES: FeatureItem[] = [
  {
    id: "analyze",
    tag: "AI 분석",
    title: "객관 데이터로 시장을 읽습니다",
    icon: Brain,
    body: "심볼과 스타일만 입력하면 Binance 공개 API에서 12+ 데이터를 자동 수집해 1~3개 시나리오를 제시합니다. AI가 가격을 창작하지 않습니다 — 실데이터만 해석.",
    bullets: [
      "3-stage 파이프라인: 데이터 수집(코드) → 전략 분류(LLM) → 시나리오 생성(LLM)",
      "스타일별 손절/목표 표준 강제 (스캘핑 / 데이 / 스윙 / 포지션)",
      "각 시나리오마다 진입가·손절·목표·트리거 조건 자동 도출",
      "차트 시각화 + HTF/MTF/LTF 토글 + PNG 다운로드",
      "분석 기록 자동 영구 저장 + 필터 + 페이지네이션",
    ],
  },
  {
    id: "trade",
    tag: "주문 검토",
    title: "거래소처럼 입력, 등급으로 답합니다",
    icon: ShieldCheck,
    body: "AI 시나리오를 받아 진입가·손절·목표·계좌·리스크·레버리지를 거래소 주문 화면처럼 입력. A/B/C/D 등급과 행동 권고가 즉시 나옵니다.",
    bullets: [
      "추격 진입·미확정 캔들·BTC 방향 충돌·박스권 중간 자동 감지",
      "리스크 % 기반 자동 사이징 + 권장 레버리지 계산",
      "수수료 0.12% 차감한 실효 손익비 표시",
      "마진 초과 시 권장 레버리지 자동 제안 + 1클릭 적용",
      "큰 롱/숏 버튼 + 가격에 자동 % 표시 + 사이즈 칩 (25/50/Max)",
    ],
  },
  {
    id: "journal",
    tag: "내 거래 · AI 복기",
    title: "결과와 결정을 연결합니다",
    icon: BookOpen,
    body: "진입 시 등급·점수·시장 체크 결과가 영구 보존. 청산 후 실제 R을 입력하면 AI가 결정과 실행을 평가해 한국어 코칭 코멘트를 자동 생성합니다.",
    bullets: [
      "진입 시 시장 스냅샷 영구 저장 (그때 상태 재현 가능)",
      "결과 입력: 청산가·실현 R·청산 사유·실수 태그·메모",
      "AI 복기: 결정 평가 + 실행 평가 + 다음 거래 개선점",
      "Telegram / Discord 알림 연동",
      "거래별 영구 삭제 가능 (안전장치 더블 클릭)",
    ],
  },
  {
    id: "dashboard",
    tag: "성과 분석",
    title: "내가 어디서 잃는가를 보여줍니다",
    icon: LineChartIcon,
    body: "마감된 거래만 자동 집계해서 등급별·실수별·시간별 통계를 시각화. 감정적 회고가 아닌 객관 데이터로 매매 패턴을 학습합니다.",
    bullets: [
      "등급별 평균 R / 승률 / 거래 수 — A급 vs C/D급 비교",
      '실수 태그별 누적 손익 + "가장 자주 잃는 패턴" 자동 강조',
      "월별 누적 R 그래프로 시간 흐름 추적",
      "AI 분석 기록도 통합 — 분석과 결정이 어떻게 연결됐나",
    ],
  },
];

function FeatureMockup({ feature }: { feature: FeatureItem["id"] }) {
  if (feature === "analyze") {
    return (
      <MockupFrame caption="분석 결과 — 시나리오 카드">
        <div className="mb-4 flex items-center gap-2 text-xs">
          <span className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 font-mono font-semibold text-cyan-300">
            4H
          </span>
          <span className="font-mono font-medium text-white">BTCUSDT</span>
          <span className="ml-auto text-white/40">시나리오 2개</span>
        </div>
        <div className="space-y-2">
          <ScenarioRow letter="A" dir="long" trigger="78,500 sweep 후 1H 종가 회복" rr="2.4R" />
          <ScenarioRow letter="B" dir="short" trigger="79,200 거부 + 거래량 동반 하락" rr="2.1R" />
        </div>
        <div className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 text-[11px] text-white/75">
          ⚡ 지금: 진입 보류, A 시나리오 트리거 대기
        </div>
      </MockupFrame>
    );
  }
  if (feature === "trade") {
    return (
      <MockupFrame caption="주문 검토 — 등급 결과">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-rose-400/40 bg-gradient-to-br from-rose-500/25 to-rose-700/10 text-2xl font-black text-rose-300 shadow-[0_0_24px_rgba(244,63,94,0.4)]">
            D
          </div>
          <div className="text-right">
            <div className="text-base font-bold text-rose-300">매매 금지</div>
            <div className="font-mono text-xs text-white/40">점수 0점</div>
          </div>
        </div>
        <div className="space-y-2 text-xs">
          <ScoreRow label="손익비 1.29R로 낮음" pts={0} />
          <ScoreRow label="손절 기준 구조적 타당" pts={+2} />
          <ScoreRow label="계획 진입 구간 벗어남" pts={-2} />
          <ScoreRow label="미확정 캔들에서 진입" pts={-1} />
        </div>
      </MockupFrame>
    );
  }
  if (feature === "journal") {
    return (
      <MockupFrame caption="AI 복기 코멘트">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 space-y-3 text-xs leading-relaxed text-white/75">
            <p>
              진입 시 B등급(점수 6)으로 합리적이었습니다. 다만{" "}
              <strong className="text-white">목표 도달 80% 지점에서 익절</strong>은 좋은 결정입니다.
            </p>
            <p>
              다음에는{" "}
              <strong className="text-white">트리거 캔들 종가 확정 후 진입</strong>을 엄격히 적용하시면 평균 R이 한 단계
              올라갈 것입니다.
            </p>
          </div>
        </div>
      </MockupFrame>
    );
  }
  return (
    <MockupFrame caption="등급별 평균 R">
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
}: {
  letter: string;
  dir: "long" | "short";
  trigger: string;
  rr: string;
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
        {dir === "long" ? "롱" : "숏"}
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
