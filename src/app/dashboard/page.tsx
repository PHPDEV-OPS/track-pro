import type { Metadata } from "next";
import { getActiveSession } from "@/actions/session";
import { AppHeader } from "@/components/app-header";
import { FocusClock } from "@/components/focus-clock";
import { History } from "@/components/history";
import { ThemeSync, TimezoneDetect } from "@/components/settings-form";
import { getHeatmap, getSettings } from "@/lib/queries";
import { requireUser } from "@/lib/user";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await requireUser();
  const settings = await getSettings(userId);
  const [session, heatmap] = await Promise.all([getActiveSession(), getHeatmap(userId, settings.timezone)]);

  return (
    <>
      <AppHeader />
      <ThemeSync theme={settings.theme} />
      <TimezoneDetect timezone={settings.timezone} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6">
        <FocusClock initialSession={session} clockStyle={settings.clockStyle} />
        <History cells={heatmap.cells} />
      </main>
    </>
  );
}
