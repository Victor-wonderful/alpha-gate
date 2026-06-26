"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { TFunction } from "@/lib/i18n/messages";

interface Bucket {
  icon: string;
  title: string;
  desc: string;
  items: string[];
}

function buildBuckets(t: TFunction): Bucket[] {
  return [
    {
      icon: "📈",
      title: t("analyze.cmpA.bucket1Title"),
      desc: t("analyze.cmpA.bucket1Desc"),
      items: [
        t("analyze.cmpA.bucket1Item1"),
        t("analyze.cmpA.bucket1Item2"),
        t("analyze.cmpA.bucket1Item3"),
        t("analyze.cmpA.bucket1Item4"),
        t("analyze.cmpA.bucket1Item5"),
      ],
    },
    {
      icon: "🧱",
      title: t("analyze.cmpA.bucket2Title"),
      desc: t("analyze.cmpA.bucket2Desc"),
      items: [
        t("analyze.cmpA.bucket2Item1"),
        t("analyze.cmpA.bucket2Item2"),
        t("analyze.cmpA.bucket2Item3"),
        t("analyze.cmpA.bucket2Item4"),
        t("analyze.cmpA.bucket2Item5"),
        t("analyze.cmpA.bucket2Item6"),
      ],
    },
    {
      icon: "💰",
      title: t("analyze.cmpA.bucket3Title"),
      desc: t("analyze.cmpA.bucket3Desc"),
      items: [
        t("analyze.cmpA.bucket3Item1"),
        t("analyze.cmpA.bucket3Item2"),
        t("analyze.cmpA.bucket3Item3"),
        t("analyze.cmpA.bucket3Item4"),
        t("analyze.cmpA.bucket3Item5"),
        t("analyze.cmpA.bucket3Item6"),
      ],
    },
    {
      icon: "🌍",
      title: t("analyze.cmpA.bucket4Title"),
      desc: t("analyze.cmpA.bucket4Desc"),
      items: [
        t("analyze.cmpA.bucket4Item1"),
        t("analyze.cmpA.bucket4Item2"),
        t("analyze.cmpA.bucket4Item3"),
        t("analyze.cmpA.bucket4Item4"),
        t("analyze.cmpA.bucket4Item5"),
      ],
    },
  ];
}

export function AnalysisInfo() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const BUCKETS = buildBuckets(t);

  return (
    <div className="rounded-lg border border-border bg-background/30">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
      >
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">{t("analyze.cmpA.infoHeading")}</span>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border px-4 py-4 text-sm">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("analyze.cmpA.infoIntro")}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {BUCKETS.map((b) => (
              <div key={b.title} className="rounded-md border border-border bg-background/40 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">{b.icon}</span>
                  <span className="text-sm font-semibold">{b.title}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{b.desc}</p>
                <ul className="mt-2 space-y-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {b.items.map((item, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="mt-0.5 inline-block h-1 w-1 flex-none rounded-full bg-primary/60" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <strong className="text-foreground">{t("analyze.cmpA.pipelineTitle")}</strong>
            <ol className="mt-1 space-y-0.5">
              <li>① <strong className="text-foreground">{t("analyze.cmpA.pipelineStep1Label")}</strong> — {t("analyze.cmpA.pipelineStep1Desc")}</li>
              <li>② <strong className="text-foreground">{t("analyze.cmpA.pipelineStep2Label")}</strong> — {t("analyze.cmpA.pipelineStep2Desc")}</li>
              <li>③ <strong className="text-foreground">{t("analyze.cmpA.pipelineStep3Label")}</strong> — {t("analyze.cmpA.pipelineStep3Desc")}</li>
            </ol>
          </div>
        </div>
      ) : null}
    </div>
  );
}
