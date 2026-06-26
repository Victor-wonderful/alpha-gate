import { AlertTriangle, Clock, Lightbulb } from "lucide-react";
import { GuideSubpageLayout, GuideSection, GuideFaq, GuideChip } from "@/components/guide/guide-layout";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "AI 분석 사용법" };

export default async function GuideAnalyzePage() {
  const t = await getT();

  const STYLE_ROWS = [
    { style: t("guide.analyze.styleScalp"), cycle: t("guide.analyze.styleScalpCycle"), when: t("guide.analyze.styleScalpWhen") },
    { style: t("guide.analyze.styleDay"), cycle: t("guide.analyze.styleDayCycle"), when: t("guide.analyze.styleDayWhen") },
    { style: t("guide.analyze.styleSwing"), cycle: t("guide.analyze.styleSwingCycle"), when: t("guide.analyze.styleSwingWhen"), highlight: true },
    { style: t("guide.analyze.stylePosition"), cycle: t("guide.analyze.stylePositionCycle"), when: t("guide.analyze.stylePositionWhen") },
  ];

  const SESSIONS = [
    { label: t("guide.analyze.sessionAsia"), time: "09:00 ~ 16:00", note: t("guide.analyze.sessionAsiaNote"), tone: "muted" as const },
    { label: t("guide.analyze.sessionEurope"), time: "16:00 ~ 22:00", note: t("guide.analyze.sessionEuropeNote"), tone: "primary" as const },
    { label: t("guide.analyze.sessionUs"), time: "22:30 ~ 05:00", note: t("guide.analyze.sessionUsNote"), tone: "warn" as const },
  ];

  return (
    <GuideSubpageLayout
      category={t("guide.analyze.category")}
      title={t("guide.analyze.title")}
      description={t("guide.analyze.description")}
      next={{ href: "/app/guide/trading", label: t("guide.analyze.nextLabel") }}
    >
      {/* 1. 언제 분석하나 */}
      <GuideSection eyebrow="01" title={t("guide.analyze.s1Title")}>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          {t("guide.analyze.s1Intro")}
        </p>

        {/* 스타일별 주기 */}
        <div className="mt-4 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("guide.analyze.byStyle")}
          </div>
          <div className="overflow-hidden rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t("guide.analyze.thStyle")}</th>
                  <th className="px-4 py-2 text-left font-medium">{t("guide.analyze.thCycle")}</th>
                  <th className="px-4 py-2 text-left font-medium">{t("guide.analyze.thWhen")}</th>
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
            {t("guide.analyze.sessionsLabel")}
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
              {t("guide.analyze.recommendTitle")}
            </div>
            <ul className="space-y-0.5 text-muted-foreground">
              <li>· {t("guide.analyze.recommendDailyLead")} <span className="font-mono text-foreground tabular-nums">09:00 KST</span> {t("guide.analyze.recommendDailyTail")}</li>
              <li>· {t("guide.analyze.recommendIntraLead")} <span className="font-mono text-foreground tabular-nums">21:30~22:00</span> {t("guide.analyze.recommendIntraMid")} <span className="font-mono text-foreground tabular-nums">05:00</span> {t("guide.analyze.recommendIntraTail")}</li>
            </ul>
          </div>
        </div>

        {/* 피해야 할 시점 */}
        <div className="mt-4 rounded-lg border border-grade-c/30 bg-grade-c/5 px-4 py-3 text-sm">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-grade-c">
            <AlertTriangle className="h-4 w-4" />
            {t("guide.analyze.avoidTitle")}
          </div>
          <ul className="space-y-0.5 text-muted-foreground">
            <li>· {t("guide.analyze.avoidFunding")} <span className="font-mono tabular-nums">09:00 / 17:00 / 01:00 KST</span></li>
            <li>· {t("guide.analyze.avoidNews")}</li>
            <li>· {t("guide.analyze.avoidVolatility")}</li>
          </ul>
        </div>
      </GuideSection>

      {/* 2. 결과 읽는 법 */}
      <GuideSection eyebrow="02" title={t("guide.analyze.s2Title")}>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          {t("guide.analyze.s2Intro")}
        </p>
        <div className="mt-4 space-y-3">
          <ReadingBlock
            title={t("guide.analyze.read1Title")}
            desc={t("guide.analyze.read1Desc")}
            tip={t("guide.analyze.read1Tip")}
          />
          <ReadingBlock
            title={t("guide.analyze.read2Title")}
            desc={t("guide.analyze.read2Desc")}
            tip={t("guide.analyze.read2Tip")}
          />
          <ReadingBlock
            title={t("guide.analyze.read3Title")}
            desc={t("guide.analyze.read3Desc")}
            tip={t("guide.analyze.read3Tip")}
          />
          <ReadingBlock
            title={t("guide.analyze.read4Title")}
            desc={t("guide.analyze.read4Desc")}
            tip={t("guide.analyze.read4Tip")}
          />
          <ReadingBlock
            title={t("guide.analyze.read5Title")}
            desc={t("guide.analyze.read5Desc")}
            tip={t("guide.analyze.read5Tip")}
          />
          <ReadingBlock
            title={t("guide.analyze.read6Title")}
            desc={t("guide.analyze.read6Desc")}
            tip={t("guide.analyze.read6Tip")}
          />
        </div>
      </GuideSection>

      {/* 시나리오 자동 추적 (NEW) */}
      <GuideSection eyebrow="03" title={t("guide.analyze.s3Title")}>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          {t("guide.analyze.s3Intro")}
        </p>
        <div className="grid gap-3 lg:grid-cols-2 mt-4">
          <div className="rounded-xl border border-border/60 bg-card/30 p-5">
            <div className="text-sm font-semibold mb-2">{t("guide.analyze.autoLabelTitle")}</div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>· {t("guide.analyze.autoLabel1")}</li>
              <li>· {t("guide.analyze.autoLabel2")}</li>
              <li>· {t("guide.analyze.autoLabel3")}</li>
              <li>· {t("guide.analyze.autoLabel4")}</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/30 p-5">
            <div className="text-sm font-semibold mb-2">{t("guide.analyze.hitRateTitle")}</div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("guide.analyze.hitRateBody")}
            </p>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {t("guide.analyze.hitRateSampleNote")}
            </div>
          </div>
        </div>
      </GuideSection>

      {/* 4. 흔한 오해 */}
      <GuideSection eyebrow="04" title={t("guide.analyze.s4Title")}>
        <ul className="space-y-3 max-w-2xl">
          <Misconception
            wrong={t("guide.analyze.mis1Wrong")}
            right={t("guide.analyze.mis1Right")}
          />
          <Misconception
            wrong={t("guide.analyze.mis2Wrong")}
            right={t("guide.analyze.mis2Right")}
          />
          <Misconception
            wrong={t("guide.analyze.mis3Wrong")}
            right={t("guide.analyze.mis3Right")}
          />
          <Misconception
            wrong={t("guide.analyze.mis4Wrong")}
            right={t("guide.analyze.mis4Right")}
          />
        </ul>
      </GuideSection>

      {/* 4. 핵심 원칙 */}
      <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-primary">
          <Lightbulb className="h-4 w-4" />
          {t("guide.analyze.principleTitle")}
        </div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>· {t("guide.analyze.principle1")}</li>
          <li>· {t("guide.analyze.principle2")}</li>
          <li>· {t("guide.analyze.principle3")}</li>
          <li>· {t("guide.analyze.principle4")}</li>
        </ul>
      </section>

      {/* FAQ */}
      <GuideSection title={t("guide.analyze.faqHeading")}>
        <div className="divide-y divide-border/60 border-y border-border/60">
          <GuideFaq question={t("guide.analyze.faq1Q")}>
            {t("guide.analyze.faq1A")}
          </GuideFaq>
          <GuideFaq question={t("guide.analyze.faq2Q")}>
            {t("guide.analyze.faq2A")}
          </GuideFaq>
          <GuideFaq question={t("guide.analyze.faq3Q")}>
            {t("guide.analyze.faq3A")}
          </GuideFaq>
          <GuideFaq question={t("guide.analyze.faq4Q")}>
            {t("guide.analyze.faq4A")}
          </GuideFaq>
        </div>
      </GuideSection>
    </GuideSubpageLayout>
  );
}

async function ReadingBlock({ title, desc, tip }: { title: string; desc: string; tip: string }) {
  const t = await getT();
  return (
    <div className="rounded-lg border border-border/60 bg-card/30 p-4">
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{desc}</p>
      <div className="mt-2 flex items-start gap-2 text-xs">
        <Clock className="mt-0.5 h-3.5 w-3.5 flex-none text-primary/70" />
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">{t("guide.common.tipPrefix")}</span>
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
