"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { timeEntries } from "@/db/schema";
import { getEntriesForDay, getSettings } from "@/lib/queries";
import { requireUser } from "@/lib/user";

const updateSchema = z.object({
  id: z.string().min(1),
  notes: z.string().max(2000).nullish(),
  imageUrl: z.string().url().nullish(),
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

export async function getDayEntries(day: string) {
  const parsed = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(day);
  const userId = await requireUser();
  const { timezone } = await getSettings(userId);
  const rows = await getEntriesForDay(userId, timezone, parsed);
  return rows.map((r) => ({
    id: r.id,
    durationSec: r.durationSec,
    startedAt: r.startedAt.toISOString(),
    notes: r.notes,
    imageUrl: r.imageUrl,
  }));
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
