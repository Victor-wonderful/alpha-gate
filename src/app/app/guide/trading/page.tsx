import { GuideSubpageLayout, GuideSection, GuideFaq } from "@/components/guide/guide-layout";
import { AlertTriangle, Lightbulb } from "lucide-react";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "가상 거래 사용법" };

export default async function GuideTradingPage() {
  const t = await getT();
  return (
    <GuideSubpageLayout
      category={t("guide.trading.category")}
      title={t("guide.trading.title")}
      description={t("guide.trading.description")}
      next={{ href: "/app/guide/results", label: t("guide.trading.nextLabel") }}
    >
      {/* 시장가 vs 지정가 */}
      <GuideSection eyebrow="01" title={t("guide.trading.s1Title")}>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-card shadow-card p-5">
            <div className="text-sm font-semibold mb-2">{t("guide.trading.marketOrderTitle")}</div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("guide.trading.marketOrderBody")}
            </p>
            <div className="mt-3 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">{t("guide.trading.recommendLabel")}</span>{t("guide.trading.marketOrderRecommend")}
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card shadow-card p-5">
            <div className="text-sm font-semibold mb-2">{t("guide.trading.limitOrderTitle")}</div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("guide.trading.limitOrderBody")}
            </p>
            <div className="mt-3 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">{t("guide.trading.recommendLabel")}</span>{t("guide.trading.limitOrderRecommend")}
            </div>
          </div>
        </div>
      </GuideSection>

      {/* 자동 정산 */}
      <GuideSection eyebrow="02" title={t("guide.trading.s2Title")}>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          {t("guide.trading.s2Intro")}
        </p>
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-primary">
            <Lightbulb className="h-4 w-4" />
            {t("guide.trading.instantSettleTitle")}
          </div>
          <p className="text-muted-foreground">
            {t("guide.trading.instantSettleBody")}
          </p>
        </div>
      </GuideSection>

      {/* 자금 관리 자동 집계 (NEW) */}
      <GuideSection eyebrow="03" title={t("guide.trading.s3Title")}>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          {t("guide.trading.s3Intro")}
        </p>
        <ul className="space-y-2 max-w-2xl text-sm text-muted-foreground mt-3">
          <li>· <span className="font-medium text-foreground">{t("guide.trading.mm1Label")}</span>{t("guide.trading.mm1Body")}</li>
          <li>· <span className="font-medium text-foreground">{t("guide.trading.mm2Label")}</span>{t("guide.trading.mm2Body")}</li>
          <li>· <span className="font-medium text-foreground">{t("guide.trading.mm3Label")}</span>{t("guide.trading.mm3Body")}</li>
          <li>· <span className="font-medium text-foreground">{t("guide.trading.mm4Label")}</span>{t("guide.trading.mm4Body")}</li>
        </ul>
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm mt-3">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-primary">
            <Lightbulb className="h-4 w-4" />
            {t("guide.trading.gradeRuleTitle")}
          </div>
          <ul className="space-y-0.5 text-muted-foreground">
            <li>· {t("guide.trading.gradeRule1")}</li>
            <li>· {t("guide.trading.gradeRule2")}</li>
            <li>· {t("guide.trading.gradeRule3")}</li>
            <li>· {t("guide.trading.gradeRule4")}</li>
            <li>· {t("guide.trading.gradeRule5")}</li>
          </ul>
        </div>
      </GuideSection>

      {/* 시장 컨텍스트 (NEW 강조) */}
      <GuideSection eyebrow="04" title={t("guide.trading.s4Title")}>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          {t("guide.trading.s4Intro")}
        </p>
        <ul className="space-y-2 max-w-2xl text-sm text-muted-foreground mt-3">
          <li>· <span className="font-medium text-foreground">{t("guide.trading.ctx1")}</span></li>
          <li>· <span className="font-medium text-foreground">{t("guide.trading.ctx2Label")}</span>{t("guide.trading.ctx2Body")}</li>
          <li>· {t("guide.trading.ctx3")}</li>
          <li>· {t("guide.trading.ctx4")}</li>
        </ul>
      </GuideSection>

      {/* 미실현 PnL */}
      <GuideSection eyebrow="05" title={t("guide.trading.s5Title")}>
        <ul className="space-y-2 max-w-2xl text-sm text-muted-foreground">
          <li>· <span className="font-medium text-foreground">{t("guide.trading.pnl1Label")}</span>{t("guide.trading.pnl1Body")}</li>
          <li>· <span className="font-medium text-foreground">{t("guide.trading.pnl2Label")}</span>{t("guide.trading.pnl2Body")}</li>
          <li>· <span className="font-medium text-foreground">{t("guide.trading.pnl3Label")}</span>{t("guide.trading.pnl3Body")}</li>
          <li>· <span className="font-medium text-foreground">{t("guide.trading.pnl4Label")}</span>{t("guide.trading.pnl4Body")}</li>
        </ul>
      </GuideSection>

      {/* 주의사항 */}
      <section className="rounded-xl border border-grade-c/30 bg-grade-c/5 p-5">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-grade-c">
          <AlertTriangle className="h-4 w-4" />
          {t("guide.trading.warnTitle")}
        </div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>· {t("guide.trading.warn1")}</li>
          <li>· {t("guide.trading.warn2")}</li>
          <li>· {t("guide.trading.warn3")}</li>
        </ul>
      </section>

      {/* FAQ */}
      <GuideSection title={t("guide.trading.faqHeading")}>
        <div className="divide-y divide-border/60 border-y border-border/60">
          <GuideFaq question={t("guide.trading.faq1Q")}>
            {t("guide.trading.faq1A")}
          </GuideFaq>
          <GuideFaq question={t("guide.trading.faq2Q")}>
            {t("guide.trading.faq2A")}
          </GuideFaq>
          <GuideFaq question={t("guide.trading.faq3Q")}>
            {t("guide.trading.faq3A")}
          </GuideFaq>
        </div>
      </GuideSection>
    </GuideSubpageLayout>
  );
}
