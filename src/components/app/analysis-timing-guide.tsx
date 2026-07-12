import { Clock, Calendar, AlertTriangle, Lightbulb, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  defaultOpen?: boolean;
  className?: string;
};

const STYLE_ROWS: Array<{
  style: string;
  cycle: string;
  when: string;
  highlight?: boolean;
}> = [
  { style: "스캘핑", cycle: "진입 직전 매번", when: "5M / 15M 캔들 마감 직후" },
  { style: "데이", cycle: "하루 2~3회", when: "1H 캔들 마감 · 세션 전환 시" },
  { style: "스윙", cycle: "주 2~3회", when: "4H / 1D 캔들 마감 후", highlight: true },
  { style: "포지션", cycle: "주 1회", when: "1D / 1W 마감 후" },
];

const SESSIONS: Array<{ label: string; time: string; note: string; tone: "muted" | "primary" | "warn" }> = [
  { label: "아시아", time: "09:00 ~ 16:00", note: "한산 · 변동성 낮음 · 박스 잦음", tone: "muted" },
  { label: "유럽", time: "16:00 ~ 22:30", note: "활성 · 변동성 ↑ · 추세 발생", tone: "primary" },
  { label: "골든", time: "22:30 ~ 01:00", note: "런던·뉴욕 겹침 · 최고 유동성", tone: "primary" },
  { label: "죽은 구간", time: "05:00 ~ 09:00", note: "유동성 최저 · 휩쏘 · 단기 비권장", tone: "warn" },
];

export function AnalysisTimingGuide({ defaultOpen = false, className }: Props) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group rounded-xl border border-border bg-card shadow-card backdrop-blur-sm transition-colors",
        "open:bg-card shadow-card",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Clock className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">언제, 얼마나 자주 분석할까?</div>
          <div className="text-xs text-muted-foreground">
            트레이딩 스타일별 분석 주기와 시장 시간대 가이드
          </div>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-border/60 px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
        <div className="grid gap-5 lg:grid-cols-2">
          {/* 스타일별 주기 */}
          <section>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              스타일별 분석 주기
            </div>
            <div className="overflow-hidden rounded-lg border border-border/60">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">스타일</th>
                    <th className="px-3 py-2 text-left font-medium">주기</th>
                    <th className="px-3 py-2 text-left font-medium">시점</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {STYLE_ROWS.map((r) => (
                    <tr
                      key={r.style}
                      className={cn(r.highlight && "bg-primary/5")}
                    >
                      <td className="px-3 py-2 font-medium text-foreground">
                        {r.style}
                        {r.highlight && (
                          <span className="ml-1 text-[10px] text-primary">★</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.cycle}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.when}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 시장 시간대 */}
          <section>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              시장 시간대 (KST)
            </div>
            <ul className="space-y-1.5">
              {SESSIONS.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs"
                >
                  <span
                    className={cn(
                      "inline-flex h-1.5 w-1.5 shrink-0 rounded-full",
                      s.tone === "primary" && "bg-primary",
                      s.tone === "warn" && "bg-grade-c",
                      s.tone === "muted" && "bg-muted-foreground/40",
                    )}
                  />
                  <span className="w-12 shrink-0 font-medium text-foreground">{s.label}</span>
                  <span className="w-32 shrink-0 font-mono text-muted-foreground tabular-nums">
                    {s.time}
                  </span>
                  <span className="text-muted-foreground">{s.note}</span>
                </li>
              ))}
            </ul>

            <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
              <div className="mb-1 font-semibold text-primary">권장 분석 시간대</div>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>• 스윙·포지션: <span className="font-mono tabular-nums text-foreground">09:10 KST</span> (일봉 마감 직후 — 09:00 펀딩 노이즈 회피)</li>
                <li>• 데이: <span className="font-mono tabular-nums text-foreground">21:30</span> (미국 개장 전), <span className="font-mono tabular-nums text-foreground">05:00</span> (마감 후 복기)</li>
                <li>• 스캘핑: <span className="font-mono tabular-nums text-foreground">16:00</span> (런던 개장), <span className="font-mono tabular-nums text-foreground">22:30~01:00</span> (골든 타임)</li>
              </ul>
            </div>
          </section>
        </div>

        {/* 분석 적합도 4단계 범례 */}
        <section className="mt-4 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-xs">
          <div className="mb-1.5 font-semibold text-foreground">분석 적합도 4단계</div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {[
              { name: "최적", dot: "bg-grade-a", desc: "캔들 마감 직후 + 유동성 좋음" },
              { name: "양호", dot: "bg-primary", desc: "한 조건 충족" },
              { name: "보통", dot: "bg-muted-foreground", desc: "분석 무방, 특별히 좋진 않음" },
              { name: "회피", dot: "bg-grade-d", desc: "펀딩 ±10분 — 잠시 후" },
            ].map((l) => (
              <div key={l.name} className="flex items-start gap-1.5">
                <span className={cn("mt-1 h-1.5 w-1.5 flex-none rounded-full", l.dot)} />
                <span className="min-w-0">
                  <span className="font-medium text-foreground">{l.name}</span>
                  <span className="block text-[11px] leading-tight text-muted-foreground">{l.desc}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            최적·양호·보통은 모두 <span className="text-foreground">지금 분석 가능</span> — 품질 차이일 뿐입니다.
            진짜 회피는 펀딩 정산뿐.
          </p>
        </section>

        {/* 피해야 할 시점 */}
        <section className="mt-4 rounded-lg border border-grade-c/30 bg-grade-c/5 px-3 py-2.5 text-xs">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-grade-c">
            <AlertTriangle className="h-3.5 w-3.5" />
            피해야 할 시점
          </div>
          <ul className="space-y-0.5 text-muted-foreground">
            <li>• 펀딩 정산 ±10분 — <span className="font-mono tabular-nums">09:00 / 17:00 / 01:00 KST</span></li>
            <li>• 죽은 구간 <span className="font-mono tabular-nums">05:00~09:00</span> — 단기(스캘핑) 분석은 휩쏘 위험</li>
            <li>• 주요 지표 발표 전후 30분 — FOMC, CPI, 비농업 고용(NFP) 등</li>
            <li>• 변동성 폭발 직후 30분 — 분석 신뢰도 급락</li>
          </ul>
        </section>

        {/* 핵심 원칙 */}
        <section className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-primary">
            <Lightbulb className="h-3.5 w-3.5" />
            핵심 원칙
          </div>
          <ul className="space-y-0.5 text-muted-foreground">
            <li>• 진입 직전 1회 + 캔들 마감마다 재확인</li>
            <li>• 재분석 결과 큰 변화 없으면 그대로 진행 (과도한 재분석은 결단 마비)</li>
            <li>• 같은 시나리오로 2회 이상 반복 진입 금지</li>
          </ul>
        </section>
      </div>
    </details>
  );
}
