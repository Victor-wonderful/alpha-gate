import { GuideSubpageLayout, GuideSection, GuideFaq } from "@/components/guide/guide-layout";
import { AlertTriangle, Lightbulb } from "lucide-react";

export const metadata = { title: "가상 트레이딩 사용법" };

export default function GuideTradingPage() {
  return (
    <GuideSubpageLayout
      category="가상 트레이딩"
      title="가상 트레이딩 사용법"
      description="vUSDT로 거래소처럼 매매하면서 진입·청산 흐름을 익힙니다. 실제 자금 없이 실제와 똑같은 체결가·슬리피지·수수료를 경험합니다."
      next={{ href: "/app/guide/game", label: "가격 예측 게임 사용법 →" }}
    >
      {/* 시장가 vs 지정가 */}
      <GuideSection eyebrow="01" title="시장가와 지정가의 차이">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-card/30 p-5">
            <div className="text-sm font-semibold mb-2">시장가 주문</div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              현재가에 즉시 체결됩니다. 슬리피지 약 0.05% 자동 반영.
              빠른 진입이 필요할 때 사용하지만, 가격이 이미 목표·손절을 통과한 상태면 가드가 차단합니다.
            </p>
            <div className="mt-3 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">권장</span> · 시나리오가 immediate일 때
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/30 p-5">
            <div className="text-sm font-semibold mb-2">지정가 주문</div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              원하는 가격을 지정하고 도달 시 자동 체결.
              5분마다 가격을 확인하며, 24시간 안에 도달하지 않으면 만료됩니다.
            </p>
            <div className="mt-3 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">권장</span> · 시나리오가 pending일 때 (가격이 entryZone까지 와야 함)
            </div>
          </div>
        </div>
      </GuideSection>

      {/* 자동 정산 */}
      <GuideSection eyebrow="02" title="5분 자동 정산이란">
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          진입한 포지션은 5분마다 시장 가격으로 손절·목표가 적중을 확인합니다. 적중하면
          자동 종결되고 실현 R이 계산되며, 등록된 텔레그램·디스코드 알림으로 발송됩니다.
        </p>
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-primary">
            <Lightbulb className="h-4 w-4" />
            즉시 정산하고 싶을 때
          </div>
          <p className="text-muted-foreground">
            내 거래 페이지의 "지금 자동 정산" 버튼을 누르면 5분 기다리지 않고 즉시 확인합니다.
          </p>
        </div>
      </GuideSection>

      {/* 미실현 PnL */}
      <GuideSection eyebrow="03" title="미실현 PnL 위젯 읽는 법">
        <ul className="space-y-2 max-w-2xl text-sm text-muted-foreground">
          <li>· <span className="font-medium text-foreground">미실현 R</span> — 수수료 차감 후 net R. 0.84R 이상이면 수수료 부담 해소.</li>
          <li>· <span className="font-medium text-foreground">현재가</span> — 10초마다 자동 갱신 (CORS 우회 Binance ticker API).</li>
          <li>· <span className="font-medium text-foreground">손절·목표까지 %</span> — 가까울수록 결판이 임박.</li>
          <li>· <span className="font-medium text-foreground">진행 바</span> — 진입가에서 손절/목표까지의 진척도.</li>
        </ul>
      </GuideSection>

      {/* 주의사항 */}
      <section className="rounded-xl border border-grade-c/30 bg-grade-c/5 p-5">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-grade-c">
          <AlertTriangle className="h-4 w-4" />
          주의사항
        </div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>· 시장가 진입 시 입력 가격과 시장 가격 차이가 크면 거부됩니다 (추격 방지)</li>
          <li>· 지정가는 24시간 후 자동 만료. 그 안에 도달 안 하면 시나리오 폐기</li>
          <li>· 동일 코인 중복 진입은 노출 한도에 따라 거부될 수 있음</li>
        </ul>
      </section>

      {/* FAQ */}
      <GuideSection title="트레이딩 FAQ">
        <div className="divide-y divide-border/60 border-y border-border/60">
          <GuideFaq question="레버리지는 어떻게 적용되나요?">
            손익비와 등급에는 영향을 주지 않습니다. 필요 마진(노출 금액 ÷ 레버리지)만 달라집니다. 5x면 노출액의 1/5만 마진으로 사용.
          </GuideFaq>
          <GuideFaq question="수수료는 어떻게 계산되나요?">
            왕복 수수료 0.08% (Binance Taker × 2). 슬리피지는 체결가에 별도 반영(시장가 0.05%/side). 실현 R에서 자동 차감됩니다.
          </GuideFaq>
          <GuideFaq question="포지션을 수동으로 청산할 수 있나요?">
            가능합니다. 거래소 UI의 포지션 테이블에서 "청산" 버튼. 현재가 ± 슬리피지로 체결.
          </GuideFaq>
        </div>
      </GuideSection>
    </GuideSubpageLayout>
  );
}
