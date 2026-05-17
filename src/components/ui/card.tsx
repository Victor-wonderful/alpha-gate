import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-border/80 bg-gradient-to-b from-card to-card-2 text-card-foreground shadow-[0_1px_0_0_hsl(0_0%_100%_/0.04)_inset,0_8px_24px_-12px_hsl(0_0%_0%_/0.5)]",
        className,
      )}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-5", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <h3
      className={cn("text-[15px] font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center p-5 pt-0", className)} {...props} />;
}
