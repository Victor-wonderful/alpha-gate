"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Coins,
  ExternalLink,
  Gamepad2,
  Home,
  KeyRound,
  LineChart,
  LogOut,
  Menu,
  Settings,
  Settings2,
  Sparkles,
  Trophy,
  User,
  Wallet,
  X,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { useUiModeStore } from "@/lib/stores/ui-mode-store";

type IconKey = "home" | "sparkles" | "check" | "book" | "chart" | "bell" | "key" | "wallet" | "gamepad" | "coins" | "trophy";

type NavItem = {
  href: string;
  label: string;
  icon: IconKey;
};

const ICONS: Record<IconKey, React.ComponentType<{ className?: string }>> = {
  home: Home,
  sparkles: Sparkles,
  check: CheckCircle2,
  book: BookOpen,
  chart: LineChart,
  bell: Bell,
  key: KeyRound,
  wallet: Wallet,
  gamepad: Gamepad2,
  coins: Coins,
  trophy: Trophy,
};

const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "홈", icon: "home" },
  { href: "/app/analyze", label: "AI 분석", icon: "sparkles" },
  { href: "/app/trade", label: "주문 검토", icon: "check" },
  { href: "/app/virtual-trade", label: "가상 트레이딩", icon: "wallet" },
  { href: "/app/game", label: "가격 예측 게임", icon: "gamepad" },
  { href: "/app/journal", label: "내 거래", icon: "book" },
  { href: "/app/dashboard", label: "성과 분석", icon: "chart" },
  { href: "/app/rankings", label: "랭킹", icon: "trophy" },
  { href: "/app/wallet", label: "내 지갑", icon: "coins" },
];

const SETTINGS_ITEMS: NavItem[] = [
  { href: "/app/deposit", label: "vUSDT 충전", icon: "coins" },
  { href: "/app/credits", label: "AI 크레딧", icon: "sparkles" },
  { href: "/app/settings/notify", label: "알림 설정", icon: "bell" },
  { href: "/app/settings/api-keys", label: "거래소 API 키", icon: "key" },
];

const BLOG_URL = "https://victor-alpha-neon.vercel.app/";

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLinkInline({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  const Icon = ICONS[item.icon];
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "group relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4",
          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
        )}
      />
      <span>{item.label}</span>
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
  const anyActive = SETTINGS_ITEMS.some((i) => isActive(pathname, i.href));
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
          anyActive
            ? "bg-primary/10 text-foreground"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
      >
        <Settings className="h-4 w-4" />
        <span>설정</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full mt-1 min-w-[180px] overflow-hidden rounded-md border border-border bg-popover shadow-xl">
          {SETTINGS_ITEMS.map((s) => {
            const Icon = ICONS[s.icon];
            const active = isActive(pathname, s.href);
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

function UiModeToggle() {
  const { mode, toggle } = useUiModeStore();
  const isBeginner = mode === "beginner";
  return (
    <button
      type="button"
      onClick={toggle}
      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
    >
      {isBeginner ? <Settings2 className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
      {isBeginner ? "고급 모드로 전환" : "초보 모드로 전환"}
    </button>
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
          "flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors",
          open ? "border-border bg-muted/50" : "hover:border-border hover:bg-muted/30",
        )}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-primary/10 text-xs font-semibold ring-1 ring-primary/30">
          {(email[0] ?? "U").toUpperCase()}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full mt-1 min-w-[220px] overflow-hidden rounded-md border border-border bg-popover shadow-xl">
          <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
            {email}
          </div>
          <Link
            href="/app"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
          >
            <User className="h-3.5 w-3.5" />
            내 홈
          </Link>
          <UiModeToggle />
          <a
            href={BLOG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
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
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  email: string;
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
      <div className="absolute left-0 top-0 h-full w-64 bg-gradient-to-b from-card to-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <Link href="/app" onClick={onClose} className="flex items-center gap-2">
            <Logo size={24} />
            <span className="font-bold tracking-tight">Alpha Gate</span>
          </Link>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((n) => {
            const Icon = ICONS[n.icon];
            const active = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
                  active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                {n.label}
              </Link>
            );
          })}
          <div className="border-t border-border/60 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-3">설정</div>
          {SETTINGS_ITEMS.map((s) => {
            const Icon = ICONS[s.icon];
            const active = isActive(pathname, s.href);
            return (
              <Link
                key={s.href}
                href={s.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
                  active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                {s.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-border p-3">
          <a
            href={BLOG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            <span>Victor Alpha 블로그</span>
            <ExternalLink className="h-3 w-3" />
          </a>
          <div className="px-3 py-1 text-xs text-muted-foreground">{email}</div>
          <UiModeToggle />
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

export function TopNav({ email }: { email: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-4 px-4 lg:px-6">
          {/* Logo */}
          <Link href="/app" className="flex items-center gap-2 shrink-0">
            <Logo size={26} />
            <div className="hidden sm:block">
              <div className="text-sm font-bold leading-tight tracking-tight">Alpha Gate</div>
              <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70 leading-tight">
                매매 전 의사결정 체크
              </div>
            </div>
          </Link>

          {/* Main nav (desktop) */}
          <nav className="hidden flex-1 items-center gap-1 lg:flex">
            {NAV_ITEMS.map((n) => (
              <NavLinkInline key={n.href} item={n} active={isActive(pathname, n.href)} />
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
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

      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} pathname={pathname} email={email} />
    </>
  );
}
