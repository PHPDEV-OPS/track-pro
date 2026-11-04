"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db";
import { userSettings } from "@/db/schema";
import { requireUser } from "@/lib/user";
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
});

export async function updateSettings(input: z.input<typeof schema>) {
  const data = schema.parse(input);
  const userId = await requireUser();
  if (Object.keys(data).length === 0) return;
  await getDb().update(userSettings).set(data).where(eq(userSettings.userId, userId));
  if (data.theme) {
    (await cookies()).set("theme", data.theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  revalidatePath("/", "layout");
}
