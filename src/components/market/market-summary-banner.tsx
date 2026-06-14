import { CircleCheck, CircleMinus, TriangleAlert } from "lucide-react";
import { classifyLiquidity } from "@/lib/analysis/sessions";
import { fetchFng } from "@/lib/market-widgets/fng";
import { fetchKimchiPremium } from "@/lib/market-widgets/kimchi";
import { fetchLongShortRatio } from "@/lib/market-widgets/long-short";
import { getUpcomingMacroEvents } from "@/lib/market-widgets/calendar";
import { cn } from "@/lib/utils";

type SignalTone = "ok" | "neutral" | "warn" | "danger";

interface Signal {
  label: string;
  value: string;
  tone: SignalTone;
}

const TONE = {
  ok: { Icon: CircleCheck, cls: "text-grade-a" },
  neutral: { Icon: CircleMinus, cls: "text-muted-foreground" },
  warn: { Icon: TriangleAlert, cls: "text-grade-c" },
  danger: { Icon: TriangleAlert, cls: "text-grade-d" },
} as const;

/**
 * 진입 환경 요약 배너 — 페이지를 다 읽지 않아도 첫 줄에서 결론을 얻는다.
 * 5개 신호(세션·심리·수급·김프·매크로)를 점수화해 종합 판정 표시.
 */
export async function MarketSummaryBanner() {
  // 개별 신호 실패는 "데이터 없음(중립)"으로 강등 — 배너 전체는 항상 뜬다.
  const [fng, kimchi, longShort] = await Promise.all([
    fetchFng().catch(() => null),
    fetchKimchiPremium().catch(() => null),
    fetchLongShortRatio().catch(() => null),
  ]);

  const signals: Signal[] = [];

  // 1) 세션 유동성
  const kstNow = new Date(Date.now() + 9 * 60 * 60_000);
  const liq = classifyLiquidity(kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes());
  signals.push({
    label: "세션 유동성",
    value: liq.label,
    tone: liq.tier === "golden" ? "ok" : liq.tier === "active" ? "ok" : liq.tier === "quiet" ? "neutral" : "warn",
  });

  // 2) 투자 심리 (F&G)
  if (fng) {
    const v = fng.value;
    signals.push({
      label: "투자 심리",
      value: `${v <= 25 ? "극단 공포" : v < 45 ? "공포" : v < 55 ? "중립" : v < 75 ? "탐욕" : "극단 탐욕"} ${v}`,
      tone: v <= 25 || v >= 75 ? "warn" : v < 45 ? "neutral" : "ok",
    });
  } else {
    signals.push({ label: "투자 심리", value: "데이터 없음", tone: "neutral" });
  }

  // 3) 수급 (Long/Short)
  if (longShort?.latest) {
    const r = longShort.latest.ratio;
    const longPct = Math.round((r / (1 + r)) * 100);
    signals.push({
      label: "수급 (롱/숏)",
      value: `${longPct} : ${100 - longPct}`,
      tone: longPct >= 65 || longPct <= 35 ? "warn" : "neutral",
    });
  } else {
    signals.push({ label: "수급 (롱/숏)", value: "데이터 없음", tone: "neutral" });
  }

  // 4) 김치 프리미엄 (평균)
  if (kimchi && kimchi.length > 0) {
    const avg = kimchi.reduce((s, k) => s + k.premiumPct, 0) / kimchi.length;
    signals.push({
      label: "김치 프리미엄",
      value: `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`,
      tone: Math.abs(avg) >= 4 ? "warn" : Math.abs(avg) >= 2.5 ? "neutral" : "ok",
    });
  } else {
    signals.push({ label: "김치 프리미엄", value: "데이터 없음", tone: "neutral" });
  }

  // 5) 매크로 임박 이벤트
  const next = getUpcomingMacroEvents(1)[0];
  if (next) {
    const imminent = next.daysUntil <= 1 && next.impact === "high";
    signals.push({
      label: "매크로",
      value: `${next.daysUntil === 0 ? "오늘" : `D-${next.daysUntil}`} ${next.title}`,
      tone: imminent ? "danger" : next.daysUntil <= 3 && next.impact === "high" ? "warn" : "ok",
    });
  } else {
    signals.push({ label: "매크로", value: "임박 이벤트 없음", tone: "ok" });
  }

  // 종합 판정 — ok 2점 / neutral 1점 / warn·danger 0점, 10점 만점 → 3단계
  const score = signals.reduce(
    (s, sig) => s + (sig.tone === "ok" ? 2 : sig.tone === "neutral" ? 1 : 0),
    0,
  );
  const okCount = signals.filter((s) => s.tone === "ok").length;
  const hasDanger = signals.some((s) => s.tone === "danger");
  const verdict: { label: string; cls: string; border: string } = hasDanger
    ? { label: "주의", cls: "text-grade-d", border: "border-grade-d/50" }
    : score >= 7
      ? { label: "좋음", cls: "text-grade-a", border: "border-grade-a/50" }
      : score >= 4
        ? { label: "보통", cls: "text-grade-c", border: "border-grade-c/50" }
        : { label: "주의", cls: "text-grade-d", border: "border-grade-d/50" };

  return (
    <section
      className={cn(
        "flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border bg-card/40 px-5 py-4",
        verdict.border,
      )}
    >
      <div className="min-w-[110px]">
        <div className="text-[11px] text-muted-foreground/70">지금 진입 환경</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className={cn("text-xl font-bold", verdict.cls)}>{verdict.label}</span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {okCount} / {signals.length}
          </span>
        </div>
      </div>
      <div className="hidden h-9 w-px bg-border sm:block" />
      <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
        {signals.map((s) => {
          const t = TONE[s.tone];
          return (
            <div key={s.label} className="min-w-0">
              <div className="truncate text-[10px] text-muted-foreground/70">{s.label}</div>
              <div className={cn("mt-0.5 flex items-center gap-1 text-xs font-semibold", t.cls)}>
                <t.Icon className="h-3 w-3 flex-none" />
                <span className="truncate">{s.value}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
