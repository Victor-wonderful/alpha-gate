import Link from "next/link";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Common layout for /app/guide/* subpages: breadcrumb + intro + content slot.
 *  Keeps spacing/typography consistent across the four guide subpages. */
export function GuideSubpageLayout({
  category,
  title,
  description,
  children,
  next,
}: {
  category: string;
  title: string;
  description: string;
  children: React.ReactNode;
  next?: { href: string; label: string };
}) {
  return (
    <div className="mx-auto max-w-[900px] space-y-14 px-1 py-4">
      <div>
        <Link
          href="/app/guide"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          사용 방법 목록
        </Link>
      </div>

      <section className="space-y-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">{category}</div>
        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight">{title}</h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">{description}</p>
      </section>

      {children}

      {next ? (
        <section className="border-t border-border/60 pt-6">
          <Link
            href={next.href}
            className="group flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/30 px-6 py-4 transition-colors hover:bg-card/60"
          >
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">다음 가이드</div>
              <div className="mt-0.5 text-sm font-semibold">{next.label}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
          </Link>
        </section>
      ) : null}
    </div>
  );
}

/** Section header used inside guide subpages. */
export function GuideSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      {eyebrow ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</div>
      ) : null}
      <h2 className="text-2xl font-bold leading-[1.15] tracking-tight">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** Collapsible FAQ row. */
export function GuideFaq({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer items-center justify-between py-4">
        <span className="text-sm font-medium">{question}</span>
        <Plus className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-45" />
      </summary>
      <div className="max-w-2xl pb-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </details>
  );
}

/** Small chip used for meta info under step / section titles. */
export function GuideChip({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "primary" | "warn" | "good";
  children: React.ReactNode;
}) {
  const toneStyles = {
    muted: "border-border bg-card/40 text-muted-foreground",
    primary: "border-primary/30 bg-primary/5 text-primary",
    warn: "border-grade-c/30 bg-grade-c/5 text-grade-c",
    good: "border-grade-a/30 bg-grade-a/5 text-grade-a",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
        toneStyles[tone],
      )}
    >
      {children}
    </span>
  );
}
