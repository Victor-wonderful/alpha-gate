"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { cn } from "@/lib/utils";

const NAV: Array<{ href: string; label: string; external?: boolean }> = [
  { href: "/features", label: "기능" },
  { href: "/how-it-works", label: "작동 방식" },
  { href: "/pricing", label: "가격" },
  { href: "/pricing#faq", label: "FAQ" },
  { href: "mailto:hello@alphagate.app", label: "문의", external: true },
];

export function MarketingHeader() {
  const pathname = usePathname();
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
                {n.label}
              </a>
            ) : (
              <Link key={n.href} href={n.href} className={cls}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-full px-4 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:text-white sm:inline-block"
          >
            로그인
          </Link>
          <Link
            href="/login?mode=signup"
            className="rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-600 px-4 py-1.5 text-xs font-semibold text-white shadow-[0_0_20px_rgba(192,38,211,0.4)] transition-all hover:shadow-[0_0_28px_rgba(192,38,211,0.6)]"
          >
            회원가입
          </Link>
          <button
            type="button"
            aria-label="메뉴"
            className="flex h-9 w-9 items-center justify-center rounded-md text-white/80 transition-colors hover:text-white md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
