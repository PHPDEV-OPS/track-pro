import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { getDb } from "@/db";
import { musicLinks, timeEntries, userSettings } from "@/db/schema";
import { levelFor, type Cell } from "@/lib/heatmap";
import { elapsedDays, neighbours, parseView, periodFor, resolveKey, shiftKey, todayIn, type View } from "@/lib/periods";

export async function getSettings(userId: string) {
  const row = await getDb().query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
  const s = row ?? {
    clockStyle: "DIGITAL" as const,
    theme: "system",
    timezone: "UTC",
    ambientSound: "OFF" as const,
    ambientVolume: 50,
    musicLinkId: null,
  };
  // MUSIC whose link was deleted reads as Off (spec 0005).
  return s.ambientSound === "MUSIC" && !s.musicLinkId ? { ...s, ambientSound: "OFF" as const } : s;
}

/** The user's saved music links, in slot order (spec 0005). */
export async function getMusicLinks(userId: string) {
  return getDb().select().from(musicLinks).where(eq(musicLinks.userId, userId)).orderBy(musicLinks.slot);
}

const localDay = (tz: string) =>
  sql<string>`to_char(${timeEntries.startedAt} at time zone ${tz}, 'YYYY-MM-DD')`;

export type DayStat = Cell & { sessions: number; future: boolean };

export type PeriodStats = {
  view: View;
  key: string;
  label: string;
  days: DayStat[];
  totalSec: number;
  averageSec: number;
  sessions: number;
  /** Percent change against the same days of the previous period; null when both are empty. */
  change: { pct: number } | { upFromZero: true } | null;
  prevKey: string | null;
  nextKey: string | null;
};

/** First local day this user focused, or null with no sessions. Bounds the back arrow (spec 0004 AC-5). */
async function firstDay(userId: string, timezone: string) {
  const [row] = await getDb()
    .select({ day: sql<string | null>`to_char(min(${timeEntries.startedAt}) at time zone ${timezone}, 'YYYY-MM-DD')` })
    .from(timeEntries)
    .where(eq(timeEntries.userId, userId));
  return row?.day ?? null;
}

/** Stats and per day focus for one calendar week, month or year in the user's timezone (spec 0004). */
export async function getPeriodStats(userId: string, timezone: string, rawView: unknown, rawPeriod: unknown): Promise<PeriodStats> {
  const view = parseView(rawView);
  const today = todayIn(timezone);
  const p = periodFor(view, resolveKey(view, rawPeriod, today));
  const prev = periodFor(view, shiftKey(view, p.key, -1));
  // Local midnights as instants, so the range matches the local day bucketing exactly.
  const from = sql`(${prev.start}::date)::timestamp at time zone ${timezone}`;
  const to = sql`(${p.end}::date + 1)::timestamp at time zone ${timezone}`;
  const [rows, first] = await Promise.all([
    getDb()
      .select({
        day: localDay(timezone),
        sec: sql<number>`sum(${timeEntries.durationSec})::int`,
        n: sql<number>`count(*)::int`,
      })
      .from(timeEntries)
      .where(and(eq(timeEntries.userId, userId), gte(timeEntries.startedAt, from), lt(timeEntries.startedAt, to)))
      .groupBy(sql`1`),
    firstDay(userId, timezone),
  ]);
  const byDay = new Map(rows.map((r) => [r.day, r]));

  const days: DayStat[] = p.days.map((date) => {
    const r = byDay.get(date);
    const minutes = Math.floor((r?.sec ?? 0) / 60);
    return { date, minutes, level: levelFor(minutes), sessions: r?.n ?? 0, future: date > today };
  });
  const counted = elapsedDays(p, today);
  const sumSec = (ds: string[]) => ds.reduce((n, day) => n + (byDay.get(day)?.sec ?? 0), 0);
  const totalSec = sumSec(p.days);
  const prevSec = sumSec(prev.days.slice(0, counted));
  const change = prevSec > 0 ? { pct: Math.round(((totalSec - prevSec) / prevSec) * 100) } : totalSec > 0 ? { upFromZero: true as const } : null;

  return {
    view,
    key: p.key,
    label: p.label,
    days,
    totalSec,
    averageSec: counted ? Math.round(totalSec / counted) : 0,
    sessions: days.reduce((n, x) => n + x.sessions, 0),
    change,
    ...neighbours(p, today, first),
  };
}

export type SessionRow = {
  id: string;
  durationSec: number;
  startedAt: string;
  /** Local day and start time in the user's timezone (spec 0006). */
  day: string;
  time: string;
  notes: string | null;
  imageUrl: string | null;
};

const PAGE = 20;

/**
 * One page of the user's sessions in a period, newest first, optionally one local day of it
 * (spec 0006 AC-5, AC-6). The cursor is the last row's start time and id.
 */
export async function getSessionsPage(
  userId: string,
  timezone: string,
  rawView: unknown,
  rawPeriod: unknown,
  day: string | null,
  cursor: { at: Date; id: string } | null,
) {
  const view = parseView(rawView);
  const p = periodFor(view, resolveKey(view, rawPeriod, todayIn(timezone)));
  const onDay = day && day >= p.start && day <= p.end ? day : null;
  const from = sql`(${onDay ?? p.start}::date)::timestamp at time zone ${timezone}`;
  const to = sql`(${onDay ?? p.end}::date + 1)::timestamp at time zone ${timezone}`;
  const rows = await getDb()
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.startedAt, from),
        lt(timeEntries.startedAt, to),
        cursor ? sql`(${timeEntries.startedAt}, ${timeEntries.id}) < (${cursor.at}, ${cursor.id})` : undefined,
      ),
    )
    .orderBy(desc(timeEntries.startedAt), desc(timeEntries.id))
    .limit(PAGE + 1);
  const page = rows.slice(0, PAGE);
  const last = page.at(-1);
  return {
    day: onDay,
    rows: page.map(
      (r): SessionRow => ({
        id: r.id,
        durationSec: r.durationSec,
        startedAt: r.startedAt.toISOString(),
        day: format(new TZDate(r.startedAt, timezone), "yyyy-MM-dd"),
        time: format(new TZDate(r.startedAt, timezone), "HH:mm"),
        notes: r.notes,
        imageUrl: r.imageUrl,
      }),
    ),
    nextCursor: rows.length > PAGE && last ? `${last.startedAt.toISOString()}|${last.id}` : null,
  };
}
