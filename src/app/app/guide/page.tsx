import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Coins,
  Gamepad2,
  LineChart as LineChartIcon,
  Plus,
  Sparkles,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "사용 방법",
};

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-14 px-1 py-4">
      <div>
        <Link
          href="/app"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          홈으로
        </Link>
      </div>

      {/* Intro */}
      <section className="space-y-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">getting started</div>
        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight">Alpha Gate 사용 방법</h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          "무엇을 살까"가 아니라 <span className="font-medium text-foreground">"이 거래를 해도 되는가"</span>에
          답하는 도구입니다. AI 분석부터 복기까지 4단계 사이클로 진행됩니다.
        </p>
      </section>

      {/* 4단계 사이클 — 가로 다이어그램 */}
      <section className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          4단계 사이클
        </div>
        <div className="grid divide-y divide-border/60 rounded-xl border border-border/60 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <CycleStep
            n="01"
            Icon={Sparkles}
            color="text-primary"
            bg="bg-primary/10"
            title="AI 분석"
            sub="시장 구조 · 시나리오"
          />
          <CycleStep
            n="02"
            Icon={CheckCircle2}
            color="text-grade-a"
            bg="bg-grade-a/10"
            title="주문 검토"
            sub="등급 · 사이즈"
          />
          <CycleStep
            n="03"
            Icon={Wallet}
            color="text-grade-b"
            bg="bg-grade-b/10"
            title="진입"
            sub="시장가 · 지정가"
          />
          <CycleStep
            n="04"
            Icon={LineChartIcon}
            color="text-grade-c"
            bg="bg-grade-c/10"
            title="복기"
            sub="통계 · 랭킹"
          />
        </div>
      </section>

      {/* 기능별 가이드 — 4 카드 */}
      <section className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          기능별 가이드
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <GuideCard
            href="/app/guide/analyze"
            Icon={Sparkles}
            iconColor="text-primary"
            title="AI 분석 사용법"
            desc="언제 분석하면 좋은지, 결과를 어떻게 읽어야 하는지. 스타일·세션별 가이드."
          />
          <GuideCard
            href="/app/guide/trading"
            Icon={Wallet}
            iconColor="text-grade-b"
            title="가상 트레이딩 사용법"
            desc="시장가/지정가 주문 차이, 5분 자동 정산, 미실현 PnL 읽는 법."
          />
          <GuideCard
            href="/app/guide/game"
            Icon={Gamepad2}
            iconColor="text-grade-c"
            title="가격 예측 게임 사용법"
            desc="베팅 페이즈, 다음 캔들 시가→종가 판정, 배당과 정산."
          />
          <GuideCard
            href="/app/guide/results"
            Icon={LineChartIcon}
            iconColor="text-grade-a"
            title="내 결과 · 복기 사용법"
            desc="등급/방향별 breakdown, Equity Curve, 랭킹 시스템 해석."
          />
        </div>
      </section>

      {/* 화폐 시스템 */}
      <section className="space-y-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">화폐 시스템</div>
        <h2 className="text-2xl font-bold leading-[1.15] tracking-tight">vUSDT, AAG, AI 크레딧</h2>
        <div className="grid gap-6 pt-2 lg:grid-cols-3">
          <CurrencyCard
            Icon={Coins}
            iconColor="text-primary"
            title="vUSDT"
            body={
              <>
                플랫폼 내 가상 화폐. 가상 트레이딩과 게임에 사용합니다. 신규 가입 시{" "}
                <span className="font-mono font-medium tabular-nums text-foreground">10,000</span> 자동 지급.
              </>
            }
          />
          <CurrencyCard
            Icon={Coins}
            iconColor="text-primary"
            title="AAG"
            body={
              <>
                실제 결제 통화. 환율{" "}
                <span className="font-mono font-medium tabular-nums text-foreground">
                  1 AAG = 1 USDT = 1,000 vUSDT
                </span>
                . 충전 시 보너스를 받습니다.
              </>
            }
          />
          <CurrencyCard
            Icon={Sparkles}
            iconColor="text-amber-400"
            title="AI 크레딧"
            body={
              <>
                AI 분석 1회 = 크레딧 1개. 신규 가입 시{" "}
                <span className="font-medium text-foreground">5회 무료</span> 보너스. 소진 시 vUSDT로 패키지 구매.
              </>
            }
          />
        </div>
      </section>

      {/* 공통 FAQ */}
      <section className="space-y-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">FAQ</div>
        <h2 className="text-2xl font-bold leading-[1.15] tracking-tight">자주 묻는 질문</h2>
        <div className="mt-4 divide-y divide-border/60 border-y border-border/60">
          <Faq question="자동 정산은 언제 되나요?">
            5분마다 자동. 손절·목표가 적중하면 거래 종결 + 실현 R 계산 + 알림(Telegram/Discord) 발송. 즉시 확인하려면 내 거래 페이지의 "지금 자동 정산" 버튼.
          </Faq>
          <Faq question="실거래(Binance 등)도 가능한가요?">
            코드는 완성됐지만 현재 보류 중입니다. Binance의 IP 제한 정책과 Vercel 서버리스의 고정 IP 부재가 충돌하기 때문입니다. 프록시 인프라 도입 시 활성화 예정.
          </Faq>
          <Faq question="신규 가입 시 받는 자산이 뭔가요?">
            vUSDT 10,000과 AI 크레딧 5회. 가상 트레이딩과 분석을 즉시 시작할 수 있는 분량.
          </Faq>
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-transparent to-transparent px-8 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">ready</div>
            <h3 className="mt-2 text-2xl font-bold leading-[1.15]">시작할 준비가 됐어요</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              AI 분석 5회 무료 + vUSDT 10,000으로 첫 사이클을 돌려보세요.
            </p>
          </div>
          <Link
            href="/app/analyze"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            AI 분석 시작
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function CycleStep({
  n,
  Icon,
  color,
  bg,
  title,
  sub,
}: {
  n: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-md", bg, color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold tabular-nums text-muted-foreground/70">STEP {n}</div>
        <div className="truncate text-sm font-semibold">{title}</div>
        <div className="truncate text-[11px] text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}

function GuideCard({
  href,
  Icon,
  iconColor,
  title,
  desc,
}: {
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-card/30 p-5 transition-colors hover:border-border/80 hover:bg-card/60"
    >
      <div className="flex items-center justify-between">
        <Icon className={cn("h-5 w-5", iconColor)} />
        <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
      </div>
      <div>
        <div className="text-base font-semibold">{title}</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
      </div>
    </Link>
  );
}

function CurrencyCard({
  Icon,
  iconColor,
  title,
  body,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Icon className={cn("h-4 w-4", iconColor)} />
        {title}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Faq({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer items-center justify-between py-4">
        <span className="text-sm font-medium">{question}</span>
        <Plus className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-45" />
      </summary>
      <div className="max-w-2xl pb-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </details>
  );
}
