"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { createTranslator, getCatalog, type TFunction } from "./messages";

interface I18nValue {
  locale: Locale;
  t: TFunction;
}

const I18nContext = createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  t: createTranslator(getCatalog(DEFAULT_LOCALE)),
});

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo<I18nValue>(
    () => ({ locale, t: createTranslator(getCatalog(locale)) }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** 클라이언트 컴포넌트용 번역 함수 훅. */
export function useT(): TFunction {
  return useContext(I18nContext).t;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}
