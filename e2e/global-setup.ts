import { clerkSetup } from "@clerk/testing/playwright";

// Fetches a Clerk testing token so sign in skips bot protection.
export default async function globalSetup() {
  await clerkSetup({ publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY });
}
