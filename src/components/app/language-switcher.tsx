"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { useLocale } from "@/lib/i18n/context";
import { setLocaleAction } from "@/app/locale-actions";
import { cn } from "@/lib/utils";

/** 탑바 언어 토글 (KO | EN). 쿠키 설정 후 router.refresh()로 서버 컴포넌트 재렌더. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTo(locale: Locale) {
    if (locale === current || pending) return;
    startTransition(async () => {
      await setLocaleAction(locale);
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-md border border-border bg-background/60 p-0.5 text-[11px] font-semibold",
        className,
      )}
    >
      {LOCALES.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => switchTo(loc)}
          disabled={pending}
          aria-pressed={current === loc}
          className={cn(
            "rounded px-1.5 py-0.5 uppercase transition-colors disabled:opacity-60",
            current === loc
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {loc}
        </button>
      ))}
    </div>
  );
}
