"use client";

/**
 * AppShell — 좌측 사이드바(접이식) + 탑바 레이아웃.
 * 디자인 시안: pencil-new.pen "시안 — 대시보드". TopNav를 대체한다.
 *
 * 구조:
 *  ┌──────┬──────────────────────────────┐
 *  │ Side │ TopBar (CTA·지갑칩·알림·아바타) │
 *  │ bar  ├──────────────────────────────┤
 *  │      │ children                      │
 *  └──────┴──────────────────────────────┘
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
  ChartCandlestick,
  ChartLine,
  ChevronDown,
  Coins,
  ExternalLink,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";
import { Wordmark } from "./wordmark";

type NavItem = {
  href: string;
  /** i18n 키 (nav.*) */
  labelKey: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** 같은 메뉴로 활성 처리할 형제 경로 */
  matchPaths?: string[];
};

const NAV: NavItem[] = [
  { href: "/app", labelKey: "nav.dashboard", Icon: LayoutDashboard },
  { href: "/app/market", labelKey: "nav.market", Icon: ChartCandlestick },
  { href: "/app/analyze", labelKey: "nav.analyze", Icon: Sparkles },
  { href: "/app/trade", labelKey: "nav.trade", Icon: ShieldCheck },
  { href: "/app/virtual-trade", labelKey: "nav.virtualTrade", Icon: Wallet },
  { href: "/app/dashboard", labelKey: "nav.performance", Icon: ChartLine },
];

const NAV_BOTTOM: NavItem[] = [
  { href: "/app/guide", labelKey: "nav.guide", Icon: BookOpen },
  { href: "/app/settings/notify", labelKey: "nav.settings", Icon: Settings, matchPaths: ["/app/settings"] },
];

const BLOG_URL = "https://victor-alpha-neon.vercel.app/";
const COLLAPSE_KEY = "ag-sidebar-collapsed";

function pathMatches(pathname: string, href: string, extra: string[] = []) {
  if (href === "/app") return pathname === "/app";
  const all = [href, ...extra];
  return all.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { Icon } = item;
  const t = useT();
  const label = t(item.labelKey);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg text-sm transition-colors",
        collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2",
        active
          ? "bg-ring/15 font-semibold text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-[18px] w-[18px] flex-none transition-colors",
          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
        )}
      />
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </Link>
  );
}

function SidebarNav({
  pathname,
  collapsed,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const t = useT();
  const blogLabel = t("nav.blog");
  return (
    <>
      <nav className={cn("flex-1 space-y-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
        {NAV.map((n) => (
          <NavLink
            key={n.href}
            item={n}
            active={pathMatches(pathname, n.href, n.matchPaths)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
      <div className={cn("space-y-1 border-t border-border py-3", collapsed ? "px-2" : "px-3")}>
        {NAV_BOTTOM.map((n) => (
          <NavLink
            key={n.href}
            item={n}
            active={pathMatches(pathname, n.href, n.matchPaths)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
        <a
          href={BLOG_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={collapsed ? blogLabel : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-lg text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
            collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2",
          )}
        >
          <ExternalLink className="h-[18px] w-[18px] flex-none" />
          {!collapsed ? <span className="truncate">{blogLabel}</span> : null}
        </a>
      </div>
    </>
  );
}

/** 아바타 드롭다운 — 계정·지갑·구매·API 키·어드민·로그아웃 */
function UserDropdown({
  email,
  balance,
  credits,
  isAdmin,
}: {
  email: string;
  balance: number;
  credits: number;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    setOpen(false);
    router.replace("/login");
    router.refresh();
  }

  const items = [
    { href: "/app/account", label: t("topbar.account"), Icon: Shield },
    { href: "/app/deposit", label: t("topbar.deposit"), Icon: Coins },
    { href: "/app/credits", label: t("topbar.buyCredits"), Icon: Sparkles },
    { href: "/app/settings/api-keys", label: t("topbar.apiKeys"), Icon: KeyRound },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1 rounded-lg border border-transparent p-1 transition-colors",
          open ? "border-border bg-muted/50" : "hover:border-border hover:bg-muted/30",
        )}
        title={email}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ring/20 text-xs font-semibold text-primary ring-1 ring-ring/40">
          {(email[0] ?? "U").toUpperCase()}
        </span>
        <ChevronDown
          className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[240px] overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
          <div className="border-b border-border px-3 py-2">
            <div className="truncate text-xs text-muted-foreground">{email}</div>
          </div>
          <Link
            href="/app/wallet"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between gap-3 border-b border-border bg-muted/20 px-3 py-2.5 hover:bg-muted/40"
          >
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Coins className="h-3 w-3 text-primary" />
              <span className="font-mono font-bold tabular-nums text-foreground">
                {formatNumber(balance, { maximumFractionDigits: 0 })}
              </span>
              vUSDT
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 text-grade-c" />
              <span className="font-mono font-bold tabular-nums text-foreground">{credits}</span>
              {t("unit.credits")}
            </span>
          </Link>
          {items.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
          {isAdmin ? (
            <Link
              href="/app/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Shield className="h-3.5 w-3.5 text-primary" />
              {t("topbar.admin")}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-sm text-destructive hover:bg-muted"
          >
            <LogOut className="h-3.5 w-3.5" />
            {t("topbar.logout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({
  email,
  balance,
  credits,
  isAdmin = false,
  children,
}: {
  email: string;
  balance: number;
  credits: number;
  isAdmin?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useT();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    setHydrated(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });
  }

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebarWidth = collapsed ? "lg:w-16" : "lg:w-[232px]";
  const contentPad = collapsed ? "lg:pl-16" : "lg:pl-[232px]";

  return (
    <div className="min-h-screen">
      {/* ── 데스크톱 사이드바 ───────────────────────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-sidebar transition-[width] duration-200 lg:flex",
          sidebarWidth,
          !hydrated && "transition-none",
        )}
      >
        <div
          className={cn(
            "relative flex h-14 items-center",
            collapsed ? "justify-center px-0" : "px-6",
          )}
        >
          <Link href="/app" className="flex items-center" title={t("nav.dashboard")}>
            {collapsed ? (
              <Logo size={28} />
            ) : (
              <Wordmark height={18} className="block text-foreground" />
            )}
          </Link>
          {!collapsed ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
              aria-label="사이드바 접기"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {collapsed ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="mx-auto mt-2 rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="사이드바 펼치기"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        ) : null}
        <SidebarNav pathname={pathname} collapsed={collapsed} />
      </aside>

      {/* ── 모바일 드로어 ──────────────────────────────── */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-64 flex-col bg-sidebar shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
              <Link
                href="/app"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2"
              >
                <Wordmark height={16} className="text-foreground" />
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                aria-label="닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarNav
              pathname={pathname}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {/* ── 탑바 + 콘텐츠 ──────────────────────────────── */}
      <div className={cn("transition-[padding] duration-200", contentPad, !hydrated && "transition-none")}>
        <header className="sticky top-0 z-20 bg-background/80 backdrop-blur shadow-[0_6px_20px_-14px_hsl(222_47%_11%/0.30)]">
          <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
              aria-label="메뉴 열기"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/app" className="flex items-center gap-2 lg:hidden">
              <Wordmark height={15} className="text-foreground" />
            </Link>

            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/app/analyze"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{t("topbar.newAnalysis")}</span>
              </Link>
              <LanguageSwitcher className="hidden sm:flex" />
              <Link
                href="/app/wallet"
                className="hidden items-center gap-2.5 rounded-full border border-border bg-card px-3.5 py-1.5 transition-colors hover:bg-card-2 sm:flex"
                title={t("topbar.wallet")}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Coins className="h-3.5 w-3.5 text-primary" />
                  <span className="font-mono text-[13px] font-semibold tabular-nums">
                    {formatNumber(balance, { maximumFractionDigits: 0 })}
                  </span>
                </span>
                <span className="h-3.5 w-px bg-input" />
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-grade-c" />
                  <span className="font-mono text-[13px] font-semibold tabular-nums">{credits}</span>
                </span>
              </Link>
              <Link
                href="/app/settings/notify"
                className="rounded-full border border-border bg-card p-2 text-muted-foreground transition-colors hover:bg-card-2 hover:text-foreground"
                title={t("topbar.notifications")}
              >
                <Bell className="h-4 w-4" />
              </Link>
              <UserDropdown email={email} balance={balance} credits={credits} isAdmin={isAdmin} />
            </div>
          </div>
        </header>
        <main>
          <div className="mx-auto w-full max-w-[1600px] px-4 py-5 lg:px-6 lg:py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
