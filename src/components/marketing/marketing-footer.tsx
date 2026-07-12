import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Wordmark } from "@/components/app/wordmark";
import { getT } from "@/lib/i18n/server";

export async function MarketingFooter() {
  const t = await getT();
  return (
    <footer className="bg-black">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <div>
                <Wordmark height={18} className="text-white" />
                <div className="mt-1 text-[9px] font-medium tracking-[0.2em] text-white/40">
                  PRE-TRADE DECISION CHECK
                </div>
              </div>
            </div>
            <p className="mt-6 max-w-xs text-xs leading-relaxed text-white/50">
              {t("mktc.footer.tagline")}
            </p>
            <div className="mt-5">
              <a
                href="https://victor-alpha-neon.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white"
              >
                {t("nav.blog")}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
          <FooterCol
            title={t("mktc.footer.colProduct")}
            links={[
              { href: "/features", label: t("mktc.nav.features") },
              { href: "/how-it-works", label: t("mktc.nav.howItWorks") },
              { href: "/pricing", label: t("mktc.nav.pricing") },
            ]}
          />
          <FooterCol
            title={t("mktc.footer.colSupport")}
            links={[
              { href: "/faq", label: t("mktc.nav.faq") },
              { href: "/contact", label: t("mktc.nav.contact") },
              { href: "/login?mode=signup", label: t("mktc.signup") },
              { href: "/login", label: t("mktc.login") },
            ]}
          />
          <FooterCol
            title={t("mktc.footer.colLegal")}
            links={[
              { href: "/terms", label: t("mktc.legal.terms") },
              { href: "/privacy", label: t("mktc.legal.privacy") },
              { href: "/refund", label: t("mktc.legal.refund") },
              { href: "/disclaimer", label: t("mktc.legal.disclaimerShort") },
            ]}
          />
        </div>

        <div className="mt-14 border-t border-white/10 pt-6">
          <p className="text-[11px] leading-relaxed text-white/40">
            {t("mktc.footer.disclaimerPre")}{" "}
            <strong className="text-white/70">{t("mktc.footer.disclaimerStrong")}</strong>
            {t("mktc.footer.disclaimerMid")}{" "}
            <Link href="/disclaimer" className="text-cyan-400/80 hover:text-cyan-300">
              {t("mktc.legal.disclaimer")}
            </Link>
            {t("mktc.footer.disclaimerPost")}
          </p>
          <div className="mt-4 text-center text-[10px] uppercase tracking-[0.2em] text-white/30">
            © {new Date().getFullYear()} VECTA · All rights reserved
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string; external?: boolean }>;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{title}</div>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map((l) =>
          l.external ? (
            <li key={l.label}>
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-white/60 transition-colors hover:text-white"
              >
                {l.label}
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
          ) : (
            <li key={l.label}>
              <Link href={l.href} className="text-white/60 transition-colors hover:text-white">
                {l.label}
              </Link>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
