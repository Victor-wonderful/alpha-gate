import { cn } from "@/lib/utils";

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  const id = `ag-grad-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Alpha Gate"
      className={cn("flex-none", className)}
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(199 95% 62%)" />
          <stop offset="55%" stopColor="hsl(212 92% 52%)" />
          <stop offset="100%" stopColor="hsl(228 90% 42%)" />
        </linearGradient>
      </defs>

      {/* Back chevron (lighter, offset down — depth) */}
      <path
        d="M 32 22 L 60 58 L 32 50 L 4 58 Z"
        fill={`url(#${id})`}
        opacity="0.4"
      />

      {/* Front chevron (solid, leading) */}
      <path d="M 32 6 L 52 38 L 32 30 L 12 38 Z" fill={`url(#${id})`} />
    </svg>
  );
}
