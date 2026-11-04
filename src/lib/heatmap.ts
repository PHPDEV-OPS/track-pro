import { addDays, format, subDays } from "date-fns";

export type Level = 0 | 1 | 2 | 3 | 4;

/** Minutes per day to shade level (AC-8): 0, <60, 60-119, 120-239, 240+. */
export function levelFor(minutes: number): Level {
  if (minutes <= 0) return 0;
  if (minutes < 60) return 1;
  if (minutes < 120) return 2;
  if (minutes < 240) return 3;
  return 4;
}

export type Cell = { date: string; minutes: number; level: Level };

/** `today` is the user's local calendar day as YYYY-MM-DD. Returns 365 cells ending on it. */
export function buildDays(today: string, secByDay: Record<string, number>): Cell[] {
  const end = new Date(`${today}T12:00:00`);
  const cells: Cell[] = [];
  for (let i = 364; i >= 0; i--) {
    const date = format(subDays(end, i), "yyyy-MM-dd");
    const minutes = Math.floor((secByDay[date] ?? 0) / 60);
    cells.push({ date, minutes, level: levelFor(minutes) });
  }
  return cells;
}

/** Weeks of 7 cells (Monday first), padded at the start so columns align like GitHub. */
export function toWeeks<T extends Cell>(cells: T[]): (T | null)[][] {
  const first = new Date(`${cells[0].date}T12:00:00`);
  // Rows start on Monday (spec 0004 AC-3).
  const padded: (T | null)[] = Array((first.getDay() + 6) % 7).fill(null).concat(cells);
  const weeks: (T | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));
  return weeks;
}

export function tooltipText(c: Cell): string {
  const label = format(new Date(`${c.date}T12:00:00`), "MMM d");
  if (c.minutes === 0) return `No focus on ${label}`;
  const h = Math.floor(c.minutes / 60);
  const m = c.minutes % 60;
  const parts = [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
  return `${parts} focused on ${label}`;
}

export { addDays };
