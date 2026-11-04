import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TZDate } from "@date-fns/tz";
import { addDays, format, subDays } from "date-fns";
import { eq, inArray } from "drizzle-orm";

// Integration suite: real server actions against the Neon test branch, with Clerk stubbed.
const clerk = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerk.userId }),
  currentUser: async () => ({ primaryEmailAddress: { emailAddress: `${clerk.userId}@test.local` }, emailAddresses: [] }),
}));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

import { getDb } from "@/db";
import { activeSessions, timeEntries, userSettings, users } from "@/db/schema";
import { completeSession, getActiveSession, pauseSession, resumeSession, startSession } from "@/actions/session";
import { deleteEntry, getDayEntries, updateEntry } from "@/actions/entries";
import { updateSettings } from "@/actions/settings";
import { getHeatmap, getSettings } from "@/lib/queries";
import { elapsedSec } from "@/lib/timer";
import { requireUser } from "@/lib/user";

const run = Math.random().toString(36).slice(2, 8);
const A = `test_${run}_a`;
const B = `test_${run}_b`;
const as = (id: string) => (clerk.userId = id);
const t0 = new Date("2026-03-10T09:00:00Z").getTime();
const at = (ms: number) => vi.setSystemTime(t0 + ms);
const MIN = 60_000;

async function addEntry(userId: string, startedAt: Date, durationSec: number) {
  const [row] = await getDb()
    .insert(timeEntries)
    .values({ userId, startedAt, durationSec, endedAt: new Date(startedAt.getTime() + durationSec * 1000) })
    .returning();
  return row;
}

describe.skipIf(!process.env.DATABASE_URL)("server actions on the test database", () => {
  beforeAll(async () => {
    as(A);
    await requireUser();
    as(B);
    await requireUser();
  });

  beforeEach(async () => {
    vi.useRealTimers();
    await getDb().delete(activeSessions).where(inArray(activeSessions.userId, [A, B]));
    await getDb().delete(timeEntries).where(inArray(timeEntries.userId, [A, B]));
  });

  afterAll(async () => {
    vi.useRealTimers();
    await getDb().delete(users).where(inArray(users.id, [A, B]));
  });

  it("creates user and settings rows once, however often it is called (AC-2)", async () => {
    as(A);
    await requireUser();
    await requireUser();
    expect(await getDb().select().from(users).where(eq(users.id, A))).toHaveLength(1);
    expect(await getDb().select().from(userSettings).where(eq(userSettings.userId, A))).toHaveLength(1);
  });

  it("rejects bad targets and keeps one active session per user (AC-3)", async () => {
    as(A);
    await expect(startSession({ targetSec: 59 })).rejects.toThrow();
    await expect(startSession({ targetSec: 12 * 3600 + 1 })).rejects.toThrow();
    const first = await startSession({ targetSec: 25 * 60 });
    const second = await startSession({ targetSec: 60 });
    expect(second).toEqual(first);
  });

  it("excludes paused time and survives a reload (AC-4, AC-7)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    as(A);
    at(0);
    await startSession({ targetSec: 3600 });
    at(10 * MIN);
    expect((await pauseSession()).accumulatedSec).toBe(600);
    at(60 * MIN);
    await resumeSession();
    at(65 * MIN);
    // A fresh read is what a reload or second device sees.
    const reloaded = await getActiveSession();
    expect(reloaded?.status).toBe("RUNNING");
    expect(elapsedSec(reloaded!, Date.now())).toBe(15 * 60);
  });

  it("derives duration on the server and ignores a client value (AC-6)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    as(A);
    at(0);
    await startSession({ targetSec: 600 });
    at(2 * MIN);
    const done = await completeSession({ notes: " shipped ", durationSec: 999_999 } as never);
    expect(done.durationSec).toBe(120);
    const [row] = await getDb().select().from(timeEntries).where(eq(timeEntries.id, done.id));
    expect(row).toMatchObject({ durationSec: 120, notes: "shipped", startedAt: new Date(t0) });
    expect(await getActiveSession()).toBeNull();
  });

  it("refuses to save sessions under a minute (AC-6)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    as(A);
    at(0);
    await startSession({ targetSec: 600 });
    at(30_000);
    await expect(completeSession({})).rejects.toThrow("TOO_SHORT");
    expect(await getActiveSession()).not.toBeNull();
  });

  it("only accepts image URLs from our Blob store (spec invariant)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    as(A);
    at(0);
    await startSession({ targetSec: 600 });
    at(5 * MIN);
    await expect(completeSession({ imageUrl: "https://evil.example.com/x.png" })).rejects.toThrow();
    expect(await getActiveSession()).not.toBeNull();
  });

  it.each(["Australia/Sydney", "America/Los_Angeles"])(
    "buckets a 23:30 local session on its local start day in %s (AC-8)",
    async (tz) => {
      const day = format(subDays(new TZDate(new Date(), tz), 2), "yyyy-MM-dd");
      const [y, m, d] = day.split("-").map(Number);
      await addEntry(A, new TZDate(y, m - 1, d, 23, 30, 0, tz), 90 * 60);

      const { cells } = await getHeatmap(A, tz);
      const next = format(addDays(new Date(`${day}T12:00:00`), 1), "yyyy-MM-dd");
      expect(cells.find((c) => c.date === day)).toMatchObject({ minutes: 90, level: 2 });
      expect(cells.find((c) => c.date === next)?.minutes).toBe(0);
    },
  );

  it("does not let one user read, edit or delete another user's entry (AC-11)", async () => {
    const day = format(subDays(new Date(), 3), "yyyy-MM-dd");
    const entry = await addEntry(A, new Date(`${day}T12:00:00Z`), 1800);

    as(B);
    await expect(updateEntry({ id: entry.id, notes: "hijacked" })).rejects.toThrow("Not found");
    await expect(deleteEntry(entry.id)).rejects.toThrow("Not found");
    expect(await getDayEntries(day)).toEqual([]);

    as(A);
    expect((await getDayEntries(day)).map((e) => e.id)).toEqual([entry.id]);
    const [row] = await getDb().select().from(timeEntries).where(eq(timeEntries.id, entry.id));
    expect(row.notes).toBeNull();
  });

  it("defaults to no sound at volume 50 and keeps the choice per user (spec 0002 AC-2, AC-8)", async () => {
    as(A);
    await getDb().update(userSettings).set({ ambientSound: "OFF", ambientVolume: 50 }).where(eq(userSettings.userId, A));
    expect(await getSettings(A)).toMatchObject({ ambientSound: "OFF", ambientVolume: 50 });
    expect(await getSettings("no_such_user")).toMatchObject({ ambientSound: "OFF", ambientVolume: 50 });

    as(B);
    await getDb().update(userSettings).set({ ambientSound: "OFF", ambientVolume: 50 }).where(eq(userSettings.userId, B));
    cache.revalidatePath.mockClear();
    await updateSettings({ ambientSound: "RAIN", ambientVolume: 30 });
    expect(await getSettings(B)).toMatchObject({ ambientSound: "RAIN", ambientVolume: 30 });
    // Only B's row changed, and a sound only change does not re render the dashboard.
    expect(await getSettings(A)).toMatchObject({ ambientSound: "OFF", ambientVolume: 50 });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    { ambientVolume: 101 },
    { ambientVolume: -1 },
    { ambientVolume: 33.5 },
    { ambientSound: "JAZZ" },
  ])("rejects %o and saves nothing (spec 0002 AC-8)", async (bad) => {
    as(A);
    await getDb().update(userSettings).set({ ambientSound: "BROWN", ambientVolume: 70 }).where(eq(userSettings.userId, A));
    await expect(updateSettings(bad as never)).rejects.toThrow();
    expect(await getSettings(A)).toMatchObject({ ambientSound: "BROWN", ambientVolume: 70 });
  });

  it("rejects sound settings when signed out (spec 0002 AC-8)", async () => {
    clerk.userId = null;
    await expect(updateSettings({ ambientVolume: 10 })).rejects.toThrow("UNAUTHENTICATED");
  });

  it("enforces the volume range in the database too (spec 0002 invariant)", async () => {
    await expect(
      getDb().update(userSettings).set({ ambientVolume: 101 }).where(eq(userSettings.userId, A)),
    ).rejects.toThrow();
  });
});
