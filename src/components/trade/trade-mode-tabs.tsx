"use client";

import { useState } from "react";
import { ShieldCheck, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

/** 자동매매 페이지의 수동/자동 전환 탭. 서버에서 렌더한 두 슬롯을 받아 하나만 보여준다.
 *  분석에서 넘어오면(prefill) 수동, 메뉴 직접 클릭이면 자동으로 시작한다. */
export function TradeModeTabs({
  manual,
  auto,
  defaultMode = "auto",
}: {
  manual: React.ReactNode;
  auto: React.ReactNode;
  defaultMode?: "manual" | "auto";
}) {
  const [mode, setMode] = useState<"manual" | "auto">(defaultMode);
  return (
    <div className="space-y-4">
      <div className="inline-flex gap-1 rounded-lg border border-border bg-background/40 p-0.5">
        <Tab active={mode === "manual"} onClick={() => setMode("manual")} icon={<ShieldCheck className="h-4 w-4" />} label="수동 실행" />
        <Tab active={mode === "auto"} onClick={() => setMode("auto")} icon={<Bot className="h-4 w-4" />} label="자동매매" />
      </div>
      <div className={mode === "manual" ? "" : "hidden"}>{manual}</div>
      <div className={mode === "auto" ? "" : "hidden"}>{auto}</div>
    </div>
  );
}

function Tab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
