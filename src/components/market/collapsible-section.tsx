"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 접이식 섹션 — 시장 현황 페이지용.
 * 헤더에 "이 섹션이 뭔지" 한 줄 설명 + 갱신 주기 배지를 함께 노출하고,
 * 접힘 상태는 localStorage에 사용자별로 저장한다. (시안: Section/Collapse-Header)
 */
export function CollapsibleSection({
  storageKey,
  title,
  desc,
  freq,
  defaultOpen = true,
  children,
}: {
  /** localStorage 키 접미사 (예: "sessions") */
  storageKey: string;
  title: string;
  /** 섹션 설명 한 줄 — 처음 보는 사용자를 위한 안내 */
  desc: string;
  /** 갱신 주기 라벨 (예: "실시간", "10분") */
  freq?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const key = `ag-market-sec-${storageKey}`;
  const [open, setOpen] = useState(defaultOpen);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(key);
    if (saved != null) setOpen(saved === "1");
    setHydrated(true);
  }, [key]);

  function toggle() {
    setOpen((o) => {
      localStorage.setItem(key, o ? "0" : "1");
      return !o;
    });
  }

  return (
    <section>
      <button
        type="button"
        onClick={toggle}
        className="group flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-muted/30"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-none text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="hidden min-w-0 flex-1 truncate text-[11px] text-muted-foreground/70 sm:block">
          {desc}
        </span>
        {freq ? (
          <span className="ml-auto flex-none rounded-full bg-muted/50 px-2 py-0.5 font-mono text-[9px] text-muted-foreground sm:ml-0">
            {freq}
          </span>
        ) : null}
      </button>
      <div className={cn("mt-3", !hydrated && !defaultOpen && "hidden", !open && "hidden")}>
        {children}
      </div>
    </section>
  );
}
