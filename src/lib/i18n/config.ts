// i18n 공용 설정 — 클라이언트/서버 양쪽에서 import 가능 (server-only 의존 없음).
export const LOCALES = ["ko", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ko";
export const LOCALE_COOKIE = "ag_locale";

export const LOCALE_LABEL: Record<Locale, string> = {
  ko: "한국어",
  en: "English",
};

export function isLocale(v: string | null | undefined): v is Locale {
  return v === "ko" || v === "en";
}
