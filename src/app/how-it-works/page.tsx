import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Brain,
  Database,
  Layers,
  LineChart as LineChartIcon,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
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

export const metadata = {
  title: "작동 방식 · Alpha Gate",
  description:
    "Alpha Gate가 어떻게 진입 결정을 검증하는지 — AI 분석 → 거래 실행 → 거래 일지 → 성과 분석의 4단계 사이클.",
};

export default function HowItWorksPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[#02060f] text-white">
      <MarketingHeader />

      {/* Hero */}
      <SectionShell glowPosition="top" className="border-t-0">
        <SectionHeader
          eyebrow="How It Works"
          title={
            <>
              결정을{" "}
              <GradientText>시스템화</GradientText>
              <br />
              하는 4단계
            </>
          }
          body="매번 같은 흐름으로 거래하면 감정이 끼어들 자리가 없습니다. Alpha Gate는 4단계 사이클로 진입부터 복기까지 자동화합니다."
        />
      </SectionShell>

      {/* 4-step detailed cards */}
      <SectionShell glowPosition="top-right">
        <SectionHeader
          eyebrow="4-Step Cycle"
          title={
            <>
              <GradientText>진입 전</GradientText>부터 <GradientText>복기</GradientText>까지
            </>
          }
        />
        <div className="mt-16 space-y-5">
          {STEPS.map((s, i) => (
            <GlowCard key={s.title}>
              <div
                aria-hidden
                className="pointer-events-none absolute -right-4 -top-6 select-none font-mono text-[140px] font-black leading-none tracking-tighter text-cyan-400/[0.07]"
              >
                0{i + 1}
              </div>
              <div className="relative grid gap-8 lg:grid-cols-[200px_1fr] lg:gap-12">
                <div>
                  <IconBadge icon={s.icon} size="lg" />
                  <div className="mt-4 flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-cyan-400">
                      STEP 0{i + 1}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/60">
                      {s.tag}
                    </span>
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-bold leading-[1.15] sm:text-3xl">{s.title}</h2>
                  <p className="mt-4 text-base leading-relaxed text-white/65">{s.body}</p>
                  <ul className="mt-6 space-y-2.5">
                    {s.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2.5 text-sm text-white/70">
                        <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </GlowCard>
          ))}
        </div>
      </SectionShell>

      {/* AI Pipeline deep dive */}
      <SectionShell glowPosition="bottom-left">
        <SectionHeader
          eyebrow="AI Pipeline"
          title={
            <>
              3단계 <GradientText>AI 파이프라인</GradientText>
            </>
          }
          body="AI가 가격을 창작하지 않습니다. 객관 데이터를 받아 해석만 합니다."
        />
        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {PIPELINE.map((p, i) => (
            <GlowCard
              key={p.title}
              className={cn(
                i === 1 &&
                  "border-cyan-400/40 shadow-[0_30px_80px_-20px_rgba(56,189,248,0.45)]",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold text-cyan-400">
                  STAGE {i + 1}
                </span>
                <IconBadge icon={p.icon} size="sm" />
              </div>
              <h3 className="mt-5 text-xl font-bold">{p.title}</h3>
              <div className="mt-1 text-xs text-white/40">{p.kind}</div>
              <p className="mt-5 text-sm leading-relaxed text-white/60">{p.body}</p>
              <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-300/80">
                {p.tag}
              </div>
            </GlowCard>
          ))}
        </div>
      </SectionShell>

      {/* Data sources */}
      <SectionShell glowPosition="right">
        <SectionHeader
          eyebrow="데이터"
          title={
            <>
              <GradientText>12+ 실시간 데이터</GradientText>
              <br />
              소스를 종합
            </>
          }
          body="차트만 보는 게 아닙니다. Binance, CoinGecko, Yahoo Finance, alternative.me에서 객관 데이터를 동시 수집해 종합 판단합니다."
        />
        <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {DATA_SOURCES.map((d) => (
            <GlowCard key={d.title} className="p-6">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400">
                {d.category}
              </div>
              <h3 className="mt-3 text-base font-bold">{d.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-white/60">{d.body}</p>
            </GlowCard>
          ))}
        </div>
      </SectionShell>

      {/* Security */}
      <SectionShell glowPosition="left">
        <SectionHeader
          eyebrow="보안 · 신뢰"
          title={
            <>
              내 데이터는 <GradientText>내 것</GradientText>
            </>
          }
        />
        <div className="mt-16 grid gap-5 md:grid-cols-3">
          <SecurityCard
            icon={Lock}
            title="Row-Level Security"
            body="PostgreSQL 차원에서 사용자별 행 접근을 강제합니다. 다른 사용자의 데이터는 코드 버그가 있어도 접근할 수 없습니다."
          />
          <SecurityCard
            icon={ShieldCheck}
            title="객관 데이터 우선"
            body="LLM에 직접 가격을 묻지 않습니다. Binance 공개 API에서 실데이터를 가져온 뒤 해석만 LLM이 합니다. 가격 hallucination 불가."
          />
          <SecurityCard
            icon={Database}
            title="투명한 저장 구조"
            body="모든 분석 스냅샷과 거래 결과는 Supabase에 본인 계정으로만 저장. 언제든 삭제 가능."
          />
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
                이제 <GradientText>직접 경험</GradientText>하세요
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
                  href="/features"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white/80 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
                >
                  기능 보기
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

const STEPS = [
  {
    title: "AI 분석",
    icon: Brain,
    tag: "진입 전",
    body: "심볼과 트레이딩 스타일만 입력하면 끝. AI가 객관 데이터로 시장 구조를 읽고 1~3개의 시나리오를 제시합니다.",
    bullets: [
      "Binance 실시간 데이터 (캔들·호가·체결·펀딩비·OI) + ATR·VWAP·BTC 도미넌스·DXY·Fear & Greed 종합",
      "Strategy Agent가 5개 전략 중 1개 선택 (눌림/돌파/박스/반전/대기)",
      "각 시나리오마다 진입가·손절·목표·트리거 조건·무효화 기준 도출",
      "트레이딩 스타일별 손절/목표 표준 강제 적용",
    ],
  },
  {
    title: "거래 실행",
    icon: ShieldCheck,
    tag: "진입 전",
    body: "AI 분석에서 받은 시나리오를 거래소처럼 입력. A/B/C/D 등급으로 진입 가능 여부를 즉시 판정.",
    bullets: [
      "추격 진입·미확정 캔들·BTC 방향 충돌·박스권 중간 진입 자동 감지",
      "리스크 % 기반 자동 사이징 + 권장 레버리지 계산",
      "수수료 0.12% 차감한 실효 손익비 표시",
      "D등급은 진입 금지, A등급은 그대로 진입, B/C는 주의 권고",
    ],
  },
  {
    title: "거래 일지",
    icon: BarChart3,
    tag: "진입 후",
    body: "진입한 거래를 저장하고 청산 후 실제 결과를 기록. 진입 시 평가와 실제 결과를 한 화면에서 비교.",
    bullets: [
      "진입 시 시장 스냅샷 영구 저장 (그때 시장 상태 재현 가능)",
      "청산가·실현 R·청산 사유·실수 태그·메모 입력",
      "AI 복기: 결정 평가 + 실행 평가 + 다음 거래 개선점 자동 생성",
      "Telegram / Discord 알림 연동",
    ],
  },
  {
    title: "성과 분석",
    icon: LineChartIcon,
    tag: "진입 후",
    body: "마감된 거래를 등급별·실수별·시간별로 자동 집계. 객관 데이터로 매매 패턴을 파악합니다.",
    bullets: [
      "등급별 평균 R / 승률 / 거래 수 통계",
      "실수 태그별 누적 손익 — 가장 자주 잃는 패턴 자동 강조",
      "월별 누적 R 차트로 시간 흐름에 따른 개선 추적",
      "AI 분석 기록도 통합 — 어떤 분석을 보고 어떻게 했나",
    ],
  },
];

const PIPELINE = [
  {
    title: "데이터 수집",
    kind: "코드 (결정론적)",
    body: "Binance Futures, Spot, CoinGecko, Yahoo Finance, alternative.me 등 12+ 소스에서 병렬 fetch. 스윙·FVG·OB·POC·ATR·VWAP 자동 계산.",
    tag: "Code · Deterministic",
    icon: Database,
  },
  {
    title: "전략 분류",
    kind: "Claude (분류기)",
    body: "수집한 데이터를 LLM에 넘겨 5개 전략 중 1개 선택. 방향(롱/숏)과 신뢰도, 거부된 전략의 이유까지 출력.",
    tag: "LLM · Strategy Agent",
    icon: Layers,
  },
  {
    title: "시나리오 생성",
    kind: "Claude (메인)",
    body: "선택된 전략 범위 안에서만 1~3개 시나리오 생성. 진입가·손절·목표를 객관 데이터 위치에 맞춰 도출.",
    tag: "LLM · Scenario Generator",
    icon: Sparkles,
  },
];

const DATA_SOURCES = [
  { category: "가격", title: "멀티 TF 캔들", body: "3개 타임프레임 동시 (HTF 편향 / MTF 셋업 / LTF 트리거)" },
  { category: "구조", title: "스윙·FVG·Order Block", body: "고점·저점, 미체결 갭, 강한 반전 캔들 자동 감지" },
  { category: "수급", title: "호가창 (Order Book)", body: "100호가 + 매수/매도 벽 + 임밸런스" },
  { category: "수급", title: "체결 흐름 (aggTrades)", body: "최근 500건 시장가 체결, 매수 vs 매도 비율, 대량 거래" },
  { category: "포지셔닝", title: "펀딩비 + 24h 추이", body: "현재 펀딩률 + 최근 3건 + 추이 (rising/falling/flat)" },
  { category: "포지셔닝", title: "Open Interest + 변화", body: "현재 OI + 1시간/4시간 전 대비 변화율" },
  { category: "변동성", title: "ATR · VWAP", body: "변동성 지표 + 세션 거래량 가중 평균가" },
  { category: "Top Trader", title: "상위 트레이더 롱/숏 비율", body: "큰손 포지셔닝 (정보 비대칭 보정)" },
  { category: "거시", title: "Spot-Perp Basis", body: "현물-선물 괴리 → squeeze 신호" },
  { category: "거시", title: "BTC 도미넌스 · DXY", body: "BTC 시총 비중 + 달러 인덱스 (역상관)" },
  { category: "심리", title: "Fear & Greed Index", body: "시장 심리 종합 (극단치는 역방향 신호)" },
  { category: "시간", title: "거래 세션 (Asia/EU/US)", body: "변동성 시간대 컨텍스트" },
];

function SecurityCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <GlowCard>
      <IconBadge icon={Icon} />
      <h3 className="mt-5 text-lg font-bold">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-white/60">{body}</p>
    </GlowCard>
  );
}
