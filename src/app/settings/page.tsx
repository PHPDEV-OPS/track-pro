import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { SettingsForm } from "@/components/settings-form";
import { getSettings } from "@/lib/queries";
import { requireUser } from "@/lib/user";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUser();
  const s = await getSettings(userId);
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold">Settings</h1>
        <SettingsForm clockStyle={s.clockStyle} theme={s.theme} timezone={s.timezone} />
      </main>
    </>
  );
}
