import type { Metadata } from "next";
import { LegalLayout } from "@/components/marketing/legal-layout";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("legal.disclaimer.metaTitle"),
    description: t("legal.disclaimer.metaDesc"),
  };
}

export default async function DisclaimerPage() {
  const t = await getT();
  return (
    <LegalLayout
      title={t("legal.disclaimer.title")}
      eyebrow={t("legal.disclaimer.eyebrow")}
      effectiveDate={t("legal.disclaimer.effectiveDate")}
      currentHref="/disclaimer"
    >
      <h2>{t("legal.disclaimer.hSummary")}</h2>
      <p>
        <strong>{t("legal.disclaimer.summaryStrong")}</strong>{" "}
        {t("legal.disclaimer.summaryRest")}
      </p>

      <h2>{t("legal.disclaimer.h1")}</h2>
      <p>{t("legal.disclaimer.h1p")}</p>
      <ul>
        <li>{t("legal.disclaimer.h1li1")}</li>
        <li>{t("legal.disclaimer.h1li2")}</li>
        <li>{t("legal.disclaimer.h1li3")}</li>
        <li>{t("legal.disclaimer.h1li4")}</li>
      </ul>

      <h2>{t("legal.disclaimer.h2")}</h2>
      <ul>
        <li>{t("legal.disclaimer.h2li1")}</li>
        <li>{t("legal.disclaimer.h2li2")}</li>
        <li>{t("legal.disclaimer.h2li3")}</li>
        <li>{t("legal.disclaimer.h2li4")}</li>
      </ul>

      <h2>{t("legal.disclaimer.h3")}</h2>
      <ul>
        <li>{t("legal.disclaimer.h3li1")}</li>
        <li>{t("legal.disclaimer.h3li2")}</li>
        <li>{t("legal.disclaimer.h3li3")}</li>
      </ul>

      <h2>{t("legal.disclaimer.h4")}</h2>
      <p>{t("legal.disclaimer.h4p1")}</p>
      <p>{t("legal.disclaimer.h4p2")}</p>

      <h2>{t("legal.disclaimer.h5")}</h2>
      <ul>
        <li>
          <strong>{t("legal.disclaimer.h5li1Strong")}</strong>{t("legal.disclaimer.h5li1Rest")}
        </li>
        <li>{t("legal.disclaimer.h5li2")}</li>
        <li>{t("legal.disclaimer.h5li3")}</li>
        <li>{t("legal.disclaimer.h5li4")}</li>
      </ul>

      <h2>{t("legal.disclaimer.h6")}</h2>
      <p>
        {t("legal.disclaimer.h6pPre")}<strong>{t("legal.disclaimer.h6pStrong")}</strong>{t("legal.disclaimer.h6pPost")}
      </p>
      <ul>
        <li>{t("legal.disclaimer.h6li1")}</li>
        <li>
          {t("legal.disclaimer.h6li2Pre")}<strong>{t("legal.disclaimer.h6li2Strong")}</strong>{t("legal.disclaimer.h6li2Post")}
        </li>
        <li>{t("legal.disclaimer.h6li3")}</li>
        <li>{t("legal.disclaimer.h6li4")}</li>
        <li>{t("legal.disclaimer.h6li5")}</li>
      </ul>

      <h2>{t("legal.disclaimer.h7")}</h2>
      <ul>
        <li>{t("legal.disclaimer.h7li1")}</li>
        <li>{t("legal.disclaimer.h7li2")}</li>
        <li>{t("legal.disclaimer.h7li3")}</li>
      </ul>

      <hr />

      <p>
        {t("legal.disclaimer.contactPre")}<a href="/contact">{t("legal.disclaimer.contactLink")}</a>{t("legal.disclaimer.contactPost")}
      </p>
    </LegalLayout>
  );
}
