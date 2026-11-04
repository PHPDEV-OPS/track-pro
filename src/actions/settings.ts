"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db";
import { musicLinks, userSettings } from "@/db/schema";
import { requireUser } from "@/lib/user";
import { STORED_SOUNDS } from "@/lib/sounds";
import { THEMES } from "@/lib/themes";

const schema = z.object({
  clockStyle: z.enum(["DIGITAL", "WALL_CLOCK"]).optional(),
  theme: z.enum(THEMES).optional(),
  timezone: z
    .string()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    })
    .optional(),
  ambientSound: z.enum(STORED_SOUNDS).optional(),
  ambientVolume: z.number().int().min(0).max(100).optional(),
  musicLinkId: z.string().min(1).nullish(),
})
  // A music pick always names its link, and a link only comes with MUSIC (spec 0005).
  .refine((d) => (d.ambientSound === "MUSIC") === Boolean(d.musicLinkId), {
    message: "MUSIC needs a musicLinkId, and a musicLinkId needs MUSIC",
  });

const SOUND_KEYS = new Set(["ambientSound", "ambientVolume", "musicLinkId"]);

export async function updateSettings(input: z.input<typeof schema>): Promise<void | { error: "NOT_FOUND" }> {
  const { musicLinkId, ...data } = schema.parse(input);
  const userId = await requireUser();
  if (Object.keys(data).length === 0 && musicLinkId === undefined) return;
  const set = { ...data, ...(data.ambientSound ? { musicLinkId: data.ambientSound === "MUSIC" ? musicLinkId! : null } : {}) };
  // A picked link must be the caller's own; checked in the same statement so it cannot race (AC-9).
  const owns = set.musicLinkId
    ? sql`exists (select 1 from ${musicLinks} where ${musicLinks.id} = ${set.musicLinkId} and ${musicLinks.userId} = ${userId})`
    : undefined;
  const rows = await getDb()
    .update(userSettings)
    .set(set)
    .where(and(eq(userSettings.userId, userId), owns))
    .returning({ id: userSettings.id });
  if (owns && rows.length === 0) return { error: "NOT_FOUND" };
  if (data.theme) {
    (await cookies()).set("theme", data.theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  // Sound changes only matter to the open tab, so skip re-rendering the dashboard while a slider drags.
  const soundOnly = Object.keys(set).every((k) => SOUND_KEYS.has(k));
  if (!soundOnly) revalidatePath("/", "layout");
}
