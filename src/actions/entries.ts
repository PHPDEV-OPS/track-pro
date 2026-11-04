"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { timeEntries } from "@/db/schema";
import { blobImageUrl } from "@/lib/blob";
import { getSessionsPage, getSettings } from "@/lib/queries";
import { requireUser } from "@/lib/user";

const updateSchema = z.object({
  id: z.string().min(1),
  notes: z.string().max(2000).nullish(),
  imageUrl: blobImageUrl.nullish(),
});

export async function updateEntry(input: z.input<typeof updateSchema>) {
  const data = updateSchema.parse(input);
  const userId = await requireUser();
  const set: Partial<typeof timeEntries.$inferInsert> = {};
  if (data.notes !== undefined) set.notes = data.notes?.trim() || null;
  if (data.imageUrl !== undefined) set.imageUrl = data.imageUrl;
  if (Object.keys(set).length === 0) return;
  const rows = await getDb()
    .update(timeEntries)
    .set(set)
    .where(and(eq(timeEntries.id, data.id), eq(timeEntries.userId, userId)))
    .returning({ id: timeEntries.id });
  if (rows.length === 0) throw new Error("Not found");
  revalidatePath("/dashboard");
}

const sessionsSchema = z.object({
  view: z.string().optional(),
  period: z.string().optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  cursor: z
    .string()
    .regex(/^[^|]+\|[0-9a-f]{32}$/)
    .nullish(),
});

/** The sessions list under the history chart (spec 0006): 20 at a time, newest first. */
export async function getSessions(input: z.input<typeof sessionsSchema>) {
  const data = sessionsSchema.parse(input);
  const userId = await requireUser();
  const { timezone } = await getSettings(userId);
  let cursor: { at: Date; id: string } | null = null;
  if (data.cursor) {
    const [at, id] = data.cursor.split("|");
    if (!Number.isNaN(new Date(at).getTime())) cursor = { at: new Date(at), id };
  }
  return getSessionsPage(userId, timezone, data.view, data.period, data.day ?? null, cursor);
}

export async function deleteEntry(id: string) {
  const userId = await requireUser();
  const rows = await getDb()
    .delete(timeEntries)
    .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)))
    .returning({ id: timeEntries.id });
  if (rows.length === 0) throw new Error("Not found");
  revalidatePath("/dashboard");
}
