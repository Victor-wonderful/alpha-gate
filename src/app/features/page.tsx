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
import { Eyebrow } from "@/components/marketing/eyebrow";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "기능 · Alpha Gate",
  description:
    "AI 분석 / 주문 검토 / 내 거래 + AI 복기 / 성과 분석 — Alpha Gate의 4가지 핵심 기능을 자세히 살펴보세요.",
};

export default function FeaturesPage() {
  return (
    <main className="flex min-h-screen flex-col bg-black text-white">
      <MarketingHeader />

      <section className="relative isolate overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_30%,rgba(56,189,248,0.15),transparent_70%)]" />
        <div className="relative mx-auto max-w-5xl px-6 py-32 text-center sm:px-10">
          <Eyebrow>Features</Eyebrow>
          <h1 className="mt-6 text-5xl font-bold leading-[1.1] sm:text-6xl lg:text-7xl">
            차트가 아닌
            <br />
            <span className="text-primary">결정</span>을 다룹니다
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-white/60">
            4가지 핵심 기능. 진입 전 분석부터 청산 후 복기까지 한 플랫폼에서.
          </p>
        </div>
      </section>

      {/* Feature deep dives */}
      <section className="border-b border-white/10 bg-black py-32">
        <div className="mx-auto max-w-6xl space-y-32 px-6 sm:px-10">
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
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  <f.icon className="h-3 w-3" />
                  {f.tag}
                </div>
                <h2 className="mt-6 text-3xl font-bold leading-[1.15] sm:text-4xl">
                  {f.title}
                </h2>
                <p className="mt-5 text-base leading-relaxed text-white/70">{f.body}</p>
                <ul className="mt-8 space-y-3">
                  {f.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-grade-a" />
                      <span className="text-white/80">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <FeatureMockup feature={f.id} />
            </div>
          ))}
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
            지금 사용해보세요
          </h2>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-black transition-all hover:gap-3 hover:bg-white/90"
            >
              무료 회원가입
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
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
      <MockupFrame>
        <div className="mb-4 flex items-center gap-2 text-xs">
          <span className="rounded border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono font-semibold text-primary">
            4H
          </span>
          <span className="font-mono font-medium text-white">BTCUSDT</span>
          <span className="ml-auto text-white/40">시나리오 2개</span>
        </div>
        <div className="space-y-2">
          <ScenarioRow letter="A" dir="long" trigger="78,500 sweep 후 1H 종가 회복" rr="2.4R" />
          <ScenarioRow letter="B" dir="short" trigger="79,200 거부 + 거래량 동반 하락" rr="2.1R" />
        </div>
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-[11px] text-white/70">
          ⚡ 지금: 진입 보류, A 시나리오 트리거 대기
        </div>
      </MockupFrame>
    );
  }
  if (feature === "trade") {
    return (
      <MockupFrame>
        <div className="mb-5 flex items-center justify-between">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-grade-d text-2xl font-bold text-white shadow-[0_0_40px_rgba(239,68,68,0.4)]">
            D
          </div>
          <div className="text-right">
            <div className="text-base font-bold text-grade-d">매매 금지</div>
            <div className="text-xs text-white/40">점수 0점</div>
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
      <MockupFrame>
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-white">AI 복기 코멘트</span>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/40 p-4 text-xs leading-relaxed text-white/70">
          <p>
            진입 시 B등급(점수 6)으로 합리적이었습니다. 다만{" "}
            <strong className="text-white">목표 도달 80% 지점에서 익절</strong>은 좋은 결정입니다.
          </p>
          <p className="mt-3">
            다음에는{" "}
            <strong className="text-white">트리거 캔들 종가 확정 후 진입</strong>을 엄격히 적용하시면 평균 R이 한 단계 올라갈 것입니다.
          </p>
        </div>
      </MockupFrame>
    );
  }
  return (
    <MockupFrame>
      <div className="mb-4 text-sm font-semibold text-white">등급별 평균 R</div>
      <div className="grid grid-cols-4 gap-2">
        {[
          { g: "A", avg: 1.4, n: 12, color: "bg-grade-a" },
          { g: "B", avg: 0.6, n: 28, color: "bg-grade-b" },
          { g: "C", avg: -0.4, n: 15, color: "bg-grade-c" },
          { g: "D", avg: -1.8, n: 5, color: "bg-grade-d" },
        ].map((r) => (
          <div key={r.g} className="rounded-lg border border-white/10 bg-black/40 p-3 text-center">
            <div className={cn("mx-auto h-7 w-7 rounded-md text-xs font-bold leading-7 text-white", r.color)}>
              {r.g}
            </div>
            <div className={cn("mt-2 font-mono text-sm font-bold", r.avg >= 0 ? "text-grade-a" : "text-grade-d")}>
              {r.avg >= 0 ? "+" : ""}
              {r.avg}R
            </div>
            <div className="text-[10px] text-white/40">{r.n}건</div>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}

function MockupFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-px rounded-2xl bg-gradient-to-br from-primary/30 via-transparent to-transparent opacity-50"
      />
      <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 to-black p-6 shadow-2xl shadow-primary/10">
        {children}
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
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs">
      <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/15 font-mono font-bold text-primary">
        {letter}
      </span>
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[10px] font-semibold",
          dir === "long" ? "bg-grade-a/15 text-grade-a" : "bg-grade-d/15 text-grade-d",
        )}
      >
        {dir === "long" ? "롱" : "숏"}
      </span>
      <span className="flex-1 truncate text-white/60">{trigger}</span>
      <span className="font-mono text-white">{rr}</span>
    </div>
  );
}

function ScoreRow({ label, pts }: { label: string; pts: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2">
      <span className="text-white/70">{label}</span>
      <span
        className={cn(
          "font-mono font-bold",
          pts > 0 ? "text-grade-a" : pts < 0 ? "text-grade-d" : "text-white/40",
        )}
      >
        {pts > 0 ? "+" : ""}
        {pts}
      </span>
    </div>
  );
}
