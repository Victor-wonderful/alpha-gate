"use client";

import { useState } from "react";
import { Search, Sparkles, Hand, ArrowRight, ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

/**
 * AI 리서치 "이렇게 진행돼요" — 코인 선택 → AI 리서치 → 직접 결정·거래.
 * 자동매매(봇이 결정)와 달리 3단계 마지막이 "당신"임을 시각적으로 강조.
 * 온보딩 설명이라 접이(아코디언)로 — 처음엔 펼쳐 보이고, 익숙해지면 접어둔다.
 */
export function ResearchHowItWorks() {
  const t = useT();
  const [open, setOpen] = useState(true);

  const steps = [
    {
      icon: Search,
      n: "1",
      title: t("analyze.how.s1title"),
      desc: t("analyze.how.s1desc"),
      you: false,
    },
    {
      icon: Sparkles,
      n: "2",
      title: t("analyze.how.s2title"),
      desc: t("analyze.how.s2desc"),
      you: false,
    },
    {
      icon: Hand,
      n: "3",
      title: t("analyze.how.s3title"),
      desc: t("analyze.how.s3desc"),
      you: true, // "당신" 단계 — 강조
    },
  ];

  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-card p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("analyze.how.heading")}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-none text-muted-foreground transition-transform",
            open ? "rotate-180" : "",
          )}
        />
      </button>

      {!open ? null : (
      <>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {steps.map((s, i) => (
          <div key={s.n} className="flex flex-1 items-stretch gap-2">
            <div
              className={cn(
                "flex-1 rounded-lg border p-3 transition-colors",
                s.you
                  ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                  : "border-border/50 bg-background/40",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px] font-bold",
                    s.you ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {s.n}
                </span>
                <s.icon className={cn("h-4 w-4", s.you ? "text-primary" : "text-muted-foreground")} />
                <span className="text-sm font-bold">{s.title}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.desc}</p>
            </div>

            {/* 단계 사이 화살표 — 데스크톱은 오른쪽, 모바일은 아래로 */}
            {i < steps.length - 1 ? (
              <div className="flex items-center justify-center self-center text-muted-foreground/50">
                <ArrowRight className="hidden h-4 w-4 sm:block" />
                <ArrowRight className="h-4 w-4 rotate-90 sm:hidden" />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <p className="mt-3 border-t border-border/40 pt-2.5 text-xs text-muted-foreground">
        {t("analyze.how.footer")}
      </p>
      </>
      )}
    </div>
  );
}
