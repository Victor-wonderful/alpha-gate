import { GuideSubpageLayout, GuideSection, GuideFaq } from "@/components/guide/guide-layout";
import { Lightbulb } from "lucide-react";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "가격 예측 게임 사용법" };

export default async function GuideGamePage() {
  const t = await getT();

  const PHASES = [
    { name: t("guide.game.phase1Name"), dur: t("guide.game.phase1Dur"), color: "primary" as const, body: t("guide.game.phase1Body") },
    { name: t("guide.game.phase2Name"), dur: t("guide.game.phase2Dur"), color: "warn" as const, body: t("guide.game.phase2Body") },
    { name: t("guide.game.phase3Name"), dur: t("guide.game.phase3Dur"), color: "muted" as const, body: t("guide.game.phase3Body") },
    { name: t("guide.game.phase4Name"), dur: t("guide.game.phase4Dur"), color: "primary" as const, body: t("guide.game.phase4Body") },
    { name: t("guide.game.phase5Name"), dur: t("guide.game.phase5Dur"), color: "good" as const, body: t("guide.game.phase5Body") },
  ];

  return (
    <GuideSubpageLayout
      category={t("guide.game.category")}
      title={t("guide.game.title")}
      description={t("guide.game.description")}
      next={{ href: "/app/guide/results", label: t("guide.game.nextLabel") }}
    >
      {/* 핵심 규칙 */}
      <GuideSection eyebrow="01" title={t("guide.game.s1Title")}>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
          {t("guide.game.s1IntroLead")}<span className="font-medium text-foreground">{t("guide.game.s1Emphasis")}</span>{t("guide.game.s1IntroTail")}
        </p>
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-primary">
            <Lightbulb className="h-4 w-4" />
            {t("guide.game.exampleTitle")}
          </div>
          <p className="text-muted-foreground">
            {t("guide.game.exampleLead")} <span className="font-mono text-foreground">{t("guide.game.exampleOpen")}</span>{t("guide.game.exampleMid")}
            <span className="font-mono text-foreground">{t("guide.game.exampleClose")}</span>{t("guide.game.exampleTail")}
          </p>
        </div>
      </GuideSection>

      {/* 페이즈 */}
      <GuideSection eyebrow="02" title={t("guide.game.s2Title")}>
        <div className="overflow-hidden rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">{t("guide.game.thPhase")}</th>
                <th className="px-4 py-2 text-left font-medium">{t("guide.game.thWhen")}</th>
                <th className="px-4 py-2 text-left font-medium">{t("guide.game.thDesc")}</th>
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
      <GuideSection eyebrow="03" title={t("guide.game.s3Title")}>
        <ul className="space-y-2 max-w-2xl text-sm text-muted-foreground">
          <li>· <span className="font-medium text-foreground">{t("guide.game.betCurrencyLabel")}</span>{t("guide.game.betCurrencyBody")}</li>
          <li>· <span className="font-medium text-foreground">{t("guide.game.betPayoutLabel")}</span>{t("guide.game.betPayoutBody")}</li>
          <li>· <span className="font-medium text-foreground">{t("guide.game.betTimeframeLabel")}</span>{t("guide.game.betTimeframeBody")}</li>
          <li>· <span className="font-medium text-foreground">{t("guide.game.betSymbolLabel")}</span>{t("guide.game.betSymbolBody")}</li>
          <li>· <span className="font-medium text-foreground">{t("guide.game.betTieLabel")}</span>{t("guide.game.betTieBody")}</li>
        </ul>
      </GuideSection>

      {/* FAQ */}
      <GuideSection title={t("guide.game.faqHeading")}>
        <div className="divide-y divide-border/60 border-y border-border/60">
          <GuideFaq question={t("guide.game.faq1Q")}>
            {t("guide.game.faq1A")}
          </GuideFaq>
          <GuideFaq question={t("guide.game.faq2Q")}>
            {t("guide.game.faq2A")}
          </GuideFaq>
          <GuideFaq question={t("guide.game.faq3Q")}>
            {t("guide.game.faq3A")}
          </GuideFaq>
          <GuideFaq question={t("guide.game.faq4Q")}>
            {t("guide.game.faq4A")}
          </GuideFaq>
        </div>
      </GuideSection>
    </GuideSubpageLayout>
  );
}
