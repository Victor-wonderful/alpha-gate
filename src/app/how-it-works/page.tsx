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
import { Eyebrow } from "@/components/marketing/eyebrow";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "작동 방식 · Alpha Gate",
  description:
    "Alpha Gate가 어떻게 진입 결정을 검증하는지 — AI 분석 → 주문 검토 → 내 거래 → 성과 분석의 4단계 사이클.",
};

export default function HowItWorksPage() {
  return (
    <main className="flex min-h-screen flex-col bg-black text-white">
      <MarketingHeader />

      {/* Hero */}
      <section className="relative isolate overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_30%,rgba(56,189,248,0.15),transparent_70%)]" />
        <div className="relative mx-auto max-w-5xl px-6 py-32 text-center sm:px-10">
          <Eyebrow>How It Works</Eyebrow>
          <h1 className="mt-6 text-5xl font-bold leading-[1.1] sm:text-6xl lg:text-7xl">
            결정을
            <br />
            <span className="text-primary">시스템화</span>하는 4단계
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-white/60">
            매번 같은 흐름으로 거래하면 감정이 끼어들 자리가 없습니다. Alpha Gate는 4단계 사이클로 진입부터
            복기까지 자동화합니다.
          </p>
        </div>
      </section>

      {/* 4-step detailed cards */}
      <section className="border-b border-white/10 bg-black py-32">
        <div className="mx-auto max-w-6xl space-y-6 px-6 sm:px-10">
          {STEPS.map((s, i) => (
            <div
              key={s.title}
              className="relative grid gap-8 rounded-2xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur-sm lg:grid-cols-[200px_1fr] lg:gap-12 lg:p-10"
            >
              <div>
                <div className="font-mono text-7xl font-bold text-primary/30">0{i + 1}</div>
                <div className="mt-4 flex items-center gap-3">
                  <s.icon className="h-5 w-5 text-primary" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                    Step {i + 1}
                  </span>
                </div>
              </div>
              <div>
                <h2 className="text-3xl font-bold leading-[1.15] sm:text-4xl">{s.title}</h2>
                <p className="mt-5 text-base leading-relaxed text-white/70">{s.body}</p>
                <ul className="mt-6 space-y-2.5">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm text-white/70">
                      <span className="mt-2 inline-block h-1 w-1 flex-none rounded-full bg-primary" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* AI Pipeline deep dive */}
      <section className="relative overflow-hidden border-b border-white/10 bg-gradient-to-b from-black via-zinc-950 to-black py-32">
        <div className="relative mx-auto max-w-6xl px-6 sm:px-10">
          <div className="text-center">
            <Eyebrow>AI Pipeline</Eyebrow>
            <h2 className="mt-6 text-4xl font-bold leading-[1.15] sm:text-5xl">
              3단계 AI 파이프라인
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base text-white/60">
              AI가 가격을 창작하지 않습니다. 객관 데이터를 받아 해석만 합니다.
            </p>
          </div>

          <div className="mt-20 grid gap-3 md:grid-cols-3">
            {PIPELINE.map((p, i) => (
              <div
                key={p.title}
                className={cn(
                  "relative overflow-hidden rounded-2xl border bg-white/[0.02] p-8 backdrop-blur-sm",
                  i === 1 ? "border-primary/40 shadow-2xl shadow-primary/10" : "border-white/10",
                )}
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  Stage {i + 1}
                </div>
                <h3 className="mt-3 text-xl font-bold">{p.title}</h3>
                <div className="mt-1 text-xs text-white/40">{p.kind}</div>
                <p className="mt-5 text-sm leading-relaxed text-white/60">{p.body}</p>
                <div className="mt-6 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/60">
                  <p.icon className="h-3 w-3" />
                  {p.tag}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data sources */}
      <section className="border-b border-white/10 bg-black py-32">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <div className="max-w-3xl">
            <Eyebrow>데이터</Eyebrow>
            <h2 className="mt-6 text-4xl font-bold leading-[1.15] sm:text-5xl">
              12+ 실시간 데이터 소스
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/60">
              차트만 보는 게 아닙니다. Binance, CoinGecko, Yahoo Finance, alternative.me에서 객관 데이터를 동시
              수집해 종합 판단합니다.
            </p>
          </div>

          <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {DATA_SOURCES.map((d) => (
              <div
                key={d.title}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  {d.category}
                </div>
                <h3 className="mt-3 text-base font-bold">{d.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-white/60">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="border-b border-white/10 bg-zinc-950 py-32">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
            <div>
              <Eyebrow>보안 · 신뢰</Eyebrow>
              <h2 className="mt-6 text-4xl font-bold leading-[1.15] sm:text-5xl">
                내 데이터는
                <br />내 것
              </h2>
            </div>
            <div className="space-y-4">
              <SecurityItem
                icon={<Lock className="h-5 w-5" />}
                title="Row-Level Security"
                body="PostgreSQL 차원에서 사용자별 행 접근을 강제합니다. 다른 사용자의 데이터는 코드 버그가 있어도 접근할 수 없습니다."
              />
              <SecurityItem
                icon={<ShieldCheck className="h-5 w-5" />}
                title="객관 데이터 우선"
                body="LLM에 직접 가격을 묻지 않습니다. Binance 공개 API에서 실데이터를 가져온 뒤 해석만 LLM이 합니다. 가격 hallucination 불가."
              />
              <SecurityItem
                icon={<Database className="h-5 w-5" />}
                title="투명한 저장 구조"
                body="모든 분석 스냅샷과 거래 결과는 Supabase에 본인 계정으로만 저장. 언제든 삭제 가능."
              />
            </div>
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
            이제 직접 경험하세요
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
              href="/features"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
            >
              기능 보기
            </Link>
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
    body: "심볼과 트레이딩 스타일만 입력하면 끝. AI가 객관 데이터로 시장 구조를 읽고 1~3개의 시나리오를 제시합니다.",
    bullets: [
      "Binance 실시간 데이터 (캔들·호가·체결·펀딩비·OI) + ATR·VWAP·BTC 도미넌스·DXY·Fear & Greed 종합",
      "Strategy Agent가 5개 전략 중 1개 선택 (눌림/돌파/박스/반전/대기)",
      "각 시나리오마다 진입가·손절·목표·트리거 조건·무효화 기준 도출",
      "트레이딩 스타일별 손절/목표 표준 강제 적용",
    ],
  },
  {
    title: "주문 검토",
    icon: ShieldCheck,
    body: "AI 분석에서 받은 시나리오를 거래소처럼 입력. A/B/C/D 등급으로 진입 가능 여부를 즉시 판정.",
    bullets: [
      "추격 진입·미확정 캔들·BTC 방향 충돌·박스권 중간 진입 자동 감지",
      "리스크 % 기반 자동 사이징 + 권장 레버리지 계산",
      "수수료 0.12% 차감한 실효 손익비 표시",
      "D등급은 진입 금지, A등급은 그대로 진입, B/C는 주의 권고",
    ],
  },
  {
    title: "내 거래",
    icon: BarChart3,
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
  {
    category: "가격",
    title: "멀티 TF 캔들",
    body: "3개 타임프레임 동시 (HTF 편향 / MTF 셋업 / LTF 트리거)",
  },
  {
    category: "구조",
    title: "스윙·FVG·Order Block",
    body: "고점·저점, 미체결 갭, 강한 반전 캔들 자동 감지",
  },
  {
    category: "수급",
    title: "호가창 (Order Book)",
    body: "100호가 + 매수/매도 벽 + 임밸런스",
  },
  {
    category: "수급",
    title: "체결 흐름 (aggTrades)",
    body: "최근 500건 시장가 체결, 매수 vs 매도 비율, 대량 거래",
  },
  {
    category: "포지셔닝",
    title: "펀딩비 + 24h 추이",
    body: "현재 펀딩률 + 최근 3건 + 추이 (rising/falling/flat)",
  },
  {
    category: "포지셔닝",
    title: "Open Interest + 변화",
    body: "현재 OI + 1시간/4시간 전 대비 변화율",
  },
  {
    category: "변동성",
    title: "ATR · VWAP",
    body: "변동성 지표 + 세션 거래량 가중 평균가",
  },
  {
    category: "Top Trader",
    title: "상위 트레이더 롱/숏 비율",
    body: "큰손 포지셔닝 (정보 비대칭 보정)",
  },
  {
    category: "거시",
    title: "Spot-Perp Basis",
    body: "현물-선물 괴리 → squeeze 신호",
  },
  {
    category: "거시",
    title: "BTC 도미넌스 · DXY",
    body: "BTC 시총 비중 + 달러 인덱스 (역상관)",
  },
  {
    category: "심리",
    title: "Fear & Greed Index",
    body: "시장 심리 종합 (극단치는 역방향 신호)",
  },
  {
    category: "시간",
    title: "거래 세션 (Asia/EU/US)",
    body: "변동성 시간대 컨텍스트",
  },
];

function SecurityItem({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-sm">
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
        {icon}
      </div>
      <div>
        <h3 className="text-base font-bold">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-white/60">{body}</p>
      </div>
    </div>
  );
}
