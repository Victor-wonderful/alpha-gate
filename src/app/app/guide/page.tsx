import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Coins,
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
    <div className="mx-auto max-w-[1100px] space-y-16 px-1 py-4">
      {/* 빵부스러기 */}
      <div>
        <Link
          href="/app"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          홈으로
        </Link>
      </div>

      {/* 1. Intro */}
      <section className="space-y-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">getting started</div>
        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight">Alpha Gate 사용 방법</h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          "무엇을 살까"가 아니라 <span className="font-medium text-foreground">"이 거래를 해도 되는가"</span>에 답하는 도구입니다.
          AI 분석부터 복기까지 4단계 사이클로 진행됩니다.
        </p>
      </section>

      {/* 2. 4단계 — 세로 흐름 */}
      <section className="space-y-2">
        <div className="mb-6 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          4단계 사이클
        </div>

        <Step
          step="01"
          Icon={Sparkles}
          accentBorder="border-primary/40"
          accentBg="bg-primary/10"
          accentText="text-primary"
          title="AI 분석"
          body="멀티 타임프레임 캔들, 호가창, 펀딩비, OI 등 시장 데이터를 종합 분석합니다. 8개 트레이딩 전략 중 가장 적합한 것을 자동 선택하고, 시나리오와 무효화 조건을 생성합니다."
          meta={["분석 1회 = AI 크레딧 1개", "20~40초 소요"]}
          isLast={false}
        />
        <Step
          step="02"
          Icon={CheckCircle2}
          accentBorder="border-grade-a/40"
          accentBg="bg-grade-a/10"
          accentText="text-grade-a"
          title="주문 검토"
          body="AI 시나리오를 받아 매매 등급(A~D)을 매기고, 손익비·포지션 사이즈·필요 마진을 자동 계산합니다. 진입가가 현재 시세에서 너무 떨어졌으면 시장가 가드가 추격을 차단합니다."
          meta={[
            { tone: "grade-a", label: "A — 좋은 거래" },
            { tone: "grade-b", label: "B — 조건부" },
            { tone: "grade-c", label: "C — 비추천" },
            { tone: "grade-d", label: "D — 금지" },
          ]}
          isLast={false}
        />
        <Step
          step="03"
          Icon={Wallet}
          accentBorder="border-grade-b/40"
          accentBg="bg-grade-b/10"
          accentText="text-grade-b"
          title="진입"
          body="가상 vUSDT로 시장가 또는 지정가 주문을 실행합니다. 지정가는 5분마다 체결 조건을 확인하고, 시장가는 즉시 체결됩니다. 포지션은 5분마다 자동 정산되며 미실현 손익은 실시간 표시됩니다."
          meta={["시장가 / 지정가", "5분 자동 정산"]}
          isLast={false}
        />
        <Step
          step="04"
          Icon={LineChartIcon}
          accentBorder="border-grade-c/40"
          accentBg="bg-grade-c/10"
          accentText="text-grade-c"
          title="복기"
          body="종료된 거래는 자동으로 통계에 누적됩니다. AI가 매매 패턴을 코칭하고, Equity Curve로 누적 R을 시각화합니다. 성과는 랭킹 시스템에도 자동 반영됩니다."
          meta={["AI 코칭", "등급별/방향별 분석", "주간 랭킹 보상"]}
          isLast
        />
      </section>

      {/* 3. 화폐 시스템 */}
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
                . 충전 시 일정 보너스를 받습니다.
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

      {/* 4. FAQ */}
      <section className="space-y-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">FAQ</div>
        <h2 className="text-2xl font-bold leading-[1.15] tracking-tight">자주 묻는 질문</h2>
        <div className="mt-4 divide-y divide-border/60 border-y border-border/60">
          <Faq question="자동 정산은 언제 되나요?">
            5분마다 자동. 손절·목표가 적중하면 거래 종결 + 실현 R 계산 + 알림(Telegram/Discord) 발송. 즉시 확인하려면 내 거래 페이지의 "지금 자동 정산" 버튼.
          </Faq>
          <Faq question="등급(A~D)은 어떻게 정해지나요?">
            손익비, BTC 정렬, 박스권 회피, 거래량, 심리 체크 등을 점수화합니다. 합산 점수가 ≥8이면 A, 5~7은 B, 2~4는 C, ≤1은 D입니다. 거래 평가 페이지의 "검토 항목"에서 가산·감점 상세 확인.
          </Faq>
          <Faq question="시장가 가드가 뭔가요?">
            시장가가 이미 목표나 손절을 통과한 상태에서 진입을 시도하면 자동 차단합니다. 입력 진입가에서 시세가 손절폭의 50% 이상 떨어진 경우도 추격 위험으로 차단됩니다.
          </Faq>
          <Faq question="지정가 주문은 얼마나 유지되나요?">
            등록 후 24시간. 그 안에 가격이 지정가에 도달하면 자동 체결, 도달하지 않으면 만료됩니다. 내 거래 페이지의 "대기 중 지정가 주문"에서 수동 취소도 가능.
          </Faq>
          <Faq question="실거래(Binance 등)도 가능한가요?">
            코드는 완성됐지만 현재 보류 중입니다. Binance의 IP 제한 정책과 Vercel 서버리스의 고정 IP 부재가 충돌하기 때문입니다. 프록시 인프라 도입 시 활성화 예정.
          </Faq>
        </div>
      </section>

      {/* 5. 시작 CTA */}
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

function Step({
  step,
  Icon,
  accentBorder,
  accentBg,
  accentText,
  title,
  body,
  meta,
  isLast,
}: {
  step: string;
  Icon: React.ComponentType<{ className?: string }>;
  accentBorder: string;
  accentBg: string;
  accentText: string;
  title: string;
  body: string;
  meta: Array<string | { tone: "grade-a" | "grade-b" | "grade-c" | "grade-d"; label: string }>;
  isLast: boolean;
}) {
  return (
    <div className={cn("relative pl-14", !isLast && "pb-12")}>
      {/* connector line — drawn from icon center down to next step */}
      {!isLast ? (
        <span
          aria-hidden
          className="absolute left-5 top-10 bottom-0 w-px"
          style={{
            background: "linear-gradient(to bottom, rgba(34,211,238,0.4), transparent)",
          }}
        />
      ) : null}
      <div
        className={cn(
          "absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full border",
          accentBorder,
          accentBg,
          accentText,
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="mb-1 text-[10px] font-bold tracking-wider text-muted-foreground/70 tabular-nums">
        STEP {step}
      </div>
      <h2 className="mb-2 text-xl font-bold">{title}</h2>
      <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        {meta.map((m, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            {typeof m === "string" ? (
              m
            ) : (
              <>
                <span className={`font-mono font-semibold text-${m.tone}`}>{m.label.split(" — ")[0]}</span>
                <span>— {m.label.split(" — ")[1]}</span>
              </>
            )}
            {i < meta.length - 1 ? <span className="text-muted-foreground/40">·</span> : null}
          </span>
        ))}
      </div>
    </div>
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
