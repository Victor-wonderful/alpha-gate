import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { createTranslator, getCatalog, type TFunction } from "./messages";

/** 쿠키에서 현재 locale을 읽는다. 없으면 기본값(ko). */
export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : DEFAULT_LOCALE;
}

/** 서버 컴포넌트/액션용 번역 함수. */
export async function getT(): Promise<TFunction> {
  const locale = await getLocale();
  return createTranslator(getCatalog(locale));
}
