import { auth, currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { userSettings, users } from "@/db/schema";

/** Returns the signed in user's id, creating the user and settings rows on first call (AC-2). */
export async function requireUser(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("UNAUTHENTICATED");
  const db = getDb();
  const existing = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, userId) });
  if (existing) return userId;

  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    `${userId}@no-email.local`;
  await db.insert(users).values({ id: userId, email }).onConflictDoNothing();
  await db.insert(userSettings).values({ userId }).onConflictDoNothing();
  return userId;
}
