import { GuideSubpageLayout, GuideSection, GuideFaq } from "@/components/guide/guide-layout";
import { AlertTriangle, Lightbulb, Repeat, TrendingUp } from "lucide-react";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "차익거래 사용법" };

export default async function GuideArbitragePage() {
  const t = await getT();
  return (
    <GuideSubpageLayout
      category={t("guide.arbitrage.category")}
      title={t("guide.arbitrage.title")}
      description={t("guide.arbitrage.description")}
      next={{ href: "/app/guide/results", label: t("guide.arbitrage.nextLabel") }}
    >
      {/* 1. 모델 개요 */}
      <GuideSection eyebrow="01" title={t("guide.arbitrage.s1Title")}>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          <span className="font-medium text-foreground">{t("guide.arbitrage.s1Emphasis1")}</span>{t("guide.arbitrage.s1IntroMid")}{" "}
          <span className="font-medium text-foreground">{t("guide.arbitrage.s1Emphasis2")}</span>{t("guide.arbitrage.s1IntroTail")}
        </p>
        <div className="grid gap-3 lg:grid-cols-2 mt-4">
          <div className="rounded-xl border border-border/60 bg-card/30 p-5">
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Repeat className="h-4 w-4 text-primary" />
              {t("guide.arbitrage.plusCycleTitle")}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("guide.arbitrage.plusCycleBody")}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/30 p-5">
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Repeat className="h-4 w-4 text-primary" />
              {t("guide.arbitrage.minusCycleTitle")}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("guide.arbitrage.minusCycleBody")}
            </p>
          </div>
        </div>
      </GuideSection>

      {/* 2. 진입 결정 */}
      <GuideSection eyebrow="02" title={t("guide.arbitrage.s2Title")}>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          {t("guide.arbitrage.s2Intro")}
        </p>
        <div className="mt-4 space-y-3">
          <ReadingBlock
            title={t("guide.arbitrage.read1Title")}
            desc={t("guide.arbitrage.read1Desc")}
            tip={t("guide.arbitrage.read1Tip")}
          />
          <ReadingBlock
            title={t("guide.arbitrage.read2Title")}
            desc={t("guide.arbitrage.read2Desc")}
            tip={t("guide.arbitrage.read2Tip")}
          />
          <ReadingBlock
            title={t("guide.arbitrage.read3Title")}
            desc={t("guide.arbitrage.read3Desc")}
            tip={t("guide.arbitrage.read3Tip")}
          />
          <ReadingBlock
            title={t("guide.arbitrage.read4Title")}
            desc={t("guide.arbitrage.read4Desc")}
            tip={t("guide.arbitrage.read4Tip")}
          />
        </div>
      </GuideSection>

      {/* 3. 임계값 선택 */}
      <GuideSection eyebrow="03" title={t("guide.arbitrage.s3Title")}>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          {t("guide.arbitrage.s3Intro")}
        </p>
        <div className="overflow-hidden rounded-lg border border-border/60 mt-4">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">{t("guide.arbitrage.thThreshold")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("guide.arbitrage.thProfitPerCycle")}</th>
                <th className="px-4 py-2 text-left font-medium">{t("guide.arbitrage.thTrait")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              <tr>
                <td className="px-4 py-2 font-mono">0.2%</td>
                <td className="px-4 py-2 text-right font-mono text-muted-foreground">$0.10</td>
                <td className="px-4 py-2 text-muted-foreground">{t("guide.arbitrage.threshold02Trait")}</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono">0.3%</td>
                <td className="px-4 py-2 text-right font-mono text-muted-foreground">$0.23</td>
                <td className="px-4 py-2 text-muted-foreground">{t("guide.arbitrage.threshold03Trait")}</td>
              </tr>
              <tr className="bg-primary/5">
                <td className="px-4 py-2 font-mono">0.5% ★</td>
                <td className="px-4 py-2 text-right font-mono">$0.48</td>
                <td className="px-4 py-2">{t("guide.arbitrage.threshold05Trait")}</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono">1.0%</td>
                <td className="px-4 py-2 text-right font-mono">$1.10</td>
                <td className="px-4 py-2 text-muted-foreground">{t("guide.arbitrage.threshold10Trait")}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          {t("guide.arbitrage.s3Footnote")}
        </p>
      </GuideSection>

      {/* 4. 진입 모달 */}
      <GuideSection eyebrow="04" title={t("guide.arbitrage.s4Title")}>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          {t("guide.arbitrage.s4IntroLead")}{" "}
          <span className="font-medium text-foreground">{t("guide.arbitrage.s4Emphasis")}</span>{t("guide.arbitrage.s4IntroTail")}
        </p>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 mt-4 text-sm">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-400 mb-2">
            <TrendingUp className="h-4 w-4" />
            {t("guide.arbitrage.deltaNeutralTitle")}
          </div>
          <ul className="space-y-1 text-muted-foreground">
            <li>· {t("guide.arbitrage.deltaNeutral1")}</li>
            <li>· {t("guide.arbitrage.deltaNeutral2")}</li>
            <li>· {t("guide.arbitrage.deltaNeutral3")}</li>
          </ul>
        </div>
      </GuideSection>

      {/* 5. 진행 중 포지션 */}
      <GuideSection eyebrow="05" title={t("guide.arbitrage.s5Title")}>
        <ul className="space-y-2 max-w-2xl text-sm text-muted-foreground">
          <li>
            · <span className="font-medium text-foreground">{t("guide.arbitrage.pos1Label")}</span>{t("guide.arbitrage.pos1Body")}
          </li>
          <li>
            · <span className="font-medium text-foreground">{t("guide.arbitrage.pos2Label")}</span>{t("guide.arbitrage.pos2Body")}
          </li>
          <li>
            · <span className="font-medium text-foreground">{t("guide.arbitrage.pos3Label")}</span>{t("guide.arbitrage.pos3Body")}
          </li>
          <li>
            · <span className="font-medium text-foreground">{t("guide.arbitrage.pos4Label")}</span>{t("guide.arbitrage.pos4Body")}
          </li>
        </ul>
      </GuideSection>

      {/* 주의사항 */}
      <section className="rounded-xl border border-grade-c/30 bg-grade-c/5 p-5">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-grade-c">
          <AlertTriangle className="h-4 w-4" />
          {t("guide.arbitrage.warnTitle")}
        </div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>· {t("guide.arbitrage.warn1")}</li>
          <li>· {t("guide.arbitrage.warn2")}</li>
          <li>· {t("guide.arbitrage.warn3")}</li>
          <li>· {t("guide.arbitrage.warn4")}</li>
        </ul>
      </section>

      {/* FAQ */}
      <GuideSection title={t("guide.arbitrage.faqHeading")}>
        <div className="divide-y divide-border/60 border-y border-border/60">
          <GuideFaq question={t("guide.arbitrage.faq1Q")}>
            {t("guide.arbitrage.faq1A")}
          </GuideFaq>
          <GuideFaq question={t("guide.arbitrage.faq2Q")}>
            {t("guide.arbitrage.faq2A")}
          </GuideFaq>
          <GuideFaq question={t("guide.arbitrage.faq3Q")}>
            {t("guide.arbitrage.faq3A")}
          </GuideFaq>
          <GuideFaq question={t("guide.arbitrage.faq4Q")}>
            {t("guide.arbitrage.faq4A")}
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
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-none text-primary/70" />
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">{t("guide.common.tipPrefix")}</span>
          {tip}
        </span>
      </div>
    </div>
  );
}
