// 메시지 카탈로그 + 번역 함수 팩토리 — 클라이언트/서버 공용.
import ko from "@/messages/ko.json";
import en from "@/messages/en.json";
import type { Locale } from "./config";

export type Messages = typeof ko;

const CATALOGS: Record<Locale, Messages> = { ko, en } as Record<Locale, Messages>;

export function getCatalog(locale: Locale): Messages {
  return CATALOGS[locale] ?? CATALOGS.ko;
}

export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

/** 점(.) 구분 키로 중첩 메시지를 찾고 `{var}` 치환. 누락 시 키 문자열 반환. */
export function createTranslator(messages: Messages): TFunction {
  return (key, vars) => {
    const val = key
      .split(".")
      .reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), messages);
    let str = typeof val === "string" ? val : key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return str;
  };
}
