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
import { activeSessions, musicLinks, timeEntries, userSettings, users } from "@/db/schema";
import {
  completeSession,
  getActiveSession,
  pauseSession,
  resumeSession,
  startSession,
  type Conflict,
} from "@/actions/session";
import { deleteEntry, getSessions, updateEntry } from "@/actions/entries";
import { updateSettings } from "@/actions/settings";
import { addMusicLink, deleteMusicLink, renameMusicLink } from "@/actions/music";
import { getPeriodStats, getSettings } from "@/lib/queries";
import { createId } from "@/lib/id";
import { elapsedSec } from "@/lib/timer";
import { requireUser } from "@/lib/user";

const run = Math.random().toString(36).slice(2, 8);
const A = `test_${run}_a`;
const B = `test_${run}_b`;
const as = (id: string) => (clerk.userId = id);
const t0 = new Date("2026-03-10T09:00:00Z").getTime();
const at = (ms: number) => vi.setSystemTime(t0 + ms);
const MIN = 60_000;
const iso = (ms: number) => new Date(t0 + ms).toISOString();

/** Unwraps a successful result, failing the test on a returned conflict. */
function ok<T extends object>(r: T | Conflict): T {
  if ("conflict" in r) throw new Error(`unexpected conflict ${r.conflict}`);
  return r;
}
const withoutClock = <T extends { serverTime: string }>(s: T) => ({ ...s, serverTime: "" });

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
    expect(withoutClock(second)).toEqual(withoutClock(first));
  });

  it("excludes paused time and survives a reload (AC-4, AC-7)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    as(A);
    at(0);
    await startSession({ targetSec: 3600 });
    at(10 * MIN);
    expect(ok(await pauseSession()).accumulatedSec).toBe(600);
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
    const done = ok(await completeSession({ entryId: createId(), notes: " shipped ", durationSec: 999_999 } as never));
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
    expect(await completeSession({ entryId: createId() })).toEqual({ conflict: "TOO_SHORT" });
    expect(await getActiveSession()).not.toBeNull();
  });

  it("only accepts image URLs from our Blob store (spec invariant)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    as(A);
    at(0);
    await startSession({ targetSec: 600 });
    at(5 * MIN);
    await expect(completeSession({ entryId: createId(), imageUrl: "https://evil.example.com/x.png" })).rejects.toThrow();
    expect(await getActiveSession()).not.toBeNull();
  });

  it.each(["Australia/Sydney", "America/Los_Angeles"])(
    "buckets a 23:30 local session on its local start day in %s (AC-8)",
    async (tz) => {
      const day = format(subDays(new TZDate(new Date(), tz), 2), "yyyy-MM-dd");
      const [y, m, d] = day.split("-").map(Number);
      await addEntry(A, new TZDate(y, m - 1, d, 23, 30, 0, tz), 90 * 60);

      const next = format(addDays(new Date(`${day}T12:00:00`), 1), "yyyy-MM-dd");
      const dayOf = async (d: string) => (await getPeriodStats(A, tz, "week", d)).days.find((c) => c.date === d);
      expect(await dayOf(day)).toMatchObject({ minutes: 90, level: 2, sessions: 1 });
      expect((await dayOf(next))?.minutes).toBe(0);
    },
  );

  it("does not let one user read, edit or delete another user's entry (AC-11)", async () => {
    const day = format(subDays(new Date(), 3), "yyyy-MM-dd");
    const entry = await addEntry(A, new Date(`${day}T12:00:00Z`), 1800);

    as(B);
    await expect(updateEntry({ id: entry.id, notes: "hijacked" })).rejects.toThrow("Not found");
    await expect(deleteEntry(entry.id)).rejects.toThrow("Not found");
    expect((await getSessions({ view: "week", period: day, day })).rows).toEqual([]);

    as(A);
    expect((await getSessions({ view: "week", period: day, day })).rows.map((e) => e.id)).toEqual([entry.id]);
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

  describe("offline actions (spec 0003)", () => {
    it("uses a queued pause time, so offline paused minutes are not counted (AC-3)", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      as(A);
      at(0);
      await startSession({ targetSec: 3600 });
      at(30 * MIN); // reconnect long after the offline pause at 10 min and resume at 25 min
      const paused = ok(await pauseSession({ at: iso(10 * MIN) }));
      expect(paused).toMatchObject({ status: "PAUSED", accumulatedSec: 600, pausedAt: iso(10 * MIN) });
      const resumed = ok(await resumeSession({ at: iso(25 * MIN) }));
      expect(resumed).toMatchObject({ status: "RUNNING", lastResumedAt: iso(25 * MIN), pausedAt: null });
      expect(elapsedSec(resumed, Date.now())).toBe(15 * 60);
    });

    it("rejects times far outside the window and clamps small skew (AC-3)", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      as(A);
      at(0);
      await startSession({ targetSec: 3600 });
      at(20 * MIN);
      expect(await pauseSession({ at: iso(30 * MIN) })).toEqual({ conflict: "BAD_TIME" });
      expect(await pauseSession({ at: iso(-5 * MIN) })).toEqual({ conflict: "BAD_TIME" });
      const clamped = ok(await pauseSession({ at: iso(20 * MIN + 90_000) }));
      expect(clamped).toMatchObject({ accumulatedSec: 20 * 60, pausedAt: iso(20 * MIN) });
      expect(await resumeSession({ at: iso(10 * MIN) })).toEqual({ conflict: "BAD_TIME" });
    });

    it("creates one entry for a complete sent twice, timed by the queued time (AC-4)", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      as(A);
      at(0);
      await startSession({ targetSec: 3600 });
      at(40 * MIN);
      const entryId = createId();
      const first = ok(await completeSession({ entryId, at: iso(30 * MIN), notes: "offline" }));
      const again = ok(await completeSession({ entryId, at: iso(30 * MIN), notes: "offline" }));
      expect(first).toEqual({ id: entryId, durationSec: 30 * 60 });
      expect(again).toEqual(first);
      const rows = await getDb().select().from(timeEntries).where(eq(timeEntries.userId, A));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: entryId, endedAt: new Date(t0 + 30 * MIN), notes: "offline" });
    });

    it("returns NO_SESSION when the session changed elsewhere, and for another user's entry id (AC-5, AC-7)", async () => {
      as(A);
      expect(await pauseSession({})).toEqual({ conflict: "NO_SESSION" });
      expect(await resumeSession({})).toEqual({ conflict: "NO_SESSION" });
      await startSession({ targetSec: 600 });
      const entry = await addEntry(B, new Date(), 1800);
      expect(await completeSession({ entryId: entry.id })).toEqual({ conflict: "NO_SESSION" });
      expect(await getActiveSession()).not.toBeNull();
    });

    it("keeps paused_at set exactly while paused, in the database (invariant)", async () => {
      as(A);
      await startSession({ targetSec: 600 });
      await expect(
        getDb().update(activeSessions).set({ status: "PAUSED" }).where(eq(activeSessions.userId, A)),
      ).rejects.toThrow();
    });
  });

  describe("history periods and sessions (specs 0004, 0006)", () => {
    // Wednesday 11 March 2026, 10:00 UTC; A's timezone is the UTC default.
    const wed = new Date("2026-03-11T10:00:00Z").getTime();
    const h = (n: number) => n * 3600;
    const on = (day: string, hour = 9) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);

    beforeEach(async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(wed);
      await addEntry(A, on("2026-03-09"), h(1));
      await addEntry(A, on("2026-03-10"), h(2));
      for (const [d, n] of [["2026-03-02", 1], ["2026-03-03", 1], ["2026-03-04", 1], ["2026-03-05", 5]] as const) {
        await addEntry(A, on(d), h(n));
      }
    });

    it("averages over days so far and compares with the same days last week (AC-4, AC-5)", async () => {
      const s = await getPeriodStats(A, "UTC", "week", undefined);
      expect(s).toMatchObject({ key: "2026-03-09", label: "Mar 9 to 15, 2026", totalSec: h(3), averageSec: h(1), sessions: 2 });
      expect(s.change).toEqual({ pct: 0 }); // Mon to Wed last week was also 3h
      expect(s.prevKey).toBe("2026-03-02");
      expect(s.nextKey).toBeNull();
      expect(s.days.map((d) => d.future)).toEqual([false, false, false, true, true, true, true]);
    });

    it("says up from zero and stops the back arrow at the first session's week (AC-4, AC-5)", async () => {
      const s = await getPeriodStats(A, "UTC", "week", "2026-03-04");
      expect(s).toMatchObject({ key: "2026-03-02", totalSec: h(8), averageSec: Math.round(h(8) / 7), prevKey: null, nextKey: "2026-03-09" });
      expect(s.change).toEqual({ upFromZero: true });
    });

    it("falls back to the current period for invalid or future keys, and shows calendar years (AC-3, AC-6)", async () => {
      expect((await getPeriodStats(A, "UTC", "month", "2099-01")).key).toBe("2026-03");
      expect((await getPeriodStats(A, "UTC", "month", "garbage")).key).toBe("2026-03");
      expect((await getPeriodStats(A, "UTC", "nonsense", undefined)).view).toBe("year");
      const y = await getPeriodStats(A, "UTC", "year", "2025");
      expect(y).toMatchObject({ key: "2025", label: "2025", totalSec: 0, change: null });
      expect(y.days).toHaveLength(365);
      expect(y.days[0].date).toBe("2025-01-01");
    });

    it("pages sessions 20 at a time and filters to a day (spec 0006 AC-5, AC-6)", async () => {
      as(A);
      const base = on("2026-03-10").getTime();
      await getDb()
        .insert(timeEntries)
        .values(
          Array.from({ length: 20 }, (_, i) => ({
            userId: A,
            durationSec: 600,
            startedAt: new Date(base + (i + 1) * 60_000),
            endedAt: new Date(base + (i + 11) * 60_000),
          })),
        );
      const first = await getSessions({ view: "week", period: "2026-03-09" });
      expect(first.rows).toHaveLength(20);
      expect(first.rows[0]).toMatchObject({ day: "2026-03-10", time: "09:20" });
      const rest = await getSessions({ view: "week", period: "2026-03-09", cursor: first.nextCursor });
      expect(rest.rows).toHaveLength(2);
      expect(rest.nextCursor).toBeNull();
      expect(new Set([...first.rows, ...rest.rows].map((r) => r.id)).size).toBe(22);

      const monday = await getSessions({ view: "week", period: "2026-03-09", day: "2026-03-09" });
      expect(monday.rows.map((r) => r.day)).toEqual(["2026-03-09"]);
      // A day outside the period is ignored rather than trusted.
      expect((await getSessions({ view: "week", period: "2026-03-09", day: "2026-03-02" })).day).toBeNull();
    });
  });

  describe("music links (spec 0005)", () => {
    const yt = (n: number) => `https://www.youtube.com/watch?v=video${String(n).padStart(6, "0")}`;
    const realFetch = globalThis.fetch;
    let oembed: "ok" | "fail" = "ok";

    beforeEach(async () => {
      vi.useRealTimers();
      oembed = "ok";
      // Stub only the title lookups; the database driver keeps using the real fetch.
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input instanceof Request ? input.url : input);
        if (!url.includes("/oembed")) return realFetch(input, init);
        if (oembed === "fail") throw new Error("timeout");
        return new Response(JSON.stringify({ title: "Lofi beats" }), { status: 200 });
      });
      await getDb().update(userSettings).set({ ambientSound: "OFF", musicLinkId: null }).where(inArray(userSettings.userId, [A, B]));
      await getDb().delete(musicLinks).where(inArray(musicLinks.userId, [A, B]));
    });

    it("saves a parsed link with its real title, or the exact default when the lookup fails (AC-1, AC-2)", async () => {
      as(A);
      expect(await addMusicLink({ url: "https://evil.example/playlist?list=x" })).toEqual({ error: "INVALID_URL" });
      const a = await addMusicLink({ url: yt(1) });
      expect(a).toMatchObject({ link: { provider: "YOUTUBE", kind: "VIDEO", externalId: "video000001", title: "Lofi beats", slot: 1 } });
      oembed = "fail";
      const b = await addMusicLink({ url: "https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy?si=1" });
      expect(b).toMatchObject({ link: { provider: "SPOTIFY", kind: "ALBUM", title: "Spotify album", slot: 2 } });
    });

    it("refuses duplicates by parsed id and a 6th link, even when saves race (AC-3)", async () => {
      as(A);
      await addMusicLink({ url: yt(1) });
      expect(await addMusicLink({ url: `https://youtu.be/video000001?si=abc` })).toEqual({ error: "DUPLICATE" });
      for (let i = 2; i <= 4; i++) await addMusicLink({ url: yt(i) });
      const raced = await Promise.all([addMusicLink({ url: yt(5) }), addMusicLink({ url: yt(6) })]);
      expect(raced.filter((r) => "link" in r)).toHaveLength(1);
      expect(raced.filter((r) => "error" in r)).toEqual([{ error: "LIMIT" }]);
      expect(await addMusicLink({ url: yt(7) })).toEqual({ error: "LIMIT" });
      expect(await getDb().select().from(musicLinks).where(eq(musicLinks.userId, A))).toHaveLength(5);
    }, 30_000); // eight saves against the remote test database

    it("picks only your own link, keeps MUSIC and the link together, and clears it for built in sounds (AC-4, AC-9)", async () => {
      as(B);
      const theirs = await addMusicLink({ url: yt(9) });
      as(A);
      const mine = await addMusicLink({ url: yt(1) });
      if (!("link" in mine) || !("link" in theirs)) throw new Error("setup");
      await expect(updateSettings({ ambientSound: "MUSIC" })).rejects.toThrow();
      await expect(updateSettings({ musicLinkId: mine.link.id })).rejects.toThrow();
      expect(await updateSettings({ ambientSound: "MUSIC", musicLinkId: theirs.link.id })).toEqual({ error: "NOT_FOUND" });
      expect(await getSettings(A)).toMatchObject({ ambientSound: "OFF", musicLinkId: null });

      await updateSettings({ ambientSound: "MUSIC", musicLinkId: mine.link.id });
      expect(await getSettings(A)).toMatchObject({ ambientSound: "MUSIC", musicLinkId: mine.link.id });
      await updateSettings({ ambientSound: "WHITE" });
      expect(await getSettings(A)).toMatchObject({ ambientSound: "WHITE", musicLinkId: null });
    });

    it("turns the sound off when the picked link is deleted, and guards other users' links (AC-9)", async () => {
      as(A);
      const mine = await addMusicLink({ url: yt(1) });
      if (!("link" in mine)) throw new Error("setup");
      await updateSettings({ ambientSound: "MUSIC", musicLinkId: mine.link.id });

      as(B);
      expect(await renameMusicLink({ id: mine.link.id, title: "hijacked" })).toEqual({ error: "NOT_FOUND" });
      expect(await deleteMusicLink(mine.link.id)).toEqual({ error: "NOT_FOUND" });

      as(A);
      expect(await renameMusicLink({ id: mine.link.id, title: "  Deep work  " })).toMatchObject({ link: { title: "Deep work" } });
      expect(await deleteMusicLink(mine.link.id)).toEqual({ ok: true });
      expect(await getSettings(A)).toMatchObject({ ambientSound: "OFF", musicLinkId: null });
    });
  });
});
