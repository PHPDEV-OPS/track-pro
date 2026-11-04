import type { Metadata } from "next";
import { getActiveSession } from "@/actions/session";
import { AppHeader } from "@/components/app-header";
import { FocusClock } from "@/components/focus-clock";
import { History } from "@/components/history";
import { ThemeSync, TimezoneDetect } from "@/components/settings-form";
import { getMusicLinks, getPeriodStats, getSettings } from "@/lib/queries";
import { choiceOf } from "@/lib/sounds";
import { requireUser } from "@/lib/user";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const userId = await requireUser();
  const settings = await getSettings(userId);
  // The view and period live in the address, so reloads, back and bookmarks keep them (spec 0004 AC-6).
  const { view, period } = await searchParams;
  const [session, stats, musicLinks] = await Promise.all([
    getActiveSession(),
    getPeriodStats(userId, settings.timezone, view, period),
    getMusicLinks(userId),
  ]);

  return (
    <>
      <AppHeader />
      <ThemeSync theme={settings.theme} />
      <TimezoneDetect timezone={settings.timezone} />
      {/* Split from 1024 px: the timer stays in view while history scrolls (spec 0006 AC-3). */}
      <main className="mx-auto grid w-full max-w-6xl flex-1 content-start items-start gap-6 px-4 py-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[400px_minmax(0,1fr)]">
        <FocusClock
          userId={userId}
          initialSession={session}
          clockStyle={settings.clockStyle}
          initialChoice={choiceOf(settings)}
          musicLinks={musicLinks}
          initialVolume={settings.ambientVolume}
        />
        <History stats={stats} />
      </main>
    </>
  );
}
