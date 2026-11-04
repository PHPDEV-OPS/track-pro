import { and, desc, eq, gte, sql } from "drizzle-orm";
import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { getDb } from "@/db";
import { timeEntries, userSettings } from "@/db/schema";
import { buildDays } from "@/lib/heatmap";

export async function getSettings(userId: string) {
  const row = await getDb().query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
  return row ?? { clockStyle: "DIGITAL" as const, theme: "system", timezone: "UTC" };
}

const localDay = (tz: string) =>
  sql<string>`to_char(${timeEntries.startedAt} at time zone ${tz}, 'YYYY-MM-DD')`;

/** Last 365 local days of focus, grouped by the user's timezone (AC-8). */
export async function getHeatmap(userId: string, timezone: string) {
  const today = format(new TZDate(new Date(), timezone), "yyyy-MM-dd");
  const from = new Date(Date.now() - 367 * 24 * 3600 * 1000);
  const dayExpr = localDay(timezone);
  const rows = await getDb()
    .select({ day: dayExpr, sec: sql<number>`sum(${timeEntries.durationSec})::int` })
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, userId), gte(timeEntries.startedAt, from)))
    // Group by position: repeating dayExpr binds tz as a second param, which Postgres won't match to the select.
    .groupBy(sql`1`);
  const secByDay = Object.fromEntries(rows.map((r) => [r.day, r.sec]));
  return { today, cells: buildDays(today, secByDay) };
}

export async function getEntriesForDay(userId: string, timezone: string, day: string) {
  return getDb()
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, userId), sql`${localDay(timezone)} = ${day}`))
    .orderBy(desc(timeEntries.startedAt));
}

export async function getRecentEntries(userId: string, limit = 10) {
  return getDb()
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.userId, userId))
    .orderBy(desc(timeEntries.startedAt))
    .limit(limit);
}
