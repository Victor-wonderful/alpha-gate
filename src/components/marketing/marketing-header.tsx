"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

const NAV: Array<{ href: string; labelKey: string; external?: boolean }> = [
  { href: "/features", labelKey: "mktc.nav.features" },
  { href: "/how-it-works", labelKey: "mktc.nav.howItWorks" },
  { href: "/pricing", labelKey: "mktc.nav.pricing" },
  { href: "/faq", labelKey: "mktc.nav.faq" },
  { href: "/contact", labelKey: "mktc.nav.contact" },
];

export function MarketingHeader() {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="relative z-30">
      <div className="flex items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={24} />
          <div>
            <div className="font-mono text-sm font-bold leading-tight tracking-[0.24em] text-white">
              ALPHA GATE
            </div>
            <div className="text-[9px] font-medium tracking-[0.2em] text-white/40">
              PRE-TRADE DECISION CHECK
            </div>
          </div>
        </Link>
        <nav className="hidden items-center gap-7 text-sm md:flex">
          {NAV.map((n) => {
            const active = pathname === n.href;
            const cls = cn(
              "transition-colors",
              active ? "text-white" : "text-white/60 hover:text-white",
            );
            return n.external ? (
              <a key={n.href} href={n.href} className={cls}>
                {t(n.labelKey)}
              </a>
            ) : (
              <Link key={n.href} href={n.href} className={cls}>
                {t(n.labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-full px-4 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:text-white sm:inline-block"
          >
            {t("mktc.login")}
          </Link>
          <Link
            href="/login?mode=signup"
            className="rounded-full bg-gradient-to-br from-sky-500 to-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-[0_0_20px_rgba(56,189,248,0.4)] transition-all hover:shadow-[0_0_28px_rgba(56,189,248,0.6)]"
          >
            {t("mktc.signup")}
          </Link>
          <button
            type="button"
            aria-label={t("mktc.openMenu")}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-white/80 transition-colors hover:text-white md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div
          className="absolute inset-x-0 top-full z-50 border-b border-white/10 bg-black/95 backdrop-blur md:hidden"
          role="dialog"
        >
          <nav className="flex flex-col px-6 py-4 sm:px-10">
            {NAV.map((n) => {
              const active = pathname === n.href;
              const cls = cn(
                "rounded-md px-2 py-3 text-sm transition-colors",
                active ? "bg-white/5 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
              );
              const onClick = () => setOpen(false);
              return n.external ? (
                <a key={n.href} href={n.href} onClick={onClick} className={cls}>
                  {t(n.labelKey)}
                </a>
              ) : (
                <Link key={n.href} href={n.href} onClick={onClick} className={cls}>
                  {t(n.labelKey)}
                </Link>
              );
            })}
            <div className="mt-3 flex gap-2 border-t border-white/10 pt-4">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-full border border-white/15 px-4 py-2.5 text-center text-xs font-semibold text-white/80 hover:bg-white/5 hover:text-white"
              >
                {t("mktc.login")}
              </Link>
              <Link
                href="/login?mode=signup"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 px-4 py-2.5 text-center text-xs font-semibold text-white shadow-[0_0_20px_rgba(56,189,248,0.4)]"
              >
                {t("mktc.signup")}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
