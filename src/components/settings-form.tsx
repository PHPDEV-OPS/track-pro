"use client";

import { useEffect, useSyncExternalStore, useTransition } from "react";
import { useTheme } from "next-themes";
import { updateSettings } from "@/actions/settings";
import type { MusicLink } from "@/db/schema";
import type { SoundChoice } from "@/lib/sounds";
import { THEMES, type Theme } from "@/lib/themes";
import { MusicLinks } from "./music-links";
import { SoundSelect, useSoundSettings } from "./sound-control";

const THEME_LABEL: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
  matrix: "Matrix",
  cyberpunk: "Cyberpunk",
};

/** Pushes the saved theme into next-themes once, so a new device picks up the account theme. */
export function ThemeSync({ theme }: { theme: string }) {
  const { setTheme, theme: current } = useTheme();
  useEffect(() => {
    if (current !== theme && (THEMES as readonly string[]).includes(theme)) setTheme(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
  return null;
}

const noop = () => () => {};

export const SETTINGS_SECTIONS = [
  { id: "timer", label: "Timer" },
  { id: "appearance", label: "Appearance" },
  { id: "sound", label: "Sound and music" },
  { id: "time", label: "Time and region" },
] as const;

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div>
        <h2 id={`${id}-title`} className="text-xl font-semibold">
          {title}
        </h2>
        {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** A small preview of a theme drawn with its own tokens, so it never drifts from globals.css. */
function Swatch({ theme }: { theme: Theme }) {
  if (theme === "system") {
    return (
      <span aria-hidden className="flex h-8 flex-1">
        <Swatch theme="light" />
        <Swatch theme="dark" />
      </span>
    );
  }
  return (
    <span aria-hidden data-theme={theme} className="flex h-8 flex-1 items-end gap-0.5 bg-background p-1.5 first:rounded-l-md last:rounded-r-md">
      <span className="h-2 w-2 rounded-sm bg-heat-2" />
      <span className="h-4 w-2 rounded-sm bg-accent" />
      <span className="h-3 w-2 rounded-sm bg-heat-3" />
    </span>
  );
}

export function SettingsForm({
  clockStyle,
  theme,
  timezone,
  choice,
  ambientVolume,
  musicLinks,
}: {
  clockStyle: "DIGITAL" | "WALL_CLOCK";
  theme: string;
  timezone: string;
  choice: SoundChoice;
  ambientVolume: number;
  musicLinks: MusicLink[];
}) {
  const { setTheme, theme: active } = useTheme();
  const [pending, start] = useTransition();
  const sound = useSoundSettings(choice, ambientVolume);
  const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [
    timezone,
  ];
  // The browser's stored theme is unknown on the server, so mark the account theme until hydrated.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const current = (hydrated ? (active ?? theme) : theme) as Theme;

  return (
    <div className="space-y-6">
      <Section id="timer" title="Timer">
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Clock style</legend>
          {(["DIGITAL", "WALL_CLOCK"] as const).map((c) => (
            <label
              key={c}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 text-sm has-checked:border-accent has-checked:bg-accent-soft"
            >
              <input
                type="radio"
                name="clock"
                defaultChecked={clockStyle === c}
                onChange={() => start(async () => void (await updateSettings({ clockStyle: c })))}
                className="accent-[var(--color-accent)]"
              />
              {c === "DIGITAL" ? "Digital, with a progress ring" : "Wall clock"}
            </label>
          ))}
        </fieldset>
      </Section>

      <Section id="appearance" title="Appearance" hint="Saved to your account, so every device matches.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={current === t}
              onClick={() => {
                setTheme(t);
                start(async () => void (await updateSettings({ theme: t })));
              }}
              className={`flex min-h-11 flex-col gap-2 rounded-lg border p-2 text-left text-sm ${
                current === t ? "border-accent bg-accent-soft" : "border-border hover:border-muted"
              }`}
            >
              <span className="flex w-full overflow-hidden rounded-md border border-border">
                <Swatch theme={t} />
              </span>
              {THEME_LABEL[t]}
            </button>
          ))}
        </div>
      </Section>

      <Section id="sound" title="Sound and music" hint="Plays while a session runs. You can also change it from the timer.">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-muted">Sound</span>
            <SoundSelect label="Sound" choice={sound.choice} links={musicLinks} onChange={sound.setChoice} />
          </label>
          <label className="flex flex-1 items-center gap-3">
            <span className="text-muted">Volume</span>
            <input
              type="range"
              min={0}
              max={100}
              value={sound.volume}
              disabled={sound.choice === "OFF"}
              aria-valuetext={`${sound.volume}%`}
              onChange={(e) => sound.setVolume(Number(e.target.value))}
              className="min-w-32 flex-1 accent-[var(--color-accent)] disabled:opacity-40"
            />
            <span className="w-9 text-right font-mono text-xs tabular-nums text-muted">{sound.volume}</span>
          </label>
        </div>
        <MusicLinks links={musicLinks} />
      </Section>

      <Section id="time" title="Time and region" hint="Decides which day a session counts toward.">
        <label className="block space-y-1 text-sm">
          <span className="text-muted">Timezone</span>
          <select
            defaultValue={timezone}
            onChange={(e) => start(async () => void (await updateSettings({ timezone: e.target.value })))}
            className="block h-11 w-full max-w-sm rounded-lg border border-border bg-background px-3"
          >
            {zones.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </label>
      </Section>
      <p className="h-5 text-sm text-muted" aria-live="polite">
        {pending ? "Saving..." : ""}
      </p>
    </div>
  );
}

/** Detects the browser timezone on first visit and stores it if the account still has the UTC default. */
export function TimezoneDetect({ timezone }: { timezone: string }) {
  useEffect(() => {
    if (timezone !== "UTC") return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && detected !== "UTC") void updateSettings({ timezone: detected });
  }, [timezone]);
  return null;
}
