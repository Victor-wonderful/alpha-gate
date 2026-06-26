import type { Metadata } from "next";
import { LegalLayout } from "@/components/marketing/legal-layout";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("legal.refund.metaTitle"),
    description: t("legal.refund.metaDesc"),
  };
}

export default async function RefundPage() {
  const t = await getT();
  return (
    <LegalLayout
      title={t("legal.refund.title")}
      eyebrow={t("legal.refund.eyebrow")}
      effectiveDate={t("legal.refund.effectiveDate")}
      currentHref="/refund"
    >
      <p>{t("legal.refund.intro")}</p>

      <h2>{t("legal.refund.h1")}</h2>
      <p>{t("legal.refund.h1p")}</p>
      <ul>
        <li>{t("legal.refund.h1li1")}</li>
        <li>{t("legal.refund.h1li2")}</li>
      </ul>
      <p>{t("legal.refund.h1note")}</p>

      <h2>{t("legal.refund.h2")}</h2>
      <ul>
        <li>{t("legal.refund.h2li1")}</li>
        <li>{t("legal.refund.h2li2")}</li>
        <li>{t("legal.refund.h2li3")}</li>
      </ul>

      <h2>{t("legal.refund.h3")}</h2>
      <ul>
        <li>{t("legal.refund.h3li1")}</li>
        <li>{t("legal.refund.h3li2")}</li>
        <li>{t("legal.refund.h3li3")}</li>
      </ul>

      <h2>{t("legal.refund.h4")}</h2>
      <ol>
        <li>
          <strong>{t("legal.refund.h4li1Strong")}</strong>{t("legal.refund.h4li1Pre")}<a href="/contact">{t("legal.refund.h4li1Link")}</a>{t("legal.refund.h4li1Post")}
        </li>
        <li>
          <strong>{t("legal.refund.h4li2Strong")}</strong>{t("legal.refund.h4li2")}
        </li>
        <li>
          <strong>{t("legal.refund.h4li3Strong")}</strong>{t("legal.refund.h4li3")}
        </li>
      </ol>

      <h2>{t("legal.refund.h5")}</h2>
      <h3>{t("legal.refund.h5sub1")}</h3>
      <p>{t("legal.refund.h5sub1p")}</p>
      <h3>{t("legal.refund.h5sub2")}</h3>
      <p>{t("legal.refund.h5sub2p")}</p>

      <h2>{t("legal.refund.h6")}</h2>
      <p>{t("legal.refund.h6p")}</p>

      <h2>{t("legal.refund.h7")}</h2>
      <p>{t("legal.refund.h7p")}</p>

      <hr />

      <p>
        {t("legal.refund.contactPre")}<a href="/contact">{t("legal.refund.contactLink")}</a>{t("legal.refund.contactPost")}
      </p>
    </LegalLayout>
  );
}
