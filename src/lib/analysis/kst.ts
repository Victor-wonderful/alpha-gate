/**
 * KST datetime-local 입력값 처리.
 *
 * datetime-local 인풋의 value는 timezone 없는 "yyyy-MM-ddTHH:mm" 문자열.
 * VECTA는 한국 시장 기준이므로 이 문자열을 무조건 KST(UTC+9)로 해석.
 * (사용자 PC가 어느 timezone이든 같은 결과)
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** "2026-05-27T14:30" (KST) → Date (UTC 시각) */
export function kstStringToDate(kstStr: string): Date {
  // 끝에 Z 없이 그대로 파싱하면 브라우저 로컬 timezone으로 해석됨 → 명시적으로 KST 처리
  const [datePart, timePart] = kstStr.split("T");
  if (!datePart || !timePart) return new Date(NaN);
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  if (!y || !m || !d) return new Date(NaN);
  // Date.UTC로 만든 후 KST 오프셋 빼면 실제 UTC ms
  const utcMs = Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0) - KST_OFFSET_MS;
  return new Date(utcMs);
}

/** Date → "yyyy-MM-ddTHH:mm" (KST 기준) */
export function dateToKstString(d: Date): string {
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

/** "N일/시간 전" KST 문자열 */
export function kstStringAgo(opts: { hours?: number; days?: number }): string {
  const ms = (opts.hours ?? 0) * 60 * 60 * 1000 + (opts.days ?? 0) * 24 * 60 * 60 * 1000;
  return dateToKstString(new Date(Date.now() - ms));
}

/** Binance 무료 API 한계인 ~6개월 안에서 무작위 시점 (블라인드 백테스트용) */
export function randomKstStringWithin6Months(): string {
  const now = Date.now();
  const sixMonthsMs = 180 * 24 * 60 * 60 * 1000;
  // 최소 1일 전 ~ 최대 6개월 전 (너무 최근이면 forward 봉 부족)
  const minMs = 1 * 24 * 60 * 60 * 1000;
  const offsetMs = minMs + Math.random() * (sixMonthsMs - minMs);
  return dateToKstString(new Date(now - offsetMs));
}
