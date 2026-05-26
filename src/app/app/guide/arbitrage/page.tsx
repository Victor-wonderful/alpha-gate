import { GuideSubpageLayout, GuideSection, GuideFaq } from "@/components/guide/guide-layout";
import { AlertTriangle, Lightbulb, Repeat, TrendingUp } from "lucide-react";

export const metadata = { title: "차익거래 사용법" };

export default function GuideArbitragePage() {
  return (
    <GuideSubpageLayout
      category="차익거래"
      title="김프 리밸런싱 차익거래"
      description="Upbit · Binance 양쪽 거래소에 코인 + USDT 를 절반씩 보유하고, 김프가 ±임계값을 넘을 때마다 자동 리밸런싱으로 사이클별 수익을 누적합니다."
      next={{ href: "/app/guide/results", label: "내 결과 사용법 →" }}
    >
      {/* 1. 모델 개요 */}
      <GuideSection eyebrow="01" title="모델은 어떻게 동작하나">
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          전통적인 김프 헤지(한쪽 매수, 한쪽 매도)는 김프가 좁아질 때만 수익. 알파게이트의{" "}
          <span className="font-medium text-foreground">인벤토리 리밸런싱 모델</span>은 양쪽에 코인+USDT 를
          보유해 김프가 어느 방향으로 움직여도 사이클로 수익이 발생합니다.
        </p>
        <div className="grid gap-3 lg:grid-cols-2 mt-4">
          <div className="rounded-xl border border-border/60 bg-card/30 p-5">
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Repeat className="h-4 w-4 text-primary" />
              + 방향 사이클 (Upbit 매도)
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              김프 ≥ +임계값 도달 → Upbit 에서 코인을 비싸게 매도, Binance 에서 같은 양 매수.
              인벤토리의 25%씩 이동. 가격 차이만큼 USDT 수익.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/30 p-5">
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Repeat className="h-4 w-4 text-primary" />
              − 방향 사이클 (Upbit 매수)
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              김프 ≤ −임계값 도달 → Upbit 에서 코인을 싸게 매수, Binance 에서 매도.
              반대 방향 리밸런싱. 같은 인벤토리로 양방향 모두 수익 가능.
            </p>
          </div>
        </div>
      </GuideSection>

      {/* 2. 진입 결정 */}
      <GuideSection eyebrow="02" title="진입 결정 — 기대 수익 랭킹 활용">
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          26 개 코인을 5분마다 모니터링하며 7 일 김프 시계열을 백테스트해 코인별 기대 수익을 표시합니다.
          단순 사이클 발생 횟수가 아니라 인벤토리 고갈 + 코인 가격 변동까지 반영한 실증 PnL 추정치.
        </p>
        <div className="mt-4 space-y-3">
          <ReadingBlock
            title="① 예상 수익 ($1000)"
            desc="$1000 노출 가정, 최근 7 일 시계열에 실제 cron 로직을 그대로 시뮬레이션한 누적 PnL."
            tip="양수가 큰 코인 = 좋은 진입. 음수면 코인 가격 변동 손실이 사이클 수익보다 큼."
          />
          <ReadingBlock
            title="② 실효 사이클"
            desc="백테스트 중 실제 인벤토리가 이동한 사이클 수. 단순 임계값 통과 횟수가 아님."
            tip="단순 사이클 ≫ 실효 사이클이면 인벤토리가 빨리 고갈된 코인. 한쪽 쏠림 위험."
          />
          <ReadingBlock
            title="③ 방향 분포"
            desc="+/− 사이클 비율. 50/50 균형이 이상적, 한쪽 90% 넘으면 빨간 경고."
            tip="평균 김프가 0 근처인 코인이 양방향 사이클 균등 발생 → 지속 가능."
          />
          <ReadingBlock
            title="④ 최종 인벤토리 분포"
            desc="백테스트 종료 시 코인 / USDT 거래소간 분포. 50/50 균형이면 건강, 한쪽 90% 넘으면 빨간색."
            tip="과거 7 일간 인벤토리가 고갈됐다는 신호. 진입 시 같은 패턴이 반복될 가능성."
          />
        </div>
      </GuideSection>

      {/* 3. 임계값 선택 */}
      <GuideSection eyebrow="03" title="임계값은 어떻게 정하나">
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          임계값 = 사이클 발동 김프 절댓값. 낮을수록 사이클 자주 발생, 사이클당 수익 작음. 높을수록 반대.
        </p>
        <div className="overflow-hidden rounded-lg border border-border/60 mt-4">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">임계값</th>
                <th className="px-4 py-2 text-right font-medium">사이클당 수익 ($1000)</th>
                <th className="px-4 py-2 text-left font-medium">특징</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              <tr>
                <td className="px-4 py-2 font-mono">0.2%</td>
                <td className="px-4 py-2 text-right font-mono text-muted-foreground">$0.10</td>
                <td className="px-4 py-2 text-muted-foreground">손익분기 근접, 잦은 사이클</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono">0.3%</td>
                <td className="px-4 py-2 text-right font-mono text-muted-foreground">$0.23</td>
                <td className="px-4 py-2 text-muted-foreground">균형 (DOGE 같은 변동 큰 알트 추천)</td>
              </tr>
              <tr className="bg-primary/5">
                <td className="px-4 py-2 font-mono">0.5% ★</td>
                <td className="px-4 py-2 text-right font-mono">$0.48</td>
                <td className="px-4 py-2">기본값. 수익/빈도 균형</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono">1.0%</td>
                <td className="px-4 py-2 text-right font-mono">$1.10</td>
                <td className="px-4 py-2 text-muted-foreground">큰 변동 코인용. 사이클 드물지만 수익 큼</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          비용 고정: 수수료 0.04% × 양쪽 + 슬리피지 0.02% × 양쪽 = 0.12% 손익분기. 0.2% 미만은 손실 위험.
        </p>
      </GuideSection>

      {/* 4. 진입 모달 */}
      <GuideSection eyebrow="04" title="진입 모달 — 가격 노출 위험 경고">
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          진입 클릭 시 모달이 백테스트 요약 + 가격 노출 위험을 표시합니다.{" "}
          <span className="font-medium text-foreground">차익거래 ≠ 시장중립</span> — 양쪽에 보유한 코인이
          가격 떨어지면 사이클 수익과 무관하게 손실 발생합니다.
        </p>
        <div className="rounded-lg border border-grade-c/30 bg-grade-c/5 p-4 mt-4 text-sm">
          <div className="flex items-center gap-1.5 font-semibold text-grade-c mb-2">
            <TrendingUp className="h-4 w-4" />
            진입 전 반드시 확인
          </div>
          <ul className="space-y-1 text-muted-foreground">
            <li>· 최근 7일 가격 범위 (저점 ~ 고점)</li>
            <li>· 최대 낙폭 / 최대 상승 (%)</li>
            <li>· 5% / 10% / 최대 낙폭 시 예상 손실 ($)</li>
            <li>· 손실 회복에 필요한 사이클 수</li>
          </ul>
        </div>
      </GuideSection>

      {/* 5. 진행 중 포지션 */}
      <GuideSection eyebrow="05" title="진행 중 포지션 — 인벤토리 시각화">
        <ul className="space-y-2 max-w-2xl text-sm text-muted-foreground">
          <li>
            · <span className="font-medium text-foreground">코인/USDT 비율 바</span> — 양쪽 거래소 내 보유 비율
          </li>
          <li>
            · <span className="font-medium text-foreground">거래소간 분포 바</span> — 코인이 어느 쪽에 몰려있는지,
            USDT가 어느 쪽에 몰려있는지 별도 표시 (보통 반대 방향으로 쏠림)
          </li>
          <li>
            · <span className="font-medium text-foreground">다음 사이클 이동 가능량</span> — +/− 방향 각각 이동 가능한
            코인 수량 + USD 환산. 한 방향이 거의 0 이면 고갈 경고
          </li>
          <li>
            · <span className="font-medium text-foreground">사이클 이력</span> — 시간순 모든 사이클 (방향/김프/이동량/수익)
          </li>
        </ul>
      </GuideSection>

      {/* 주의사항 */}
      <section className="rounded-xl border border-grade-c/30 bg-grade-c/5 p-5">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-grade-c">
          <AlertTriangle className="h-4 w-4" />
          주의사항
        </div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>· 시장중립 아님 — 코인 큰 하락 시 사이클 수익보다 가격 손실이 큼</li>
          <li>· 한 방향에만 사이클 발생하면 인벤토리 빨리 고갈 → 더 이상 수익 발생 안 함</li>
          <li>· 만료 30 일 — 그 안에 청산 또는 자동 만료</li>
          <li>· 현재 시뮬레이션만 가능 (한국 외환법으로 실제 김프 차익 불가)</li>
        </ul>
      </section>

      {/* FAQ */}
      <GuideSection title="차익거래 FAQ">
        <div className="divide-y divide-border/60 border-y border-border/60">
          <GuideFaq question="어떤 코인을 골라야 하나요?">
            기대 수익 랭킹 상위 + 방향 분포가 50/50 근처 + 최종 인벤토리가 50/50 균형인 코인.
            보통 평균 김프가 0 근처이고 표준편차가 큰 코인이 이상적입니다.
          </GuideFaq>
          <GuideFaq question="왜 사이클이 많아도 수익이 작나요?">
            한 방향만 반복되면 인벤토리가 한쪽에 쏠려서 더 이상 이동 가능량이 없어집니다.
            단순 사이클 vs 실효 사이클 차이로 고갈 정도를 확인할 수 있습니다.
          </GuideFaq>
          <GuideFaq question="만료 30일 후 어떻게 되나요?">
            cron이 자동으로 인벤토리를 시가 평가해 청산. 누적 사이클 수익 + 코인 가격 변동 손익이 합산되어 PnL로 결정.
          </GuideFaq>
          <GuideFaq question="여러 포지션 동시에 가질 수 있나요?">
            네. 다른 코인이면 동시 가능. 각 포지션은 2 × notional 만큼 마진을 사용합니다.
          </GuideFaq>
        </div>
      </GuideSection>
    </GuideSubpageLayout>
  );
}

function ReadingBlock({ title, desc, tip }: { title: string; desc: string; tip: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/30 p-4">
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{desc}</p>
      <div className="mt-2 flex items-start gap-2 text-xs">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-none text-primary/70" />
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">TIP — </span>
          {tip}
        </span>
      </div>
    </div>
  );
}
