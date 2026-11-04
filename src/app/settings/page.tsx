import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { SETTINGS_SECTIONS, SettingsForm } from "@/components/settings-form";
import { getMusicLinks, getSettings } from "@/lib/queries";
import { choiceOf } from "@/lib/sounds";
import { requireUser } from "@/lib/user";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUser();
  const [s, musicLinks] = await Promise.all([getSettings(userId), getMusicLinks(userId)]);
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
        {/* Sections on one page, with a list of section links from 1024 px (spec 0006 AC-9). */}
        <div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
          <nav aria-label="Settings sections" className="hidden lg:sticky lg:top-6 lg:block">
            <ul className="space-y-1 text-sm">
              {SETTINGS_SECTIONS.map((x) => (
                <li key={x.id}>
                  <a href={`#${x.id}`} className="block rounded-lg px-3 py-2 text-muted hover:bg-accent-soft hover:text-foreground">
                    {x.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="max-w-2xl">
            <SettingsForm
              clockStyle={s.clockStyle}
              theme={s.theme}
              timezone={s.timezone}
              choice={choiceOf(s)}
              musicLinks={musicLinks}
              ambientVolume={s.ambientVolume}
            />
          </div>
        </div>
      </main>
    </>
  );
}
