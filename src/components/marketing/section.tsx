import { cn } from "@/lib/utils";

export type GlowPosition =
  | "top"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "right"
  | "left";

export function SectionShell({
  children,
  glowPosition,
  className,
  innerClassName,
}: {
  children: React.ReactNode;
  glowPosition?: GlowPosition;
  className?: string;
  innerClassName?: string;
}) {
  const glowClass: Record<string, string> = {
    top: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/3",
    "top-left": "left-0 top-0 -translate-y-1/3",
    "top-right": "right-0 top-0 -translate-y-1/3",
    "bottom-left": "left-0 bottom-0 translate-y-1/3",
    "bottom-right": "right-0 bottom-0 translate-y-1/3",
    right: "right-0 top-1/2 translate-x-1/3 -translate-y-1/2",
    left: "left-0 top-1/2 -translate-x-1/3 -translate-y-1/2",
  };
  return (
    <section className={cn("relative overflow-hidden border-t border-white/[0.06]", className)}>
      {glowPosition && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute h-[600px] w-[900px] rounded-full bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.10),transparent_70%)] blur-3xl",
            glowClass[glowPosition],
          )}
        />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(186,230,253,0.5) 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      />
      <div className={cn("relative mx-auto max-w-6xl px-6 py-32 sm:px-10", innerClassName)}>
        {children}
      </div>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  body,
  align = "center",
}: {
  eyebrow: string;
  title: React.ReactNode;
  body?: React.ReactNode;
  align?: "center" | "left";
}) {
  const alignCls = align === "center" ? "mx-auto text-center" : "text-left";
  return (
    <div className={cn("max-w-2xl", alignCls)}>
      <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400">
        <span className="inline-block h-px w-8 bg-cyan-400" />
        {eyebrow}
      </div>
      <h2 className="mt-5 text-3xl font-bold leading-[1.15] sm:text-5xl">{title}</h2>
      {body && (
        <p
          className={cn(
            "mt-6 max-w-xl text-base leading-relaxed text-white/55",
            align === "center" && "mx-auto",
          )}
        >
          {body}
        </p>
      )}
    </div>
  );
}

/** Standard glowing dark card. Use for content rows on sub-pages. */
export function GlowCard({
  children,
  className,
  hover = true,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-[#091632]/70 via-[#06112a]/60 to-[#040b1d]/80 p-7 backdrop-blur-xl transition-all",
        hover &&
          "hover:border-cyan-400/40 hover:shadow-[0_30px_80px_-20px_rgba(56,189,248,0.35)]",
        className,
      )}
    >
      {hover && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-10 -top-16 h-32 bg-gradient-to-b from-cyan-400/10 to-transparent opacity-0 blur-2xl transition-opacity group-hover:opacity-100"
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

/** Gradient text helper for inline title accents. */
export function GradientText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Icon badge — cyan rounded square. */
export function IconBadge({
  icon: Icon,
  size = "md",
}: {
  icon: React.ComponentType<{ className?: string }>;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "h-10 w-10",
    md: "h-12 w-12",
    lg: "h-14 w-14",
  };
  const icons = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-6 w-6" };
  return (
    <div
      className={cn(
        "flex flex-none items-center justify-center rounded-xl border border-cyan-500/30 bg-gradient-to-br from-sky-500/15 to-blue-600/10 text-cyan-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
        sizes[size],
      )}
    >
      <Icon className={icons[size]} />
    </div>
  );
}
