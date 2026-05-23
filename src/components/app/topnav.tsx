"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Bell,
  ChevronDown,
  Coins,
  ExternalLink,
  KeyRound,
  LineChart,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { cn, formatNumber } from "@/lib/utils";
import { Logo } from "./logo";

type IconKey = "activity" | "sparkles" | "wallet" | "chart";

type NavItem = {
  href: string;
  label: string;
  icon: IconKey;
  /** Other paths that should mark this item as active (cluster siblings). */
  matchPaths?: string[];
};

const ICONS: Record<IconKey, React.ComponentType<{ className?: string }>> = {
  activity: Activity,
  sparkles: Sparkles,
  wallet: Wallet,
  chart: LineChart,
};

const NAV_ITEMS: NavItem[] = [
  { href: "/app/market", label: "시장", icon: "activity" },
  { href: "/app/analyze", label: "분석", icon: "sparkles", matchPaths: ["/app/trade"] },
  {
    href: "/app/virtual-trade",
    label: "트레이딩",
    icon: "wallet",
    matchPaths: ["/app/game"],
  },
  {
    href: "/app/journal",
    label: "내 결과",
    icon: "chart",
    matchPaths: ["/app/dashboard", "/app/rankings"],
  },
];

const SETTINGS_ITEMS = [
  { href: "/app/deposit", label: "vUSDT 충전", icon: Coins, group: "billing" as const },
  { href: "/app/credits", label: "AI 크레딧 구매", icon: Sparkles, group: "billing" as const },
  { href: "/app/settings/notify", label: "알림 설정", icon: Bell, group: "settings" as const },
  { href: "/app/settings/api-keys", label: "거래소 API 키", icon: KeyRound, group: "settings" as const },
];

const BLOG_URL = "https://victor-alpha-neon.vercel.app/";

function pathMatches(pathname: string, href: string, extra: string[] = []) {
  const all = [href, ...extra];
  return all.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function NavLinkInline({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  const Icon = ICONS[item.icon];
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "group relative inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
      <span>{item.label}</span>
    </Link>
  );
}

/** Live status chip in the header — clicks through to /app/wallet. Always shows
 *  current vUSDT balance + AI credit count, so users see their resources from
 *  every screen (game, trading, analyze) without needing a separate menu trip. */
function WalletChip({
  balance,
  credits,
}: {
  balance: number;
  credits: number;
}) {
  return (
    <Link
      href="/app/wallet"
      className="hidden lg:inline-flex items-center gap-2.5 rounded-md border border-border bg-background/40 px-3 py-1.5 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
      title="내 지갑으로 이동"
    >
      <span className="inline-flex items-center gap-1">
        <Coins className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono font-semibold tabular-nums text-foreground">
          {formatNumber(balance, { maximumFractionDigits: 0 })}
        </span>
        <span className="text-[10px] text-muted-foreground">vUSDT</span>
      </span>
      <span className="h-3 w-px bg-border" />
      <span className="inline-flex items-center gap-1">
        <Sparkles className="h-3.5 w-3.5 text-amber-400" />
        <span className="font-mono font-semibold tabular-nums text-foreground">{credits}</span>
        <span className="text-[10px] text-muted-foreground">AI</span>
      </span>
    </Link>
  );
}

function SettingsDropdown({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);
  const anyActive = SETTINGS_ITEMS.some((i) => pathMatches(pathname, i.href));
  const billing = SETTINGS_ITEMS.filter((i) => i.group === "billing");
  const settings = SETTINGS_ITEMS.filter((i) => i.group === "settings");
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1 rounded-md p-2 text-sm transition-colors",
          anyActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
        title="설정"
      >
        <Settings className="h-4 w-4" />
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full mt-1 min-w-[220px] overflow-hidden rounded-md border border-border bg-popover shadow-xl">
          <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            구매
          </div>
          {billing.map((s) => {
            const Icon = s.icon;
            const active = pathMatches(pathname, s.href);
            return (
              <Link
                key={s.href}
                href={s.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm",
                  active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {s.label}
              </Link>
            );
          })}
          <div className="border-y border-border bg-muted/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            환경 설정
          </div>
          {settings.map((s) => {
            const Icon = s.icon;
            const active = pathMatches(pathname, s.href);
            return (
              <Link
                key={s.href}
                href={s.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm",
                  active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {s.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function UserDropdown({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    setOpen(false);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1 rounded-md border border-transparent p-1 transition-colors",
          open ? "border-border bg-muted/50" : "hover:border-border hover:bg-muted/30",
        )}
        title={email}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-primary/10 text-xs font-semibold ring-1 ring-primary/30">
          {(email[0] ?? "U").toUpperCase()}
        </span>
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full mt-1 min-w-[220px] overflow-hidden rounded-md border border-border bg-popover shadow-xl">
          <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground truncate">{email}</div>
          <a
            href={BLOG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            <span className="inline-flex items-center gap-2">
              <ExternalLink className="h-3.5 w-3.5" />
              Victor Alpha 블로그
            </span>
          </a>
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-sm text-destructive hover:bg-muted"
          >
            <LogOut className="h-3.5 w-3.5" />
            로그아웃
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MobileDrawer({
  open,
  onClose,
  pathname,
  email,
  balance,
  credits,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  email: string;
  balance: number;
  credits: number;
}) {
  const router = useRouter();
  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    onClose();
    router.replace("/login");
    router.refresh();
  }
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute left-0 top-0 h-full w-72 bg-gradient-to-b from-card to-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <Link href="/app" onClick={onClose} className="flex items-center gap-2">
            <Logo size={24} />
            <span className="font-bold leading-[1.15]">Alpha Gate</span>
          </Link>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* Wallet status (mobile) */}
        <Link
          href="/app/wallet"
          onClick={onClose}
          className="flex items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3 hover:bg-muted/30"
        >
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">내 지갑</div>
            <div className="mt-0.5 flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1">
                <Coins className="h-3.5 w-3.5 text-primary" />
                <span className="font-mono font-semibold tabular-nums">{formatNumber(balance, { maximumFractionDigits: 0 })}</span>
                <span className="text-[10px] text-muted-foreground">vUSDT</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span className="font-mono font-semibold tabular-nums">{credits}</span>
                <span className="text-[10px] text-muted-foreground">AI</span>
              </span>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground" />
        </Link>

        <nav className="space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((n) => {
            const Icon = ICONS[n.icon];
            const active = pathMatches(pathname, n.href, n.matchPaths);
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
                  active ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                {n.label}
              </Link>
            );
          })}
          <div className="border-t border-border/60 px-3 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            구매
          </div>
          {SETTINGS_ITEMS.filter((i) => i.group === "billing").map((s) => {
            const Icon = s.icon;
            const active = pathMatches(pathname, s.href);
            return (
              <Link
                key={s.href}
                href={s.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                {s.label}
              </Link>
            );
          })}
          <div className="border-t border-border/60 px-3 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            환경 설정
          </div>
          {SETTINGS_ITEMS.filter((i) => i.group === "settings").map((s) => {
            const Icon = s.icon;
            const active = pathMatches(pathname, s.href);
            return (
              <Link
                key={s.href}
                href={s.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                {s.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-border p-3">
          <a
            href={BLOG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            <span>Victor Alpha 블로그</span>
            <ExternalLink className="h-3 w-3" />
          </a>
          <div className="px-3 py-1 text-xs text-muted-foreground truncate">{email}</div>
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-destructive hover:bg-muted/40"
          >
            <LogOut className="h-3.5 w-3.5" />
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}

export function TopNav({
  email,
  balance,
  credits,
}: {
  email: string;
  balance: number;
  credits: number;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-4 px-4 lg:px-6">
          {/* Logo + brand (clicking = home) */}
          <Link
            href="/app"
            className="group flex items-center gap-2 shrink-0 rounded-md px-1 py-1 transition-colors hover:bg-muted/40"
            title="홈으로"
          >
            <Logo size={26} />
            <div className="leading-[1.15]">
              <div className="text-sm font-bold transition-colors group-hover:text-primary">
                Alpha Gate
              </div>
              <div className="hidden text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70 sm:block">
                매매 전 의사결정 체크
              </div>
            </div>
          </Link>

          {/* Main nav (3 hubs, desktop) */}
          <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
            {NAV_ITEMS.map((n) => (
              <NavLinkInline key={n.href} item={n} active={pathMatches(pathname, n.href, n.matchPaths)} />
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <WalletChip balance={balance} credits={credits} />
            <div className="hidden lg:block">
              <SettingsDropdown pathname={pathname} />
            </div>
            <div className="hidden lg:block">
              <UserDropdown email={email} />
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
              aria-label="메뉴 열기"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <MobileDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        pathname={pathname}
        email={email}
        balance={balance}
        credits={credits}
      />
    </>
  );
}
