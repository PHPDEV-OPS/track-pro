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
};

const toDTO = (s: typeof activeSessions.$inferSelect): SessionDTO => ({
  status: s.status,
  targetSec: s.targetSec,
  startedAt: s.startedAt.toISOString(),
  accumulatedSec: s.accumulatedSec,
  lastResumedAt: s.lastResumedAt?.toISOString() ?? null,
});

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

export async function pauseSession(): Promise<SessionDTO> {
  const userId = await requireUser();
  const s = await current(userId);
  if (!s) throw new Error("No active session");
  if (s.status === "PAUSED") return toDTO(s);
  const [row] = await getDb()
    .update(activeSessions)
    .set({ status: "PAUSED", accumulatedSec: elapsedSec(s), lastResumedAt: null })
    .where(and(eq(activeSessions.userId, userId), eq(activeSessions.status, "RUNNING")))
    .returning();
  return toDTO(row ?? s);
}

export async function resumeSession(): Promise<SessionDTO> {
  const userId = await requireUser();
  const s = await current(userId);
  if (!s) throw new Error("No active session");
  if (s.status === "RUNNING") return toDTO(s);
  const [row] = await getDb()
    .update(activeSessions)
    .set({ status: "RUNNING", lastResumedAt: new Date() })
    .where(and(eq(activeSessions.userId, userId), eq(activeSessions.status, "PAUSED")))
    .returning();
  return toDTO(row ?? s);
}

const completeSchema = z.object({
  notes: z.string().max(2000).nullish(),
  imageUrl: blobImageUrl.nullish(),
});

/** Duration is derived on the server from the active session, never from the client (AC-6). */
export async function completeSession(input: { notes?: string | null; imageUrl?: string | null }) {
  const data = completeSchema.parse(input);
  const userId = await requireUser();
  const s = await current(userId);
  if (!s) throw new Error("No active session");
  const durationSec = elapsedSec(s);
  if (durationSec < MIN_SAVE_SEC) throw new Error("TOO_SHORT");
  const db = getDb();
  const [entry] = await db
    .insert(timeEntries)
    .values({
      userId,
      durationSec,
      startedAt: s.startedAt,
      endedAt: new Date(),
      notes: data.notes?.trim() || null,
      imageUrl: data.imageUrl ?? null,
    })
    .returning();
  await db.delete(activeSessions).where(eq(activeSessions.userId, userId));
  revalidatePath("/dashboard");
  return { id: entry.id, durationSec };
}

export async function discardSession() {
  const userId = await requireUser();
  await getDb().delete(activeSessions).where(eq(activeSessions.userId, userId));
  revalidatePath("/dashboard");
}
