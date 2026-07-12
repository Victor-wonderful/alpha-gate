import { cn } from "@/lib/utils";

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  const id = `vecta-grad-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 92"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="VECTA"
      className={cn("flex-none", className)}
    >
      <defs>
        <linearGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="100"
          y2="92"
        >
          <stop offset="0%" stopColor="#38C6E0" />
          <stop offset="50%" stopColor="#2E8FFF" />
          <stop offset="100%" stopColor="#7A5CFF" />
        </linearGradient>
      </defs>

      {/* Hollow triangle (A-mark) */}
      <path
        d="M50 0l50 86-100 0z m0 24l29 50-58 0z"
        fill={`url(#${id})`}
        fillRule="evenodd"
      />

      {/* Ascending arrow crossing the mark */}
      <path
        d="M4.1 88.1l57-57-7.4-7.4 28.3-5.7-5.7 28.3-7.4-7.4-57 57z"
        fill={`url(#${id})`}
      />
    </svg>
  );
}
