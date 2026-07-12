import { GuideSubpageLayout, GuideSection, GuideFaq } from "@/components/guide/guide-layout";
import { Lightbulb } from "lucide-react";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "내 결과 · 복기 사용법" };

export default async function GuideResultsPage() {
  const t = await getT();
  return (
    <GuideSubpageLayout
      category={t("guide.results.category")}
      title={t("guide.results.title")}
      description={t("guide.results.description")}
      next={{ href: "/app/guide", label: t("guide.results.nextLabel") }}
    >
      {/* 3개 탭 */}
      <GuideSection eyebrow="01" title={t("guide.results.s1Title")}>
        <div className="grid gap-3 lg:grid-cols-3">
          <TabCard
            title={t("guide.results.tab1Title")}
            desc={t("guide.results.tab1Desc")}
          />
          <TabCard
            title={t("guide.results.tab2Title")}
            desc={t("guide.results.tab2Desc")}
          />
          <TabCard
            title={t("guide.results.tab3Title")}
            desc={t("guide.results.tab3Desc")}
          />
        </div>
      </GuideSection>

      {/* 핵심 지표 */}
      <GuideSection eyebrow="02" title={t("guide.results.s2Title")}>
        <div className="space-y-3">
          <Metric
            name={t("guide.results.metric1Name")}
            body={t("guide.results.metric1Body")}
          />
          <Metric
            name={t("guide.results.metric2Name")}
            body={t("guide.results.metric2Body")}
          />
          <Metric
            name="Profit Factor"
            body={t("guide.results.metric3Body")}
          />
          <Metric
            name={t("guide.results.metric4Name")}
            body={t("guide.results.metric4Body")}
          />
          <Metric
            name="Equity Curve"
            body={t("guide.results.metric5Body")}
          />
        </div>
      </GuideSection>

      {/* Breakdown */}
      <GuideSection eyebrow="03" title={t("guide.results.s3Title")}>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          {t("guide.results.s3Intro")}
        </p>
        <ul className="space-y-2 max-w-2xl text-sm text-muted-foreground">
          <li>· <span className="font-medium text-foreground">{t("guide.results.bd1Label")}</span>{t("guide.results.bd1Body")}</li>
          <li>· <span className="font-medium text-foreground">{t("guide.results.bd2Label")}</span>{t("guide.results.bd2Body")}</li>
          <li>· <span className="font-medium text-foreground">{t("guide.results.bd3Label")}</span>{t("guide.results.bd3Body")}</li>
        </ul>
      </GuideSection>

      {/* 랭킹 보상 */}
      <GuideSection eyebrow="04" title={t("guide.results.s4Title")}>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          {t("guide.results.s4Intro")}
        </p>
        <div className="overflow-hidden rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">{t("guide.results.thRank")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("guide.results.thGameTrading")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("guide.results.thCombined")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              <tr><td className="px-4 py-2.5 font-medium">{t("guide.results.rank1")}</td><td className="px-4 py-2.5 text-right font-mono">1,000 vUSDT</td><td className="px-4 py-2.5 text-right font-mono">3,000 vUSDT</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">{t("guide.results.rank2")}</td><td className="px-4 py-2.5 text-right font-mono">500</td><td className="px-4 py-2.5 text-right font-mono">1,500</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">{t("guide.results.rank3")}</td><td className="px-4 py-2.5 text-right font-mono">300</td><td className="px-4 py-2.5 text-right font-mono">800</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">{t("guide.results.rank4to10")}</td><td className="px-4 py-2.5 text-right font-mono">{t("guide.results.rankEach", { v: "100" })}</td><td className="px-4 py-2.5 text-right font-mono">{t("guide.results.rankEach", { v: "300" })}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-primary">
            <Lightbulb className="h-4 w-4" />
            {t("guide.results.scoreCriteriaTitle")}
          </div>
          <p className="text-muted-foreground">
            {t("guide.results.scoreCriteriaBody")}
          </p>
        </div>
      </GuideSection>

      {/* FAQ */}
      <GuideSection title={t("guide.results.faqHeading")}>
        <div className="divide-y divide-border/60 border-y border-border/60">
          <GuideFaq question={t("guide.results.faq1Q")}>
            {t("guide.results.faq1A")}
          </GuideFaq>
          <GuideFaq question={t("guide.results.faq2Q")}>
            {t("guide.results.faq2A")}
          </GuideFaq>
          <GuideFaq question={t("guide.results.faq3Q")}>
            {t("guide.results.faq3A")}
          </GuideFaq>
        </div>
      </GuideSection>
    </GuideSubpageLayout>
  );
}

function TabCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-card p-5">
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

function Metric({ name, body }: { name: string; body: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card shadow-card p-4">
      <div className="text-sm font-semibold">{name}</div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
