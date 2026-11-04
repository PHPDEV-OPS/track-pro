import { addDays, addMonths, addYears, differenceInCalendarDays, format, lastDayOfMonth, startOfISOWeek } from "date-fns";
import { TZDate } from "@date-fns/tz";

// Calendar periods for the history views (spec 0004). Days are YYYY-MM-DD strings in the user's timezone.

export const VIEWS = ["week", "month", "year"] as const;
export type View = (typeof VIEWS)[number];

export type Period = {
  view: View;
  /** week: its Monday (2026-11-02) · month: 2026-10 · year: 2026 */
  key: string;
  start: string;
  end: string;
  days: string[];
  label: string;
};

// Noon avoids any daylight saving edge when doing date arithmetic on plain days.
const d = (day: string) => new Date(`${day}T12:00:00`);
const ymd = (date: Date) => format(date, "yyyy-MM-dd");

export const parseView = (v: unknown): View => (VIEWS.includes(v as View) ? (v as View) : "year");

export const todayIn = (timezone: string) => format(new TZDate(new Date(), timezone), "yyyy-MM-dd");

export function keyFor(view: View, day: string) {
  if (view === "week") return ymd(startOfISOWeek(d(day)));
  if (view === "month") return day.slice(0, 7);
  return day.slice(0, 4);
}

function startOf(view: View, key: string) {
  if (view === "week") return key;
  if (view === "month") return `${key}-01`;
  return `${key}-01-01`;
}

function isValidKey(view: View, raw: string) {
  const re = view === "week" ? /^\d{4}-\d{2}-\d{2}$/ : view === "month" ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}$/;
  if (!re.test(raw)) return false;
  return !Number.isNaN(d(startOf(view, raw)).getTime());
}

/** The requested period, normalized; missing, invalid or future keys fall back to the current one (AC-6). */
export function resolveKey(view: View, raw: unknown, today: string) {
  const current = keyFor(view, today);
  if (typeof raw !== "string" || !isValidKey(view, raw)) return current;
  const key = keyFor(view, startOf(view, raw)); // any day in a week becomes its Monday
  return startOf(view, key) > startOf(view, current) ? current : key;
}

export function shiftKey(view: View, key: string, by: number) {
  const s = d(startOf(view, key));
  const next = view === "week" ? addDays(s, 7 * by) : view === "month" ? addMonths(s, by) : addYears(s, by);
  return keyFor(view, ymd(next));
}

export function periodFor(view: View, key: string): Period {
  const start = startOf(view, key);
  const endDate =
    view === "week" ? addDays(d(start), 6) : view === "month" ? lastDayOfMonth(d(start)) : d(`${key}-12-31`);
  const end = ymd(endDate);
  const n = differenceInCalendarDays(endDate, d(start)) + 1;
  const days = Array.from({ length: n }, (_, i) => ymd(addDays(d(start), i)));
  return { view, key, start, end, days, label: labelFor(view, start, end) };
}

function labelFor(view: View, start: string, end: string) {
  if (view === "year") return start.slice(0, 4);
  if (view === "month") return format(d(start), "MMMM yyyy");
  const s = d(start);
  const e = d(end);
  if (s.getFullYear() !== e.getFullYear()) return `${format(s, "MMM d, yyyy")} to ${format(e, "MMM d, yyyy")}`;
  if (s.getMonth() !== e.getMonth()) return `${format(s, "MMM d")} to ${format(e, "MMM d, yyyy")}`;
  return `${format(s, "MMM d")} to ${format(e, "d, yyyy")}`;
}

/**
 * Days counted for the average and the comparison (AC-4): days so far in the current period,
 * all days in a past one.
 */
export function elapsedDays(p: Period, today: string) {
  if (today < p.start) return 0;
  if (today > p.end) return p.days.length;
  return differenceInCalendarDays(d(today), d(p.start)) + 1;
}

/** Arrow targets (AC-5): back stops at the first session's period, forward at the current one. */
export function neighbours(p: Period, today: string, firstDay: string | null) {
  const prev = periodFor(p.view, shiftKey(p.view, p.key, -1));
  const next = periodFor(p.view, shiftKey(p.view, p.key, 1));
  return {
    prevKey: firstDay && firstDay <= prev.end ? prev.key : null,
    nextKey: next.start <= today ? next.key : null,
  };
}
