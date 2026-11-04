"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { musicLinks, userSettings, type MusicLink } from "@/db/schema";
import { defaultTitle, oembedUrl, parseMusicUrl, type ParsedLink } from "@/lib/music";
import { requireUser } from "@/lib/user";

const MAX_LINKS = 5;
type MusicError = { error: "INVALID_URL" | "LIMIT" | "DUPLICATE" | "NOT_FOUND" };

/** The provider's real title, or the default when the lookup fails or takes over 3 s (AC-2). */
async function lookupTitle(link: ParsedLink) {
  try {
    const res = await fetch(oembedUrl(link), { signal: AbortSignal.timeout(3000), cache: "no-store" });
    if (res.ok) {
      const title = String(((await res.json()) as { title?: unknown }).title ?? "").trim();
      if (title) return title.slice(0, 200);
    }
  } catch {
    /* fall through to the default */
  }
  return defaultTitle(link);
}

/** Which unique key a failed insert hit (Postgres 23505), through the driver's error wrapping. */
function uniqueViolation(e: unknown): string | null {
  for (let cur: unknown = e; cur && typeof cur === "object"; cur = (cur as { cause?: unknown }).cause) {
    const c = cur as { code?: string; constraint?: string };
    if (c.code === "23505") return c.constraint ?? "";
  }
  return null;
}

/** Saves a YouTube or Spotify link into the user's lowest free slot (AC-1 to AC-3). */
export async function addMusicLink(input: { url: string }): Promise<{ link: MusicLink } | MusicError> {
  const { url } = z.object({ url: z.string().max(2000) }).parse(input);
  const parsed = parseMusicUrl(url);
  if (!parsed) return { error: "INVALID_URL" };
  const userId = await requireUser();
  const db = getDb();
  const title = await lookupTitle(parsed);

  // Two tries: a concurrent save can take the slot we picked; the unique key settles it.
  for (let attempt = 0; attempt < 2; attempt++) {
    const rows = await db.select().from(musicLinks).where(eq(musicLinks.userId, userId));
    if (rows.some((r) => r.provider === parsed.provider && r.kind === parsed.kind && r.externalId === parsed.externalId)) {
      return { error: "DUPLICATE" };
    }
    const used = new Set(rows.map((r) => r.slot));
    const slot = [1, 2, 3, 4, 5].find((n) => !used.has(n));
    if (!slot || rows.length >= MAX_LINKS) return { error: "LIMIT" };
    try {
      const [link] = await db
        .insert(musicLinks)
        .values({ userId, slot, ...parsed, title })
        .returning();
      revalidatePath("/", "layout");
      return { link };
    } catch (e) {
      const key = uniqueViolation(e);
      if (key === "music_links_user_link") return { error: "DUPLICATE" };
      if (key !== "music_links_user_slot") throw e;
    }
  }
  return { error: "LIMIT" };
}

export async function renameMusicLink(input: { id: string; title: string }): Promise<{ link: MusicLink } | MusicError> {
  const { id, title } = z.object({ id: z.string().min(1), title: z.string().trim().min(1).max(200) }).parse(input);
  const userId = await requireUser();
  const [link] = await getDb()
    .update(musicLinks)
    .set({ title })
    .where(and(eq(musicLinks.id, id), eq(musicLinks.userId, userId)))
    .returning();
  if (!link) return { error: "NOT_FOUND" };
  revalidatePath("/", "layout");
  return { link };
}

/** Deleting the picked link turns the sound Off (AC-9); the foreign key also clears it. */
export async function deleteMusicLink(id: string): Promise<{ ok: true } | MusicError> {
  const linkId = z.string().min(1).parse(id);
  const userId = await requireUser();
  const db = getDb();
  await db
    .update(userSettings)
    .set({ ambientSound: "OFF", musicLinkId: null })
    .where(and(eq(userSettings.userId, userId), eq(userSettings.musicLinkId, linkId)));
  const rows = await db
    .delete(musicLinks)
    .where(and(eq(musicLinks.id, linkId), eq(musicLinks.userId, userId)))
    .returning({ id: musicLinks.id });
  if (rows.length === 0) return { error: "NOT_FOUND" };
  revalidatePath("/", "layout");
  return { ok: true };
}
