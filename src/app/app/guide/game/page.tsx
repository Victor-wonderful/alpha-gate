import { GuideSubpageLayout, GuideSection, GuideFaq } from "@/components/guide/guide-layout";
import { Lightbulb } from "lucide-react";

export const metadata = { title: "가격 예측 게임 사용법" };

const PHASES = [
  { name: "베팅 가능", dur: "캔들 시작 ~ 마감 5초 전", color: "primary" as const, body: "예측 방향(상승/하락)과 금액을 입력합니다." },
  { name: "마감 임박", dur: "마감 5초 전", color: "warn" as const, body: "베팅이 마감되기 직전. 신규 베팅 차단." },
  { name: "캔들 시작 대기", dur: "캔들 전환 순간", color: "muted" as const, body: "다음 캔들의 시가가 확정되기를 기다림." },
  { name: "캔들 진행 중", dur: "1분 / 3분", color: "primary" as const, body: "진입가(다음 캔들 시가) 점선이 차트에 표시됩니다." },
  { name: "정산", dur: "캔들 마감 직후", color: "good" as const, body: "종가가 진입가보다 위이면 상승 승리, 아래면 하락 승리." },
];

export default function GuideGamePage() {
  return (
    <GuideSubpageLayout
      category="가격 예측 게임"
      title="가격 예측 게임 사용법"
      description="1분 또는 3분 캔들의 시가→종가 방향을 예측합니다. 빠른 회전으로 시장 감각을 익히는 도구."
      next={{ href: "/app/guide/results", label: "내 결과 사용법 →" }}
    >
      {/* 핵심 규칙 */}
      <GuideSection eyebrow="01" title="핵심 규칙">
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          베팅은 <span className="font-medium text-foreground">다음 캔들</span>의 시가→종가 방향을 맞히는 게임입니다.
          베팅한 시점이 아니라 다음 캔들의 시가가 진입가 기준이 됩니다. 이 방식이 베팅 시점에 따른 불공정성을 제거합니다.
        </p>
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-primary">
            <Lightbulb className="h-4 w-4" />
            예시
          </div>
          <p className="text-muted-foreground">
            14:00:30에 "상승" 베팅 → 14:01 캔들의 <span className="font-mono text-foreground">시가</span>가 진입가 →
            14:02 캔들의 <span className="font-mono text-foreground">종가</span>로 판정.
            종가 &gt; 시가면 승리, &lt; 시가면 패배.
          </p>
        </div>
      </GuideSection>

      {/* 페이즈 */}
      <GuideSection eyebrow="02" title="게임 페이즈">
        <div className="overflow-hidden rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">페이즈</th>
                <th className="px-4 py-2 text-left font-medium">시점</th>
                <th className="px-4 py-2 text-left font-medium">설명</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {PHASES.map((p) => (
                <tr key={p.name}>
                  <td className="px-4 py-2.5 font-medium">{p.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground tabular-nums">{p.dur}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GuideSection>

      {/* 베팅과 정산 */}
      <GuideSection eyebrow="03" title="베팅과 정산">
        <ul className="space-y-2 max-w-2xl text-sm text-muted-foreground">
          <li>· <span className="font-medium text-foreground">통화</span> — vUSDT (별도 게임 화폐 없음)</li>
          <li>· <span className="font-medium text-foreground">배당</span> — 승리 시 2배 (수수료 차감 후)</li>
          <li>· <span className="font-medium text-foreground">시간 단위</span> — 1분 / 3분 선택 가능</li>
          <li>· <span className="font-medium text-foreground">대상 종목</span> — BTC/USDT (바이낸스 선물)</li>
          <li>· <span className="font-medium text-foreground">동률</span> — 시가 = 종가일 때 베팅액 환불 (드물게 발생)</li>
        </ul>
      </GuideSection>

      {/* FAQ */}
      <GuideSection title="게임 FAQ">
        <div className="divide-y divide-border/60 border-y border-border/60">
          <GuideFaq question="베팅 직후 가격이 이미 움직였는데 불리하지 않나요?">
            아닙니다. 진입가는 베팅 시점 가격이 아니라 다음 캔들의 시가입니다. 같은 캔들에 베팅한 모든 사용자는 동일한 진입가를 받습니다.
          </GuideFaq>
          <GuideFaq question="베팅 가능 시간은 얼마나 되나요?">
            현재 캔들 마감 5초 전까지. 그 이후는 자동으로 다음 캔들 베팅 페이즈로 넘어갑니다.
          </GuideFaq>
          <GuideFaq question="여러 캔들에 연속 베팅할 수 있나요?">
            가능하지만 한 번에 1개 베팅만 활성. 진행 중인 게임이 정산되어야 다음 베팅 가능.
          </GuideFaq>
          <GuideFaq question="게임 결과는 어디서 확인하나요?">
            게임 페이지 좌측의 히스토리 사이드바. 랭킹에도 자동 반영됩니다.
          </GuideFaq>
        </div>
      </GuideSection>
    </GuideSubpageLayout>
  );
}
