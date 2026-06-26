import type { Metadata } from "next";
import { LegalLayout } from "@/components/marketing/legal-layout";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("legal.privacy.metaTitle"),
    description: t("legal.privacy.metaDesc"),
  };
}

export default async function PrivacyPage() {
  const t = await getT();
  return (
    <LegalLayout
      title={t("legal.privacy.title")}
      eyebrow={t("legal.privacy.eyebrow")}
      effectiveDate={t("legal.privacy.effectiveDate")}
      currentHref="/privacy"
    >
      <p>{t("legal.privacy.intro")}</p>

      <h2>{t("legal.privacy.h1")}</h2>
      <h3>{t("legal.privacy.h1sub1")}</h3>
      <ul>
        <li>{t("legal.privacy.h1sub1li1")}</li>
        <li>{t("legal.privacy.h1sub1li2")}</li>
      </ul>
      <h3>{t("legal.privacy.h1sub2")}</h3>
      <ul>
        <li>{t("legal.privacy.h1sub2li1")}</li>
        <li>{t("legal.privacy.h1sub2li2")}</li>
        <li>{t("legal.privacy.h1sub2li3")}</li>
      </ul>
      <h3>{t("legal.privacy.h1sub3")}</h3>
      <ul>
        <li>{t("legal.privacy.h1sub3li1")}</li>
        <li>{t("legal.privacy.h1sub3li2")}</li>
      </ul>
      <h3>{t("legal.privacy.h1sub4")}</h3>
      <ul>
        <li>{t("legal.privacy.h1sub4li1")}</li>
      </ul>

      <h2>{t("legal.privacy.h2")}</h2>
      <ul>
        <li>{t("legal.privacy.h2li1")}</li>
        <li>{t("legal.privacy.h2li2")}</li>
        <li>{t("legal.privacy.h2li3")}</li>
        <li>{t("legal.privacy.h2li4")}</li>
        <li>{t("legal.privacy.h2li5")}</li>
        <li>{t("legal.privacy.h2li6")}</li>
      </ul>

      <h2>{t("legal.privacy.h3")}</h2>
      <ul>
        <li>{t("legal.privacy.h3li1")}</li>
        <li>{t("legal.privacy.h3li2")}</li>
        <li>{t("legal.privacy.h3li3")}</li>
      </ul>

      <h2>{t("legal.privacy.h4")}</h2>
      <p>{t("legal.privacy.h4p")}</p>
      <ul>
        <li>{t("legal.privacy.h4li1")}</li>
        <li>{t("legal.privacy.h4li2")}</li>
      </ul>

      <h2>{t("legal.privacy.h5")}</h2>
      <p>{t("legal.privacy.h5p")}</p>
      <ul>
        <li>{t("legal.privacy.h5li1")}</li>
        <li>{t("legal.privacy.h5li2")}</li>
        <li>{t("legal.privacy.h5li3")}</li>
        <li>{t("legal.privacy.h5li4")}</li>
      </ul>

      <h2>{t("legal.privacy.h6")}</h2>
      <p>{t("legal.privacy.h6p")}</p>
      <ul>
        <li>{t("legal.privacy.h6li1")}</li>
        <li>{t("legal.privacy.h6li2")}</li>
        <li>{t("legal.privacy.h6li3")}</li>
        <li>{t("legal.privacy.h6li4")}</li>
      </ul>

      <h2>{t("legal.privacy.h7")}</h2>
      <ul>
        <li>{t("legal.privacy.h7li1")}</li>
        <li>{t("legal.privacy.h7li2")}</li>
        <li>{t("legal.privacy.h7li3")}</li>
        <li>{t("legal.privacy.h7li4")}</li>
      </ul>

      <h2>{t("legal.privacy.h8")}</h2>
      <p>{t("legal.privacy.h8p")}</p>

      <h2>{t("legal.privacy.h9")}</h2>
      <p>{t("legal.privacy.h9p")}</p>
      <ul>
        <li>{t("legal.privacy.h9li1")}</li>
        <li>{t("legal.privacy.h9li2Pre")}<a href="/contact">{t("legal.privacy.h9li2Link")}</a></li>
      </ul>

      <h2>{t("legal.privacy.h10")}</h2>
      <p>{t("legal.privacy.h10p")}</p>
    </LegalLayout>
  );
}
