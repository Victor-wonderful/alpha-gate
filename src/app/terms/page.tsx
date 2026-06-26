import type { Metadata } from "next";
import { LegalLayout } from "@/components/marketing/legal-layout";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("legal.terms.metaTitle"),
    description: t("legal.terms.metaDesc"),
  };
}

export default async function TermsPage() {
  const t = await getT();
  return (
    <LegalLayout
      title={t("legal.terms.title")}
      eyebrow={t("legal.terms.eyebrow")}
      effectiveDate={t("legal.terms.effectiveDate")}
      currentHref="/terms"
    >
      <h2>{t("legal.terms.h1")}</h2>
      <p>{t("legal.terms.p1")}</p>

      <h2>{t("legal.terms.h2")}</h2>
      <ol>
        <li>{t("legal.terms.p2li1")}</li>
        <li>{t("legal.terms.p2li2")}</li>
        <li>{t("legal.terms.p2li3")}</li>
      </ol>

      <h2>{t("legal.terms.h3")}</h2>
      <p>{t("legal.terms.p3")}</p>

      <h2>{t("legal.terms.h4")}</h2>
      <p>
        <strong>{t("legal.terms.p4a")}</strong>
      </p>
      <p>{t("legal.terms.p4b")}</p>

      <h2>{t("legal.terms.h5")}</h2>
      <ol>
        <li>{t("legal.terms.p5li1")}</li>
        <li>{t("legal.terms.p5li2")}</li>
        <li>{t("legal.terms.p5li3")}</li>
      </ol>

      <h2>{t("legal.terms.h6")}</h2>
      <ol>
        <li>{t("legal.terms.p6li1")}</li>
        <li>{t("legal.terms.p6li2")}</li>
      </ol>

      <h2>{t("legal.terms.h7")}</h2>
      <ol>
        <li>{t("legal.terms.p7li1")}</li>
        <li>{t("legal.terms.p7li2")}</li>
        <li>{t("legal.terms.p7li3")}</li>
      </ol>

      <h2>{t("legal.terms.h8")}</h2>
      <ol>
        <li>{t("legal.terms.p8li1")}</li>
        <li>{t("legal.terms.p8li2")}</li>
      </ol>

      <h2>{t("legal.terms.h9")}</h2>
      <ol>
        <li>{t("legal.terms.p9li1")}</li>
        <li>{t("legal.terms.p9li2")}</li>
      </ol>

      <h2>{t("legal.terms.h10")}</h2>
      <ol>
        <li>{t("legal.terms.p10li1")}</li>
        <li>
          {t("legal.terms.p10li2")}
          <ul>
            <li>{t("legal.terms.p10li2sub1")}</li>
            <li>{t("legal.terms.p10li2sub2")}</li>
            <li>{t("legal.terms.p10li2sub3")}</li>
          </ul>
        </li>
        <li>{t("legal.terms.p10li3")}</li>
        <li>{t("legal.terms.p10li4")}</li>
        <li>{t("legal.terms.p10li5")}</li>
        <li>{t("legal.terms.p10li6")}</li>
      </ol>

      <h2>{t("legal.terms.h11")}</h2>
      <ol>
        <li>{t("legal.terms.p11li1")}</li>
        <li>{t("legal.terms.p11li2")}</li>
        <li>{t("legal.terms.p11li3")}</li>
      </ol>

      <h2>{t("legal.terms.h12")}</h2>
      <p>{t("legal.terms.p12")}</p>

      <h2>{t("legal.terms.h13")}</h2>
      <p>{t("legal.terms.p13")}</p>

      <hr />

      <p>
        {t("legal.terms.contactPre")}<a href="/contact">{t("legal.terms.contactLink")}</a>{t("legal.terms.contactPost")}
      </p>
    </LegalLayout>
  );
}
