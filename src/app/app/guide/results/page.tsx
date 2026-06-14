import { GuideSubpageLayout, GuideSection, GuideFaq } from "@/components/guide/guide-layout";
import { Lightbulb } from "lucide-react";

export const metadata = { title: "내 결과 · 복기 사용법" };

export default function GuideResultsPage() {
  return (
    <GuideSubpageLayout
      category="내 결과"
      title="내 결과 · 복기 사용법"
      description="진입한 모든 거래는 자동으로 누적됩니다. 통계를 어떻게 읽고 패턴을 어떻게 찾는지 정리합니다."
      next={{ href: "/app/guide", label: "← 사용 방법 목록으로" }}
    >
      {/* 3개 탭 */}
      <GuideSection eyebrow="01" title="3개 탭 구성">
        <div className="grid gap-3 lg:grid-cols-3">
          <TabCard
            title="거래 일지"
            desc="진행 중 / 대기 중 지정가 / 종료된 거래 목록. KPI 4개(오늘 R, 진행 중, 미실현, 노출)."
          />
          <TabCard
            title="성과 분석"
            desc="Hero KPI 4개(누적 R, 승률, Profit Factor, 연속) + Equity Curve + 등급별/방향별/청산 사유별 breakdown."
          />
          <TabCard
            title="랭킹"
            desc="게임 / 트레이딩 / 통합 카테고리 × 일간 / 주간 / 월간 / 전체 기간. 매주 월요일 00:00 KST 보상."
          />
        </div>
      </GuideSection>

      {/* 핵심 지표 */}
      <GuideSection eyebrow="02" title="핵심 지표 읽는 법">
        <div className="space-y-3">
          <Metric
            name="누적 R"
            body="모든 종료 거래의 실현 R 합계. +로 누적되면 우위 있음. 거래 횟수가 적으면 분산이 큼 (30건 이상 권장)."
          />
          <Metric
            name="승률"
            body="이긴 거래 비율. 단독 지표로 부족 — 높은 승률 + 작은 R도 손해. Profit Factor와 같이 봐야 합니다."
          />
          <Metric
            name="Profit Factor"
            body="총 이익 ÷ 총 손실. ≥1.5 이상이 안정적. 1.0 미만은 장기 손실. 2 이상이면 우수."
          />
          <Metric
            name="연속 (스트릭)"
            body="현재 연속 승/패 횟수. 연속 손실 3건 이상이면 강제 휴식 권장 (심리적 자금 관리)."
          />
          <Metric
            name="Equity Curve"
            body="시간순 누적 R 곡선. 0선 위면 녹색, 아래면 적색. 최고점·최저점 한 거래가 헤더에 표시."
          />
        </div>
      </GuideSection>

      {/* Breakdown */}
      <GuideSection eyebrow="03" title="Breakdown 카드 활용">
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          어디서 돈을 벌고 어디서 잃는지 빠르게 찾는 도구입니다.
        </p>
        <ul className="space-y-2 max-w-2xl text-sm text-muted-foreground">
          <li>· <span className="font-medium text-foreground">등급별</span> — A 등급에서만 +, C 이하에서 - 면 등급 시스템 신뢰 가능. C·D 진입을 줄이세요.</li>
          <li>· <span className="font-medium text-foreground">방향별</span> — 롱 vs 숏 누적 R. 한쪽으로 치우치면 시장 편향 또는 본인 편향.</li>
          <li>· <span className="font-medium text-foreground">청산 사유별</span> — 손절 vs 목표 vs 수동. 수동 청산이 많으면 룰 위반 가능성. 손절 비율이 너무 높으면 손절 기준 재검토.</li>
        </ul>
      </GuideSection>

      {/* 랭킹 보상 */}
      <GuideSection eyebrow="04" title="랭킹과 주간 보상">
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          매주 월요일 00:00 KST에 자동 분배됩니다. 게임·트레이딩·통합 카테고리 각각 운영.
        </p>
        <div className="overflow-hidden rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">순위</th>
                <th className="px-4 py-2 text-right font-medium">게임 / 트레이딩</th>
                <th className="px-4 py-2 text-right font-medium">통합</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              <tr><td className="px-4 py-2.5 font-medium">1등</td><td className="px-4 py-2.5 text-right font-mono">1,000 vUSDT</td><td className="px-4 py-2.5 text-right font-mono">3,000 vUSDT</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">2등</td><td className="px-4 py-2.5 text-right font-mono">500</td><td className="px-4 py-2.5 text-right font-mono">1,500</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">3등</td><td className="px-4 py-2.5 text-right font-mono">300</td><td className="px-4 py-2.5 text-right font-mono">800</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">4~10등</td><td className="px-4 py-2.5 text-right font-mono">100 (각)</td><td className="px-4 py-2.5 text-right font-mono">300 (각)</td></tr>
            </tbody>
          </table>
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-primary">
            <Lightbulb className="h-4 w-4" />
            점수 기준
          </div>
          <p className="text-muted-foreground">
            vUSDT PnL (= 실현 손익). 거래 횟수가 아니라 누적 손익 크기 — 작은 거래 다수보다 큰 한 방이 유리할 수 있음.
          </p>
        </div>
      </GuideSection>

      {/* FAQ */}
      <GuideSection title="결과·복기 FAQ">
        <div className="divide-y divide-border/60 border-y border-border/60">
          <GuideFaq question="거래를 수정하거나 삭제할 수 있나요?">
            진행 중 거래만 수동 청산 가능. 종료된 거래는 통계 무결성을 위해 삭제 불가입니다.
          </GuideFaq>
          <GuideFaq question="AI 코칭은 언제 받나요?">
            거래 상세 페이지에서 "AI 복기" 버튼을 누르면 그 거래에 한해 코칭을 생성합니다. AI 크레딧 1개 차감.
          </GuideFaq>
          <GuideFaq question="백테스트 결과는 어디 보나요?">
            현재 백테스트는 보류 중입니다. 보존된 작업은 archive/backtest-v1 태그로 GitHub에 있으며, 추후 재개 시 활성화됩니다.
          </GuideFaq>
        </div>
      </GuideSection>
    </GuideSubpageLayout>
  );
}

function TabCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-5">
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

function Metric({ name, body }: { name: string; body: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/30 p-4">
      <div className="text-sm font-semibold">{name}</div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
