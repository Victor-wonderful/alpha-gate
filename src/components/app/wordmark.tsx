import { cn } from "@/lib/utils";

/**
 * VECTA wordmark — custom angular letterforms (from vecta-website.pen: C/Wordmark-v4).
 * Fills with `currentColor`, so set the text color at the call site
 * (e.g. `text-white` on dark surfaces, `text-foreground` on light).
 * Aspect ratio ≈ 5.224 : 1 (viewBox 522.4 × 100).
 */
export function Wordmark({
  height = 18,
  className,
}: {
  height?: number;
  className?: string;
}) {
  const width = Math.round(height * 5.224 * 100) / 100;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 522.4 100"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="VECTA"
      className={cn("flex-none", className)}
    >
      <path d="M0 0l21.4 0 35.1 79 35-79 21.5 0-47.2 100-17.9 0z" />
      <path
        transform="translate(119.2 0)"
        d="M18.3 0l65.2 0 0 18.75-77.9 0z m-18.3 43.3l82 0 0 16.1-82 0z m6.3 25.5l17.8 0 15.2 15.1 43.7 0-1.3 16.1-44.6 0z"
      />
      <path
        transform="translate(222.3 0)"
        d="M90.2 0l-54 0a36.2 48 0 0 0-36.2 48l0 4a36.2 48 0 0 0 36.2 48l54 0 0-16.1-52.2 0a21 30 0 0 1-20.6-31.9l0-4a21 30 0 0 1 20.6-27.9l52.2 0z"
      />
      <path
        transform="translate(331.7 0)"
        d="M0 0l87 0 0 18.75-35.2 0 0 81.25-17 0 0-81.25-34.8 0z"
      />
      <path
        transform="translate(406.7 0)"
        d="M45.5 0l24.1 0 45.1 100-17.8 0-39.5-79.9-40 79.9-17.4 0z m11.6 74.5l-0.8 25.5-12.5 0z"
      />
    </svg>
  );
}
