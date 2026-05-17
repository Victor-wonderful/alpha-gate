import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number, opts: Intl.NumberFormatOptions = {}) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4, ...opts }).format(n);
}

export function formatCurrency(n: number, currency: "USD" | "KRW" = "USD") {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "KRW" ? 0 : 2,
  }).format(n);
}

export function formatPercent(n: number, digits = 1) {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}
