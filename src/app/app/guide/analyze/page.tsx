import { AlertTriangle, Clock, Lightbulb } from "lucide-react";
import { GuideSubpageLayout, GuideSection, GuideFaq, GuideChip } from "@/components/guide/guide-layout";
import { cn } from "@/lib/utils";

export const metadata = { title: "AI 분석 사용법" };

const STYLE_ROWS = [
  { style: "스캘핑", cycle: "진입 직전 매번", when: "5M / 15M 캔들 마감 직후" },
  { style: "데이", cycle: "하루 2~3회", when: "1H 캔들 마감 · 세션 전환 시" },
  { style: "스윙", cycle: "주 2~3회", when: "4H / 1D 캔들 마감 후", highlight: true },
  { style: "포지션", cycle: "주 1회", when: "1D / 1W 마감 후" },
];

const SESSIONS = [
  { label: "아시아", time: "09:00 ~ 16:00", note: "변동성 낮음 · 박스 잦음", tone: "muted" as const },
  { label: "유럽", time: "16:00 ~ 22:00", note: "변동성 ↑ · 추세 발생", tone: "primary" as const },
  { label: "미국", time: "22:30 ~ 05:00", note: "최고 변동성 · 추세+휩쏘", tone: "warn" as const },
];

export default function GuideAnalyzePage() {
  return (
    <GuideSubpageLayout
      category="AI 분석"
      title="AI 분석 사용법"
      description="언제 분석하면 좋은지, 결과를 어떻게 읽어야 하는지. 트레이딩 스타일과 시장 시간대에 따라 다릅니다."
      next={{ href: "/app/guide/trading", label: "트레이딩 터미널 사용법 →" }}
    >
      {/* 1. 언제 분석하나 */}
      <GuideSection eyebrow="01" title="언제 분석하면 좋은가">
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          시장 데이터는 캔들 마감 직후 가장 안정적입니다. 진행 중 캔들 중간에 분석하면 노이즈가 끼어
          결과가 자주 뒤집힙니다.
        </p>

        {/* 스타일별 주기 */}
        <div className="mt-4 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            트레이딩 스타일별
          </div>
          <div className="overflow-hidden rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">스타일</th>
                  <th className="px-4 py-2 text-left font-medium">분석 주기</th>
                  <th className="px-4 py-2 text-left font-medium">권장 시점</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {STYLE_ROWS.map((r) => (
                  <tr key={r.style} className={cn(r.highlight && "bg-primary/5")}>
                    <td className="px-4 py-2.5 font-medium">
                      {r.style}
                      {r.highlight ? <span className="ml-1 text-[10px] text-primary">★</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.cycle}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 시장 세션 */}
        <div className="mt-6 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            시장 시간대 (KST)
          </div>
          <ul className="space-y-1.5">
            {SESSIONS.map((s) => (
              <li
                key={s.label}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/30 px-4 py-2.5 text-sm"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    s.tone === "primary" && "bg-primary",
                    s.tone === "warn" && "bg-grade-c",
                    s.tone === "muted" && "bg-muted-foreground/40",
                  )}
                />
                <span className="w-14 shrink-0 font-medium">{s.label}</span>
                <span className="w-36 shrink-0 font-mono text-muted-foreground tabular-nums">{s.time}</span>
                <span className="text-muted-foreground">{s.note}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-primary">
              <Lightbulb className="h-4 w-4" />
              권장 분석 시간대
            </div>
            <ul className="space-y-0.5 text-muted-foreground">
              <li>· 데일리: <span className="font-mono text-foreground tabular-nums">09:00 KST</span> (일봉 마감 직후)</li>
              <li>· 인트라데이: <span className="font-mono text-foreground tabular-nums">21:30~22:00</span> (미국 개장 전), <span className="font-mono text-foreground tabular-nums">05:00</span> (마감 후)</li>
            </ul>
          </div>
        </div>

        {/* 피해야 할 시점 */}
        <div className="mt-4 rounded-lg border border-grade-c/30 bg-grade-c/5 px-4 py-3 text-sm">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-grade-c">
            <AlertTriangle className="h-4 w-4" />
            피해야 할 시점
          </div>
          <ul className="space-y-0.5 text-muted-foreground">
            <li>· 펀딩 정산 ±10분 — <span className="font-mono tabular-nums">09:00 / 17:00 / 01:00 KST</span></li>
            <li>· 주요 지표 발표 전후 30분 — FOMC, CPI, 비농업 고용(NFP) 등</li>
            <li>· 변동성 폭발 직후 30분 — 분석 신뢰도 급락</li>
          </ul>
        </div>
      </GuideSection>

      {/* 2. 결과 읽는 법 */}
      <GuideSection eyebrow="02" title="분석 결과를 어떻게 읽나">
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          분석 결과는 6개 섹션으로 나옵니다. 위에서 아래로 큰 구조 → 좁은 진입 조건 순.
        </p>
        <div className="mt-4 space-y-3">
          <ReadingBlock
            title="① 시장 구조 (Structure)"
            desc="큰 시간대(HTF)와 작은 시간대(LTF)의 정렬 여부. 같은 방향이면 'aligned', 엇갈리면 'mixed'."
            tip="aligned + 강한 추세일 때만 추세 매매가 유효. mixed면 박스권 매매로 전환."
          />
          <ReadingBlock
            title="② 핵심 레벨 (Key Levels)"
            desc="POC(거래량 중심), VAH/VAL(거래량 영역), 직전 고/저점. 가격이 자석처럼 끌리는 지점."
            tip="진입가는 이 레벨 근처여야 합니다. 레벨에서 멀면 추격 위험."
          />
          <ReadingBlock
            title="③ 체결 흐름 (Flow)"
            desc="매수/매도 델타, 호가 임밸런스, 펀딩비. 단기 압력 방향."
            tip="시나리오 방향과 흐름이 일치하면 신뢰도 ↑. 충돌하면 wait 또는 강한 trigger 필요."
          />
          <ReadingBlock
            title="④ 시나리오 (Scenarios)"
            desc="시나리오마다 entryZone(진입 영역), invalidation(손절), target(목표), 단계 진입 가격 + 비중."
            tip="entryType이 'pending'이면 가격이 entryZone까지 와야 진입. 'immediate'면 지금 진입 가능."
          />
          <ReadingBlock
            title="⑤ 매매 등급 (Grade)"
            desc="시나리오별 A~D 등급. 손익비·BTC 정렬·박스 회피·거래량·심리 등을 점수화."
            tip="A는 좋은 거래, B는 조건부, C는 비추천, D는 거래 금지. C 이하는 진입 거부 권장."
          />
          <ReadingBlock
            title="⑥ 검토 항목 (qualityIssues)"
            desc="시나리오가 표준에서 벗어난 항목. 손절폭 부족, R:R 미달 등."
            tip="앰버 박스로 표시. 항목이 많으면 진입 전 본인 판단 강화."
          />
        </div>
      </GuideSection>

      {/* 시나리오 자동 추적 (NEW) */}
      <GuideSection eyebrow="03" title="시나리오 결과 자동 추적 — 과거 적중률">
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          분석을 저장하면 시나리오들이 자동으로 트래킹 시스템에 등록됩니다. 사용자가 실제 진입했는지 여부와
          무관하게 시스템이 5분마다 가격 도달을 추적해 적중률 데이터를 누적합니다.
        </p>
        <div className="grid gap-3 lg:grid-cols-2 mt-4">
          <div className="rounded-xl border border-border/60 bg-card/30 p-5">
            <div className="text-sm font-semibold mb-2">자동 라벨링</div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>· pending → triggered: entry 가격 터치</li>
              <li>· triggered → target: 목표가 도달 (승)</li>
              <li>· triggered → stop: 손절가 도달 (패)</li>
              <li>· 만료 시: expired (timeframe 별 timeout)</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/30 p-5">
            <div className="text-sm font-semibold mb-2">적중률 표시</div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              분석 결과의 AI 자신감 옆에 "과거 적중률 X% (Y승 Z패, +N.NR avg)" 자동 표시. 색상은 등급에 따라
              녹/노/빨. (symbol × strategy) 조합별 최근 30일 표본 합산.
            </p>
            <div className="mt-2 text-[11px] text-muted-foreground">
              표본 3개 미만이면 "표본 부족" 표시
            </div>
          </div>
        </div>
      </GuideSection>

      {/* 4. 흔한 오해 */}
      <GuideSection eyebrow="04" title="자주 하는 오해">
        <ul className="space-y-3 max-w-2xl">
          <Misconception
            wrong="AI가 추천한 거니까 사면 됨"
            right="시나리오는 시장 가설입니다. 등급 + 검토 항목 + 본인의 자금 관리를 거쳐야 진입 결정."
          />
          <Misconception
            wrong="시나리오 여러 개 다 진입"
            right="한 분석에서 메인 1개만. 보조 시나리오는 메인이 무효화될 때 대안."
          />
          <Misconception
            wrong="진입가 못 맞춰서 그냥 추격"
            right="시장가가 입력 진입가에서 손절폭의 50%를 넘어가면 가드가 차단합니다. 다음 셋업 대기."
          />
          <Misconception
            wrong="재분석 자주 = 더 정확"
            right="캔들 마감마다 1회면 충분. 과도한 재분석은 결단 마비를 일으킵니다."
          />
        </ul>
      </GuideSection>

      {/* 4. 핵심 원칙 */}
      <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-primary">
          <Lightbulb className="h-4 w-4" />
          핵심 원칙
        </div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>· 진입 직전 1회 분석 + 캔들 마감마다 재확인</li>
          <li>· 재분석 결과 큰 변화 없으면 그대로 진행</li>
          <li>· 같은 시나리오로 2회 이상 반복 진입 금지</li>
          <li>· 시나리오는 가설, 예측이 아님</li>
        </ul>
      </section>

      {/* FAQ */}
      <GuideSection title="분석 관련 FAQ">
        <div className="divide-y divide-border/60 border-y border-border/60">
          <GuideFaq question="분석 한 번에 크레딧이 얼마나 소모되나요?">
            한 번에 1개. 분석 시작 직전 잔량이 차감됩니다. 실패하면 환불됩니다.
          </GuideFaq>
          <GuideFaq question="분석 결과는 얼마나 보관되나요?">
            영구 보관됩니다. 분석 기록 페이지에서 다시 열어 시나리오를 그대로 실행할 수 있습니다.
          </GuideFaq>
          <GuideFaq question="차트 이미지를 첨부할 수 있나요?">
            네. 보조 컨텍스트로 사용됩니다. 단, 실제 결정은 데이터(스냅샷)가 기준입니다.
          </GuideFaq>
          <GuideFaq question="분석이 'wait'으로 나오면?">
            지표 혼조 또는 신호 부재. 다음 캔들 마감 후 재분석하거나 다른 종목으로 이동.
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
        <Clock className="mt-0.5 h-3.5 w-3.5 flex-none text-primary/70" />
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">TIP — </span>
          {tip}
        </span>
      </div>
    </div>
  );
}

function Misconception({ wrong, right }: { wrong: string; right: string }) {
  return (
    <li className="rounded-lg border border-border/60 bg-card/30 p-4">
      <div className="flex items-start gap-2 text-sm">
        <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded bg-grade-d/15 text-[10px] font-bold text-grade-d">
          ✕
        </span>
        <span className="text-grade-d/90">{wrong}</span>
      </div>
      <div className="mt-2 flex items-start gap-2 text-sm">
        <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded bg-grade-a/15 text-[10px] font-bold text-grade-a">
          ✓
        </span>
        <span className="text-muted-foreground">{right}</span>
      </div>
    </li>
  );
}
