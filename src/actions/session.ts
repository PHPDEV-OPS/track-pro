"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { activeSessions, timeEntries } from "@/db/schema";
import { blobImageUrl } from "@/lib/blob";
import { requireUser } from "@/lib/user";
import { elapsedSec, MAX_TARGET_SEC, MIN_SAVE_SEC, MIN_TARGET_SEC } from "@/lib/timer";

export type SessionDTO = {
  status: "RUNNING" | "PAUSED";
  targetSec: number;
  startedAt: string;
  accumulatedSec: number;
  lastResumedAt: string | null;
  pausedAt: string | null;
  /** The server clock when this was read, so the browser can measure its offset (spec 0003). */
  serverTime: string;
};

/** Expected rejections are returned, not thrown: Next.js hides thrown messages in production (spec 0003). */
export type Conflict = { conflict: "NO_SESSION" | "BAD_TIME" | "TOO_SHORT" };

const toDTO = (s: typeof activeSessions.$inferSelect): SessionDTO => ({
  status: s.status,
  targetSec: s.targetSec,
  startedAt: s.startedAt.toISOString(),
  accumulatedSec: s.accumulatedSec,
  lastResumedAt: s.lastResumedAt?.toISOString() ?? null,
  pausedAt: s.pausedAt?.toISOString() ?? null,
  serverTime: new Date().toISOString(),
});

const TOLERANCE_MS = 2 * 60_000;
const atSchema = z.object({ at: z.iso.datetime({ offset: true }).optional() });

/**
 * Checks a queued action's browser time against what the server knows (spec 0003 AC-3):
 * between `lower` and now, clamped within 2 minutes of either edge, rejected beyond. No `at` means now.
 */
function checkedAt(at: string | undefined, lower: Date): Date | null {
  const now = Date.now();
  if (!at) return new Date(now);
  const t = new Date(at).getTime();
  if (t > now + TOLERANCE_MS || t < lower.getTime() - TOLERANCE_MS) return null;
  return new Date(Math.min(now, Math.max(lower.getTime(), t)));
}

async function current(userId: string) {
  return getDb().query.activeSessions.findFirst({ where: eq(activeSessions.userId, userId) });
}

export async function getActiveSession(): Promise<SessionDTO | null> {
  const userId = await requireUser();
  const s = await current(userId);
  return s ? toDTO(s) : null;
}

export async function startSession(input: { targetSec: number }): Promise<SessionDTO> {
  const { targetSec } = z
    .object({ targetSec: z.number().int().min(MIN_TARGET_SEC).max(MAX_TARGET_SEC) })
    .parse(input);
  const userId = await requireUser();
  const now = new Date();
  const rows = await getDb()
    .insert(activeSessions)
    .values({ userId, status: "RUNNING", targetSec, startedAt: now, accumulatedSec: 0, lastResumedAt: now })
    .onConflictDoNothing()
    .returning();
  if (rows.length === 0) {
    // Another tab already started one: return it so the UI syncs to it.
    const existing = await current(userId);
    if (existing) return toDTO(existing);
    throw new Error("Could not start session");
  }
  return toDTO(rows[0]);
}

export async function pauseSession(input: { at?: string } = {}): Promise<SessionDTO | Conflict> {
  const { at } = atSchema.parse(input);
  const userId = await requireUser();
  const s = await current(userId);
  if (!s) return { conflict: "NO_SESSION" };
  if (s.status === "PAUSED") return toDTO(s);
  const when = checkedAt(at, s.lastResumedAt ?? s.startedAt);
  if (!when) return { conflict: "BAD_TIME" };
  const [row] = await getDb()
    .update(activeSessions)
    .set({ status: "PAUSED", accumulatedSec: elapsedSec(s, when.getTime()), lastResumedAt: null, pausedAt: when })
    .where(and(eq(activeSessions.userId, userId), eq(activeSessions.status, "RUNNING")))
    .returning();
  return toDTO(row ?? s);
}

export async function resumeSession(input: { at?: string } = {}): Promise<SessionDTO | Conflict> {
  const { at } = atSchema.parse(input);
  const userId = await requireUser();
  const s = await current(userId);
  if (!s) return { conflict: "NO_SESSION" };
  if (s.status === "RUNNING") return toDTO(s);
  const when = checkedAt(at, s.pausedAt ?? s.startedAt);
  if (!when) return { conflict: "BAD_TIME" };
  const [row] = await getDb()
    .update(activeSessions)
    .set({ status: "RUNNING", lastResumedAt: when, pausedAt: null })
    .where(and(eq(activeSessions.userId, userId), eq(activeSessions.status, "PAUSED")))
    .returning();
  return toDTO(row ?? s);
}

const completeSchema = atSchema.extend({
  entryId: z.string().regex(/^[0-9a-f]{32}$/),
  notes: z.string().max(2000).nullish(),
  imageUrl: blobImageUrl.nullish(),
});

/**
 * Duration is derived on the server from the active session, never from the client (AC-6). The browser
 * makes the entry id, so a repeated send returns the entry it already saved (spec 0003 AC-4).
 */
export async function completeSession(
  input: z.input<typeof completeSchema>,
): Promise<{ id: string; durationSec: number } | Conflict> {
  const data = completeSchema.parse(input);
  const userId = await requireUser();
  const db = getDb();
  const saved = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, data.entryId) });
  // Another user's id looks exactly like a missing session, so ids reveal nothing.
  if (saved) return saved.userId === userId ? { id: saved.id, durationSec: saved.durationSec } : { conflict: "NO_SESSION" };
  const s = await current(userId);
  if (!s) return { conflict: "NO_SESSION" };
  const when = checkedAt(data.at, s.status === "RUNNING" ? (s.lastResumedAt ?? s.startedAt) : (s.pausedAt ?? s.startedAt));
  if (!when) return { conflict: "BAD_TIME" };
  const durationSec = elapsedSec(s, when.getTime());
  if (durationSec < MIN_SAVE_SEC) return { conflict: "TOO_SHORT" };
  const [entry] = await db
    .insert(timeEntries)
    .values({
      id: data.entryId,
      userId,
      durationSec,
      startedAt: s.startedAt,
      endedAt: when,
      notes: data.notes?.trim() || null,
      imageUrl: data.imageUrl ?? null,
    })
    .onConflictDoNothing()
    .returning();
  await db.delete(activeSessions).where(eq(activeSessions.userId, userId));
  revalidatePath("/dashboard");
  if (!entry) {
    // A concurrent send with the same id won the insert.
    const won = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, data.entryId) });
    if (won?.userId === userId) return { id: won.id, durationSec: won.durationSec };
    return { conflict: "NO_SESSION" };
  }
  return { id: entry.id, durationSec };
}

export async function discardSession() {
  const userId = await requireUser();
  await getDb().delete(activeSessions).where(eq(activeSessions.userId, userId));
  revalidatePath("/dashboard");
}
