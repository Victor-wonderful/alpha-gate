"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Home,
  LineChart,
  LogOut,
  Menu,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

type IconKey = "home" | "sparkles" | "check" | "book" | "chart" | "bell";

export type SidebarItem = {
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
};

const MAIN: SidebarItem[] = [{ href: "/app", label: "홈", icon: "home" }];

const TRADE: SidebarItem[] = [
  { href: "/app/analyze", label: "AI 분석", icon: "sparkles" },
  { href: "/app/trade", label: "주문 검토", icon: "check" },
];

const REVIEW: SidebarItem[] = [
  { href: "/app/journal", label: "내 거래", icon: "book" },
  { href: "/app/dashboard", label: "성과 분석", icon: "chart" },
];

const SETTINGS: SidebarItem[] = [{ href: "/app/settings/notify", label: "알림 설정", icon: "bell" }];

const BLOG_URL = "https://victor-alpha-neon.vercel.app/";

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: SidebarItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = ICONS[item.icon];
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full bg-primary"
          style={{ width: 3 }}
        />
      ) : null}
      <Icon
        className={cn(
          "h-4 w-4 transition-colors",
          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
        )}
      />
      <span className="flex-1 truncate">{item.label}</span>
    </Link>
  );
}

function NavGroup({
  label,
  items,
  pathname,
  onNavigate,
}: {
  label?: string;
  items: SidebarItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const isActive = (href: string) =>
    href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(href + "/");
  return (
    <div>
      {label ? (
        <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
          {label}
        </div>
      ) : null}
      <ul className="space-y-0.5">
        {items.map((n) => (
          <li key={n.href}>
            <NavLink item={n} active={isActive(n.href)} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function UserBlock({ email, onAfterAction }: { email: string; onAfterAction?: () => void }) {
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
    onAfterAction?.();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors",
          open
            ? "border-border bg-muted/50"
            : "hover:border-border hover:bg-muted/30",
        )}
      >
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-primary/10 text-xs font-semibold ring-1 ring-primary/30">
          {(email[0] ?? "U").toUpperCase()}
        </span>
        <span className="flex-1 truncate text-xs text-muted-foreground">{email}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-md border border-border bg-popover shadow-xl">
          <Link
            href="/app"
            onClick={() => {
              setOpen(false);
              onAfterAction?.();
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
          >
            <User className="h-3.5 w-3.5" />내 홈
          </Link>
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

function SidebarContent({ email, onNavigate }: { email: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-card to-background">
      <div className="border-b border-border px-4 py-4">
        <Link href="/app" onClick={onNavigate} className="flex items-center gap-2.5">
          <Logo size={28} />
          <div>
            <div className="text-[15px] font-bold leading-tight tracking-tight">Alpha Gate</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
              매매 전 의사결정 체크
            </div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        <NavGroup items={MAIN} pathname={pathname} onNavigate={onNavigate} />
        <NavGroup label="진입 전" items={TRADE} pathname={pathname} onNavigate={onNavigate} />
        <NavGroup label="진입 후" items={REVIEW} pathname={pathname} onNavigate={onNavigate} />
        <NavGroup label="설정" items={SETTINGS} pathname={pathname} onNavigate={onNavigate} />
      </nav>

      <div className="space-y-2 border-t border-border p-3">
        <a
          href={BLOG_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <span>Victor Alpha 블로그</span>
          <ExternalLink className="h-3 w-3" />
        </a>
        <UserBlock email={email} onAfterAction={onNavigate} />
      </div>
    </div>
  );
}

export function Sidebar({ email }: { email: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur lg:hidden">
        <Link href="/app" className="flex items-center gap-2">
          <Logo size={24} />
          <span className="font-bold tracking-tight">Alpha Gate</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-muted-foreground hover:bg-muted"
          aria-label="메뉴 열기"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r border-border lg:flex lg:flex-col">
        <SidebarContent email={email} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 shadow-2xl">
            <div className="absolute right-2 top-3 z-10">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                aria-label="닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent email={email} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
