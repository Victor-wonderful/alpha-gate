// Macro calendar — manually curated. Update monthly.
// Event types we track: FOMC, CPI, PPI, Unemployment (NFP/실업률/주간 청구건수)
//
// All times in KST (Asia/Seoul). Dates are ISO with +09:00.
// Sources for scheduling: BLS release schedule, FOMC official meeting calendar.

export type MacroEvent = {
  /** ISO datetime in KST, e.g. 2026-05-13T21:30:00+09:00 */
  startsAt: string;
  /** Korean label */
  title: string;
  /** Short type tag */
  kind: "FOMC" | "CPI" | "PPI" | "고용";
  /** Impact level */
  impact: "high" | "med";
  /** Optional consensus / previous note */
  note?: string;
};

// Edit this list each month.
export const MACRO_EVENTS: MacroEvent[] = [
  {
    startsAt: "2026-05-13T21:30:00+09:00",
    title: "美 4월 소비자물가지수 (CPI)",
    kind: "CPI",
    impact: "high",
    note: "예상 전월대비 +0.3% / 전년대비 +3.1%",
  },
  {
    startsAt: "2026-05-14T21:30:00+09:00",
    title: "美 4월 생산자물가지수 (PPI)",
    kind: "PPI",
    impact: "med",
  },
  {
    startsAt: "2026-05-15T21:30:00+09:00",
    title: "美 주간 신규 실업수당 청구건수",
    kind: "고용",
    impact: "med",
  },
  {
    startsAt: "2026-05-21T03:00:00+09:00",
    title: "FOMC 5월 회의 의사록 공개",
    kind: "FOMC",
    impact: "high",
  },
  {
    startsAt: "2026-06-06T21:30:00+09:00",
    title: "美 5월 비농업 고용 · 실업률 (NFP)",
    kind: "고용",
    impact: "high",
  },
  {
    startsAt: "2026-06-11T21:30:00+09:00",
    title: "美 5월 소비자물가지수 (CPI)",
    kind: "CPI",
    impact: "high",
  },
  {
    startsAt: "2026-06-18T03:00:00+09:00",
    title: "FOMC 6월 금리 결정 · 점도표",
    kind: "FOMC",
    impact: "high",
  },
];

export type UpcomingEvent = MacroEvent & {
  daysUntil: number; // 0 = today, positive = future
  hourStr: string; // "21:30" KST
  dateStr: string; // "5월 13일 (화)"
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function nowKstStartOfDayMs(): number {
  const nowUtc = Date.now();
  const kstNow = nowUtc + KST_OFFSET_MS;
  return Math.floor(kstNow / 86_400_000) * 86_400_000;
}

export function getUpcomingMacroEvents(limit = 6): UpcomingEvent[] {
  const todayKstMs = nowKstStartOfDayMs();
  return MACRO_EVENTS.map((e) => {
    const eventMs = new Date(e.startsAt).getTime();
    const eventKstMs = eventMs + KST_OFFSET_MS;
    const eventDay = Math.floor(eventKstMs / 86_400_000) * 86_400_000;
    const daysUntil = Math.round((eventDay - todayKstMs) / 86_400_000);
    const d = new Date(eventMs);
    // Format in KST
    const kst = new Date(d.getTime() + KST_OFFSET_MS);
    const month = kst.getUTCMonth() + 1;
    const day = kst.getUTCDate();
    const dow = DOW[kst.getUTCDay()];
    const hh = String(kst.getUTCHours()).padStart(2, "0");
    const mm = String(kst.getUTCMinutes()).padStart(2, "0");
    return {
      ...e,
      daysUntil,
      hourStr: `${hh}:${mm}`,
      dateStr: `${month}월 ${day}일 (${dow})`,
    };
  })
    .filter((e) => e.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, limit);
}
