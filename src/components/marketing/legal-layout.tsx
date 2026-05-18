import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { SectionShell, GradientText } from "@/components/marketing/section";

const LEGAL_NAV: Array<{ href: string; label: string }> = [
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/refund", label: "환불정책" },
  { href: "/disclaimer", label: "투자 면책 고지" },
];

interface LegalLayoutProps {
  title: string;
  eyebrow: string;
  effectiveDate: string;
  currentHref: string;
  children: React.ReactNode;
}

export function LegalLayout({
  title,
  eyebrow,
  effectiveDate,
  currentHref,
  children,
}: LegalLayoutProps) {
  return (
    <main className="flex min-h-screen flex-col bg-[#02060f] text-white">
      <MarketingHeader />

      <SectionShell glowPosition="top" className="border-t-0" innerClassName="max-w-3xl py-20">
        <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400">
          <span className="inline-block h-px w-8 bg-cyan-400" />
          {eyebrow}
        </div>
        <h1 className="mt-5 text-3xl font-bold leading-[1.15] sm:text-4xl">
          <GradientText>{title}</GradientText>
        </h1>
        <p className="mt-4 font-mono text-xs uppercase tracking-wider text-white/40">
          시행일 · {effectiveDate}
        </p>
      </SectionShell>

      <SectionShell glowPosition="bottom-left" innerClassName="max-w-5xl py-20">
        <div className="grid gap-12 lg:grid-cols-[220px_1fr]">
          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-[#091632]/60 via-[#06112a]/50 to-[#040b1d]/75 p-5 backdrop-blur-xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400">
                법적 고지
              </div>
              <ul className="mt-4 space-y-1 text-sm">
                {LEGAL_NAV.map((n) => {
                  const active = n.href === currentHref;
                  return (
                    <li key={n.href}>
                      <Link
                        href={n.href}
                        className={
                          active
                            ? "block rounded-md border-l-2 border-cyan-400 bg-cyan-500/[0.08] px-3 py-2 font-semibold text-white shadow-[inset_0_0_20px_rgba(56,189,248,0.15)]"
                            : "block rounded-md border-l-2 border-transparent px-3 py-2 text-white/55 transition-colors hover:border-white/20 hover:text-white"
                        }
                      >
                        {n.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <Link
                href="/contact"
                className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 transition-colors hover:text-cyan-200"
              >
                문의하기 →
              </Link>
            </div>
          </aside>

          {/* Body */}
          <article className="legal-prose relative overflow-hidden rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-[#091632]/40 via-[#06112a]/30 to-[#040b1d]/60 p-8 backdrop-blur-xl sm:p-10">
            {children}
          </article>
        </div>
      </SectionShell>

      <MarketingFooter />
    </main>
  );
}
